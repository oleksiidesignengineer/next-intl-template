# App Router и структура маршрутов

## Почему `[locale]` как корень всех маршрутов

Все страницы приложения живут под `src/app/[locale]/`. Это позволяет каждой странице получать локаль из URL как параметр сегмента — без дополнительных вызовов `cookies()` или `headers()`. Proxy (`src/proxy.ts`, бывший middleware в Next.js 16) определяет локаль и записывает её в URL; `[locale]` сегмент читает её оттуда.

## Корневой `src/app/layout.tsx`

```tsx
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
```

Next.js требует наличия root layout в `src/app/`. Но `<html>` и `<body>` размещать здесь нельзя — они живут в `[locale]/layout.tsx`, иначе будут дублироваться. Root layout просто пробрасывает `children` как есть, делегируя всё locale layout'у.

## `[locale]/layout.tsx` — построчный разбор

```tsx
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server'
import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { notFound } from 'next/navigation'
import { Toaster } from 'sonner'

import { type Locale, isRtl, routing } from '@/shared/i18n/routing'
import { OG_LOCALE } from '@/shared/seo/og-locale'
import { SiteHeader } from '@/widgets/site-header'

import '@/shared/styles/globals.css'

const geist = Geist({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-geist',
})

type Props = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

// Pre-render all locales at build time
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  const t = await getTranslations({ locale, namespace: 'home' })
  const ogLocale = OG_LOCALE[locale as Locale]
  return {
    title: {
      default: t('seo.title'),
      template: `%s | ${t('seo.title')}`,
    },
    description: t('seo.description'),
    openGraph: {
      type: 'website',
      locale: ogLocale,
      alternateLocale: Object.entries(OG_LOCALE)
        .filter(([code]) => code !== locale)
        .map(([, og]) => og),
      title: t('seo.title'),
      description: t('seo.description'),
    },
    twitter: {
      card: 'summary_large_image',
      title: t('seo.title'),
      description: t('seo.description'),
    },
  }
}

/**
 * Namespaces that any Client Component in the app might reference. Without
 * this filter, the FULL messages bundle ships to the client on every page.
 * When adding a new Client Component that uses translations, add its
 * namespace here.
 */
const CLIENT_NAMESPACES = [
  'common',
  'notFound',
  'error',
  'plurals',
  'formats',
  'contact',
] as const

type Messages = Record<string, unknown>

function pickNamespaces(messages: Messages, keys: readonly string[]): Messages {
  const result: Messages = {}
  for (const key of keys) {
    if (key in messages) result[key] = messages[key]
  }
  return result
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params

  // 1. Validate locale — unknown locales return 404
  if (!hasLocale(routing.locales, locale)) notFound()

  // 2. Enable static rendering.
  setRequestLocale(locale)

  const allMessages = (await getMessages()) as Messages
  const clientMessages = pickNamespaces(allMessages, CLIENT_NAMESPACES)

  return (
    <html
      lang={locale}
      dir={isRtl(locale) ? 'rtl' : 'ltr'}
      className={geist.variable}
    >
      <body className="min-h-screen flex flex-col antialiased">
        <NextIntlClientProvider messages={clientMessages}>
          <SiteHeader />
          <main className="flex-1 container mx-auto px-4 py-8">{children}</main>
          <Toaster position="top-right" richColors />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
```

### `params: Promise<{ locale: string }>` — почему `string`, а не `Locale`

В Next.js 16 типы `LayoutProps`/`PageProps` генерируются автоматически (`next typegen`) и задают `params` как `Promise<{ locale: string }>`. Поэтому в layout мы пишем `{ locale: string }`, а сужение до конкретной локали делаем в runtime через `hasLocale(routing.locales, locale)`.

> Можно ли указать `Promise<{ locale: Locale }>`? Технически да — `Locale` структурно присваиваем к `{ locale: string }`, и `page.tsx` в шаблоне так и делает ради эргономики (`locale` сразу типизирован union'ом). Если хочешь строго следовать сгенерированным `PageProps`, держи `string` и сужай через `hasLocale`. Главное — не рассчитывай, что `params` УЖЕ сужен: значение приходит как `string` и его надо валидировать.

### `generateStaticParams`

```ts
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}
```

Говорит Next.js сгенерировать страницы для каждой локали (`en`, `ru`, `uk`) на этапе build. Без этого страницы будут рендериться динамически при каждом запросе.

### `hasLocale(routing.locales, locale)` + `notFound()`

Валидирует, что запрошенная локаль есть в разрешённом списке. Если пришёл URL вроде `/de/...`, Next.js вернёт 404 вместо того, чтобы рендерить страницу с неверной локалью.

### `setRequestLocale(locale)`

Включает static rendering для данного server component. Без этого вызова next-intl переключит страницу в dynamic rendering, так как не сможет определить локаль статически.

### `NextIntlClientProvider` и bundle optimization

```tsx
<NextIntlClientProvider messages={clientMessages}>
  {children}
</NextIntlClientProvider>
```

В минимальной конфигурации `NextIntlClientProvider` работает **без пропсов** — он автоматически читает `locale` и `messages` из request context, настроенного `getRequestConfig`. Однако в этом случае весь словарь (все namespace'ы) отправляется клиенту с каждой страницей.

Шаблон явно передаёт `messages={clientMessages}`, где `clientMessages` — отфильтрованное подмножество сообщений, содержащее только namespace'ы нужные Client Components. Это сокращает клиентский бандл — лишний JSON (50–200 KB для большого словаря) не попадает в браузер. Функция `pickNamespaces` + константа `CLIENT_NAMESPACES` описаны выше в коде layout.

Подробнее о выборе namespace'ов — см. [03-translations.md](./03-translations.md).

## `setRequestLocale` — отдельно

`setRequestLocale` нужно вызывать **в каждом server page и layout** под `[locale]` — не только в locale layout, но и в каждой странице (`page.tsx`):

```ts
// src/app/[locale]/about/page.tsx
export default async function AboutPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)          // <-- обязательно
  const t = await getTranslations('about')
  // ...
}
```

**Что будет, если забыть** — страница выпадет из static rendering и будет рендериться динамически при каждом запросе. В dev-режиме next-intl выдаст предупреждение в консоли.

**В `generateMetadata` вызывать не нужно** — там локаль передаётся явно через `getTranslations({ locale, namespace })`, request context не используется.

### `setRequestLocale` и `rootParams` — статус

`setRequestLocale` — **стабильный** API next-intl, а не временная заглушка. Он кладёт локаль в request-scoped store next-intl (на базе React `cache()`), откуда её читают `getTranslations`/`getFormatter` без обращения к `params`. Сейчас вызов **обязателен** в каждом статически рендеримом server page/layout под `[locale]`.

Next.js 16 уже поставляет `next/root-params` (на смену удалённому `unstable_rootParams`), но он решает другую задачу — чтение значений корневых сегментов в Server Components — и **не заменяет** `setRequestLocale`. Пока next-intl не интегрирует root-params внутри себя, строку убрать нельзя. Прогресс отслеживается в [next-intl#58862](https://github.com/vercel/next.js/discussions/58862). Контекст изначальной идеи — [блог next-intl 4.0](https://next-intl.dev/blog/next-intl-4-0).

### Cache Components (`cacheComponents`) — на что обратить внимание

Шаблон **не** включает `cacheComponents` (бывший `dynamicIO`/PPR), поэтому ничего настраивать не нужно. Но если включишь его в `next.config.ts`, имей в виду:

- рендеринг по умолчанию становится динамическим, а статические части надо явно помечать через `'use cache'`;
- чтение request-API (`cookies()`, `headers()`) в layout требует обёртки `<Suspense>`;
- `setRequestLocale` + `generateStaticParams` остаются нужны, но статическая отдача страниц теперь зависит от `'use cache'` на соответствующих сегментах.

Включай осознанно и проверяй, что страницы под `[locale]` действительно отдаются статически (`next build` покажет тип каждого маршрута).

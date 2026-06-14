# Навигация

> Для динамических роутов с `[slug]` и паттерна `generateStaticParams` см. [11-dynamic-routes.md](./11-dynamic-routes.md).

## Три источника `Link` в проекте

| Что нужно | Откуда брать |
|---|---|
| Внутренние ссылки между страницами шаблона | `@/shared/ui/Link` |
| Ссылка на внешний URL | `next/link` или просто `<a>` |
| Ссылка по маршруту, который УЖЕ описан в `pathnames` и нужна compile-time типизация | `@/shared/i18n/navigation` напрямую |

### Почему обёртка `@/shared/ui/Link`

next-intl типизирует свой `Link` строго против ключей `pathnames` в `routing.ts`. Мы держим в `pathnames` только маршруты с разными URL по локалям (см. [08-pathnames](./08-pathnames.md)). Для остальных хочется писать `<Link href="/demo/plurals">` без TypeScript-ошибки.

Тонкая обёртка [`src/shared/ui/Link.tsx`](../src/shared/ui/Link.tsx) принимает `href: string` и кастует на границе:

```tsx
import { Link as I18nLink } from '@/shared/i18n/navigation'
import type { ComponentProps } from 'react'

type LinkProps = Omit<ComponentProps<typeof I18nLink>, 'href'> & {
  href: string
}

export default function Link({ href, ...rest }: LinkProps) {
  return <I18nLink href={href as never} {...rest} />
}
```

Runtime поведение идентично — next-intl сам разрулит локаль и `pathnames`-маппинг:

```tsx
import Link from '@/shared/ui/Link'

// На /ru отрендерится как <a href="/ru/o-nas">
// На /uk отрендерится как <a href="/uk/pro-nas">
<Link href="/about">О нас</Link>

// Просто префикс локали, без маппинга
<Link href="/demo/plurals">Плюралы</Link>

// Явная локаль — независимо от текущей
<Link href="/about" locale="ru">Switch to Russian</Link>
```

**Trade-off**: теряется compile-time проверка на опечатки в `href`. Если для какого-то маршрута эта проверка критична — добавь его в `pathnames` и импортируй `Link` напрямую из `@/shared/i18n/navigation`.

## `router.push(path, { locale })`

Программное переключение локали без перезагрузки страницы:

```tsx
'use client'
import { useRouter } from '@/shared/i18n/navigation'

const router = useRouter()

// Перейти на /about в локали ru → /ru/o-nas
router.push('/about', { locale: 'ru' })

// Остаться на той же странице, поменяв локаль
router.replace(pathname, { locale: 'uk' })
```

## `usePathname` без локального префикса

`usePathname` из `@/shared/i18n/navigation` возвращает **canonical внутренний путь** — без префикса локали и без локализованного сегмента.

Пример: пользователь находится на `/ru/o-nas`.

- `usePathname()` из `next/navigation` → `/ru/o-nas`
- `usePathname()` из `@/shared/i18n/navigation` → `/about`

Это критично для LangSwitcher: `router.replace('/about', { locale: 'uk' })` переведёт на `/uk/pro-nas`. Если бы `usePathname` вернул `/ru/o-nas`, ручная замена префикса дала бы `/uk/o-nas` — несуществующий URL.

## LangSwitcher — канонический паттерн

Разбор `src/features/locale-switch/ui/LangSwitcher.tsx`:

```tsx
'use client'

import { useLocale } from 'next-intl'
import { useParams, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { usePathname, useRouter } from '@/shared/i18n/navigation'
import { routing, type Locale } from '@/shared/i18n/routing'
import { LOCALE_NATIVE_NAMES } from '@/shared/config/locales'

function searchParamsToObject(params: URLSearchParams): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    result[key] = values.length === 1 ? values[0] : values
  }
  return result
}

export default function LangSwitcher() {
  const router = useRouter()
  const pathname = usePathname()   // canonical: '/about', а не '/ru/o-nas'
  const params = useParams()       // { locale: 'ru' } — нужен для динамических сегментов
  const current = useLocale()
  const [pending, startTransition] = useTransition()
  const searchParams = useSearchParams()

  return (
    <select
      value={current}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value as Locale
        const query = searchParamsToObject(searchParams)
        startTransition(() => {
          router.replace(
            // @ts-expect-error -- TypeScript проверяет соответствие params и pathname.
            // На текущем маршруте они всегда совпадают, но статически это не выводится.
            { pathname, params, query },
            { locale: next }
          )
        })
      }}
    >
      {routing.locales.map((loc) => (
        <option key={loc} value={loc}>{LOCALE_NATIVE_NAMES[loc]}</option>
      ))}
    </select>
  )
}
```

**Зачем `useParams` из `next/navigation`** — нужен для динамических сегментов (например, `/blog/[slug]`). Без него `router.replace` не знает значение `slug` и не сможет построить URL. Даже если на текущей странице нет динамических сегментов, передавать `params` — правильная привычка.

**Зачем `{ pathname, params, query }` объектом, а не строкой** — `router.replace` принимает либо строку (для маршрутов без параметров), либо объект. Объект нужен для случаев с динамическими сегментами. Поле `query` сохраняет текущий query string при смене локали.

**Зачем `searchParamsToObject` вместо `Object.fromEntries`** — `Object.fromEntries(searchParams.entries())` при мультизначных параметрах (`?tag=a&tag=b`) оставляет только последнее значение. `searchParamsToObject` через `getAll` сохраняет все значения, возвращая массив там, где их несколько. Без этого фильтрация на страницах с несколькими тегами ломается при смене языка.

**Зачем `@ts-expect-error`** — TypeScript знает все допустимые пары `(pathname, params)` из `pathnames` конфига. При передаче объекта он требует точного соответствия типов. На runtime всё правильно, но статически вывести это нельзя, поэтому подавляем ошибку.

**Зачем `useTransition`** — `router.replace` запускает навигацию асинхронно. `startTransition` помечает её как низкоприоритетное обновление, что позволяет React не блокировать UI во время перехода. `pending` используется для `disabled` на `<select>` — пользователь не может переключить язык дважды подряд пока идёт переход.

## `redirect` / `permanentRedirect` в Server Component

```ts
import { redirect } from '@/shared/i18n/navigation'

// В server page или Route Handler:
redirect({ href: '/about', locale: 'ru' })  // → /ru/o-nas (307)

import { permanentRedirect } from '@/shared/i18n/navigation'
permanentRedirect({ href: '/about', locale: 'en' })  // → /about (308)
```

Использовать вместо `redirect` из `next/navigation`, когда важно сохранить `pathnames` mapping. Next.js использует коды **307** (временный) и **308** (постоянный) вместо классических 302/301 — это сохраняет HTTP-метод запроса при редиректе (в Server Action `redirect` отдаёт 303).

## `getPathname` — вне React

Для случаев, где нет React context: sitemap, email-шаблоны, шеринг ссылок, скрипты.

```ts
import { getPathname } from '@/shared/i18n/navigation'

const url = `https://example.com${getPathname({ locale: 'ru', href: '/about' })}`
// → https://example.com/ru/o-nas

const ukUrl = `https://example.com${getPathname({ locale: 'uk', href: '/about' })}`
// → https://example.com/uk/pro-nas
```

`getPathname` уважает `pathnames` mapping из `routing.ts` — ручная конкатенация не справилась бы с локализованными сегментами.

## Known limitation: URL hash (anchor) теряется при смене языка

`router.replace({ pathname, params, query }, { locale })` не сохраняет hash (`#section`). Если пользователь на `/about#our-team` переключит язык, скролл-якорь пропадёт.

Это marginal use case — реально влияет только на длинные документы с TOC и landing-страницы с прыжками по разделам. Для типового приложения незаметно.

Если нужно — добавь в `LangSwitcher` после `router.replace`:

```tsx
const hash = typeof window !== 'undefined' ? window.location.hash : ''
// ... router.replace(...)
if (hash) {
  // После следующего render'а вернём якорь:
  requestAnimationFrame(() => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search + hash)
  })
}
```

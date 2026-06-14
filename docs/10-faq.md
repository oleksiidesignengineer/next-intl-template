# FAQ

## Я положил `<html>` в корневой `layout.tsx` и в `[locale]/layout.tsx` — почему два `<html>` в DOM?

Next.js требует корневой `app/layout.tsx`, но он должен возвращать только `{children}` без `<html>` и `<body>`. Эти теги должны быть только в `[locale]/layout.tsx` — там, где известен `lang`.

Правильная структура:

```tsx
// src/app/layout.tsx — корневой, БЕЗ html/body
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children
}
```

```tsx
// src/app/[locale]/layout.tsx — здесь html/body
export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
```

## `useTranslations` падает с ошибкой про Provider в Server Component

`useTranslations` — клиентский хук, работает только в Client Component (в файле с `'use client'`). В Server Component используй `getTranslations` из `next-intl/server`:

```ts
// Server Component — правильно
import { getTranslations } from 'next-intl/server'

export default async function Page() {
  const t = await getTranslations('home')
  return <h1>{t('title')}</h1>
}
```

```tsx
// Client Component — правильно
'use client'
import { useTranslations } from 'next-intl'

export default function Banner() {
  const t = useTranslations('home')
  return <p>{t('description')}</p>
}
```

## При смене языка URL содержит `/en` несмотря на `localePrefix: 'as-needed'`

`as-needed` означает «default локаль без префикса». Если `router.replace(pathname, { locale: 'en' })` всё равно добавляет `/en` — значит `pathname` пришёл с префиксом.

Проверить источник `pathname`:

```tsx
// Плохо — возвращает /ru/o-nas, включая префикс локали
import { usePathname } from 'next/navigation'

// Хорошо — возвращает /about, без префикса и локализованного сегмента
import { usePathname } from '@/shared/i18n/navigation'
```

Всегда используй `usePathname` из `@/shared/i18n/navigation` в LangSwitcher и любом месте, где pathname передаётся в `router.push/replace`.

## Hydration mismatch на относительных датах

`Date.now()` на сервере и клиенте возвращают разные значения — сервер рендерит «2 минуты назад», а клиент при гидрации получает другое время. React бросает hydration mismatch.

Решение — использовать `now` из request config на сервере и `useNow` на клиенте:

```tsx
// Server Component — now берётся из getRequestConfig (фиксированное значение)
import { getFormatter } from 'next-intl/server'

const format = await getFormatter()
format.relativeTime(date) // использует now из request.ts
```

```tsx
// Client Component — now обновляется с интервалом
'use client'
import { useFormatter, useNow } from 'next-intl'

export default function RelativeDate({ date }: { date: Date }) {
  const now = useNow({ updateInterval: 1000 }) // обновляет каждую секунду
  const format = useFormatter()
  return <span>{format.relativeTime(date, now)}</span>
}
```

В `src/shared/i18n/request.ts` `now: new Date()` задаётся один раз на момент запроса — это фиксирует значение для всего серверного рендера.

## Как разбить messages по фичам?

По умолчанию шаблон хранит все переводы в одном файле `src/shared/i18n/messages/<locale>.json`. Для больших проектов (>30 namespaces, разные команды владеют разными частями) имеет смысл разбить:

```
src/shared/i18n/messages/
  en/
    common.json
    home.json
    blog.json
  ru/
    common.json
    home.json
    blog.json
```

В `src/shared/i18n/request.ts` собирать через `deepMerge`:

```ts
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  if (typeof target !== 'object' || target === null) return source as T
  if (typeof source !== 'object' || source === null) return target
  const result: Record<string, any> = Array.isArray(target) ? [...target] : { ...target }
  for (const key of Object.keys(source)) {
    const sourceValue = source[key]
    const targetValue = (result as any)[key]
    if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
      result[key] = deepMerge(targetValue ?? {}, sourceValue)
    } else {
      result[key] = sourceValue
    }
  }
  return result as T
}
```

Использование в `getRequestConfig`:

```ts
const messages = deepMerge(
  (await import(`./messages/${locale}/common.json`)).default,
  (await import(`./messages/${locale}/home.json`)).default,
)
```

Когда оправдано: проект большой, несколько команд независимо обновляют переводы, и конфликты в одном файле становятся проблемой.

## Как интегрировать переводы из CMS (Sanity, Strapi, Contentful)?

**Паттерн A — загружать в `getRequestConfig`:**

```ts
export default getRequestConfig(async ({ requestLocale }) => {
  const locale = ...
  const messages = await fetch(`https://cms.example.com/translations/${locale}`)
    .then(res => res.json())
  return { locale, messages }
})
```

Все ключи доступны через `useTranslations` и `getTranslations` как обычно. Минус: HTTP-запрос к CMS на каждый request. В Next.js 16 `fetch` по умолчанию **НЕ** кешируется — чтобы не бить CMS на каждый запрос, включи кеш явно: `fetch(url, { cache: 'force-cache' })` или `{ next: { revalidate: 3600 } }`. Оправдано, только если переводы меняются редко.

**Паттерн B — загружать контент прямо в page:**

```tsx
export default async function BlogPage({ params }: Props) {
  const { locale } = await params
  const post = await fetch(`https://cms.example.com/posts/hello?locale=${locale}`)
    .then(res => res.json())
  return <article>{post.content}</article>
}
```

Переводы интерфейса (`useTranslations`) остаются в JSON-файлах, а динамический контент страницы берётся из CMS напрямую. Лучше для страниц с уникальным контентом на каждой локали.

Расширенный пример с реальным CMS-клиентом (Sanity/Contentful/Strapi):

```ts
// src/app/[locale]/blog/[slug]/page.tsx (упрощённый CMS-вариант)
import { client } from '@/shared/lib/cms'

export default async function BlogPostPage({ params }) {
  const { locale, slug } = await params
  setRequestLocale(locale)

  // CMS принимает locale и возвращает нужный язык контента
  const post = await client.fetch(
    `*[_type=="post" && slug.current==$slug && language==$locale][0]{
      title, body, excerpt
    }`,
    { slug, locale }
  )

  if (!post) notFound()

  // UI-переводы (кнопки, лейблы) — из next-intl
  const t = await getTranslations('blog')

  return <article>...</article>
}
```

Ключевое: next-intl отвечает за UI-строки (header, labels, errors), CMS отвечает за контент страниц.

## Как добавить новую локаль?

Чек-лист:

1. **`src/shared/i18n/routing.ts`** — добавить код в `locales` массив, и в `pathnames` если нужны локализованные пути для новой локали:
   ```ts
   locales: ['en', 'ru', 'uk', 'de'],
   ```

2. **`src/shared/i18n/messages/de.json`** — создать файл, зеркальный `en.json`. Скопировать и перевести все ключи. TypeScript проверяет только структуру `en.json`, а отсутствующие ключи в runtime покрываются fallback на `en` (через `loadMessages` в `request.ts` — см. [03-translations.md](./03-translations.md)). Структуру можно проверить `npm run check:translations`.

3. **`src/global.d.ts`** — ничего не делаем: `Locale` выведен из `routing.locales` и расширится автоматически:
   ```ts
   // global.d.ts — уже так, менять не нужно
   interface AppConfig {
     Locale: (typeof routing.locales)[number]
   }
   ```

4. **`src/shared/config/locales.ts`** — `LOCALE_NATIVE_NAMES` обновится автоматически: `Intl.DisplayNames` вычислит нативное название по коду локали (`'de'` → `'Deutsch'`). Проверь результат визуально; если автоматическое название не устраивает, переопредели вручную.

5. **Обновить OpenGraph маппинг** — добавить `de: 'de_DE'` в `OG_LOCALE` в `src/shared/seo/og-locale.ts`.

6. **Перезапустить dev server** — `generateStaticParams` пересоберёт статические параметры с новой локалью.

## LangSwitcher: почему нет флагов

Шаблон намеренно не использует эмодзи флагов. Вместо этого `LOCALE_NATIVE_NAMES` в `src/shared/config/locales.ts` содержит нативные названия языков — «English», «Русский», «Українська» — вычисленные через `Intl.DisplayNames`.

Причины такого выбора (они задокументированы в комментарии к файлу):

- Флаги **неоднозначны**: флаг страны ≠ язык. `🇬🇧` исключает Австралию, Канаду, США и другие англоязычные страны. Пользователи привыкли искать свой язык **читая его на родном языке** — именно так делают Google, Wikipedia, GitHub.
- Эмодзи флагов **не рендерятся** на части Windows-систем (шрифт Segoe UI Emoji не содержит государственные флаги).

Нативные названия через `Intl.DisplayNames` работают везде, не требуют поддержки и масштабируются на любые локали автоматически.

## Как делать переводы для модальных окон / тостов вне дерева?

**Тосты** (react-hot-toast, sonner и др.) вызываются из обработчиков событий, где нет React context. Переведённый текст нужно подготовить заранее:

```tsx
'use client'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

export default function DeleteButton({ id }: { id: string }) {
  const t = useTranslations('notifications')

  const handleDelete = async () => {
    await deleteItem(id)
    toast.success(t('deleted')) // текст переведён в момент вызова
  }

  return <button onClick={handleDelete}>Delete</button>
}
```

**Глобальные error handlers** (axios interceptor, WebSocket handler) — создать обёртку `useT()` и передавать функцию `t` в обработчик:

```tsx
'use client'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

export function ApiErrorHandler() {
  const t = useTranslations('errors')

  useEffect(() => {
    const handler = (event: CustomEvent) => {
      toast.error(t(event.detail.code ?? 'generic'))
    }
    window.addEventListener('api-error', handler as EventListener)
    return () => window.removeEventListener('api-error', handler as EventListener)
  }, [t])

  return null
}
```

Этот компонент монтируется один раз в layout и слушает глобальные события. `t` всегда актуален для текущей локали.

## «Как поддержать RTL-локали (арабский, иврит)?»

В шаблоне жёстко предполагается LTR (английский, русский, украинский). Для RTL-локалей нужно:

1. **Список RTL-локалей в `routing.ts`:**

   ```ts
   const RTL_LOCALES: ReadonlySet<string> = new Set(['ar', 'he', 'fa'])
   export const isRtl = (locale: string): boolean => RTL_LOCALES.has(locale)
   ```

   Хелпер `isRtl` и `RTL_LOCALES` **уже есть** в `src/shared/i18n/routing.ts` — сегодня множество пустое. Для добавления RTL-поддержки достаточно заполнить `Set`.

2. **`dir` атрибут на `<html>` в `[locale]/layout.tsx`:**

   ```tsx
   import { isRtl } from '@/shared/i18n/routing'

   return (
     <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'} ...>
   ```

3. **Tailwind v4** автоматически поддерживает `rtl:` модификаторы — `<div className="ml-4 rtl:ml-0 rtl:mr-4">`. Для систематического подхода используй [tailwindcss-rtl](https://github.com/20lives/tailwindcss-rtl) плагин или logical properties (`ms-4`, `me-4`).

4. **Шрифты** — `next/font/google` поддерживает арабские subsets:
   ```ts
   import { Cairo } from 'next/font/google'
   const cairo = Cairo({ subsets: ['arabic', 'latin'] })
   ```

5. **Иконки направлений** (стрелки back/next) — отзеркаль их через `rtl:rotate-180`.

## «Как делать email-шаблоны с переводами на нужный язык?»

`getTranslations()` работает на сервере не только внутри React. Можно использовать в любой server-only функции — например в Route Handler, который отправляет email:

```ts
// src/app/api/notify/route.ts
import { getTranslations } from 'next-intl/server'
import { sendEmail } from '@/shared/lib/email'

export async function POST(request: Request) {
  const { userId, locale } = await request.json()
  // 1. Получаем переводы на язык получателя (НЕ текущего пользователя API)
  const t = await getTranslations({ locale, namespace: 'emails.welcome' })

  await sendEmail({
    to: userId,
    subject: t('subject'),
    html: t('body', { name: 'Alex' }),
  })

  return Response.json({ ok: true })
}
```

Для HTML email с inline-форматированием используй `t.markup()` — возвращает строку с заменёнными тегами, без React:

```ts
t.markup('cta', {
  link: (chunks) => `<a href="https://example.com">${chunks}</a>`,
  strong: (chunks) => `<strong>${chunks}</strong>`,
})
// → "Click <a href='https://example.com'>here</a> to <strong>activate</strong>"
```

Локаль для email хранится в профиле получателя в БД, а не берётся из текущего request — пользователь Pro подписан на русские письма, даже если API дёрнули с английской UI.

## «Как тестировать переводы — pseudo-localization?»

Pseudo-localization заменяет все строки на «искажённые» версии, чтобы найти:
- Hardcoded английский текст в коде (не пройдёт через `t()`)
- UI, который не выдерживает удлинения текста на 30-50%
- Пропущенные namespaces

Реализуется обёрткой над `messages` в `request.ts`:

```ts
// src/shared/i18n/request.ts (фрагмент)
function pseudo(value: string): string {
  // Сохраняем ICU-placeholders: {name}, {count, plural, ...}
  return value.replace(/([^{}]+)(?=({|$))/g, (match) =>
    '⟦' + match.replace(/[aeiou]/g, (v) => ({ a: 'á', e: 'è', i: 'î', o: 'ö', u: 'ü' })[v]!) + '⟧'
  )
}

function pseudoize(obj: unknown): unknown {
  if (typeof obj === 'string') return pseudo(obj)
  if (Array.isArray(obj)) return obj.map(pseudoize)
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, pseudoize(v)])
    )
  }
  return obj
}

// ...
return {
  locale,
  messages: process.env.NEXT_PUBLIC_PSEUDO_L10N === 'true'
    ? (pseudoize((await import(`../messages/${locale}.json`)).default) as Messages)
    : (await import(`../messages/${locale}.json`)).default,
  // ...
}
```

Запускай dev с `NEXT_PUBLIC_PSEUDO_L10N=true npm run dev` — увидишь UI с `⟦Hèllö wörld⟧` вместо обычного текста. Любой не-pseudo текст = hardcoded строка, которую забыли провести через `t()`.

Альтернатива в продвинутых проектах — увеличить длину строк (мимикрировать немецкий перевод английского, который обычно на 30% длиннее) чтобы поймать overflow в UI.

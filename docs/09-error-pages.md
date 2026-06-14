# Error pages

## `error.tsx` — обязан быть Client Component

Next.js требует, чтобы `error.tsx` был Client Component, потому что React error boundary обязан быть клиентским — это фундаментальное ограничение React, а не следствие конкретного пропа.

Для восстановления компонент получает проп **`unstable_retry`** (добавлен в Next.js 16.2): он пере-фетчит и пере-рендерит сегмент error boundary — то, что нужно при transient-ошибках (сетевой сбой и т.п.). Старый проп `reset` лишь сбрасывает состояние ошибки без повторного fetch; официальные доки Next.js теперь рекомендуют `unstable_retry` в большинстве случаев.

`useTranslations` здесь работает, потому что `NextIntlClientProvider` стоит выше в `[locale]/layout.tsx` и оборачивает всё дерево.

Реальный код из `src/app/[locale]/error.tsx`:

```tsx
'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

type Props = {
  error: Error & { digest?: string }
  unstable_retry: () => void
}

export default function ErrorBoundary({ error, unstable_retry }: Props) {
  const t = useTranslations('error')

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <section className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-gray-500">{t('description')}</p>
      <button type="button" onClick={() => unstable_retry()}>
        {t('tryAgain')}
      </button>
    </section>
  )
}
```

> `unstable_` в имени — проп ещё может измениться в будущих версиях Next.js. Если предпочитаешь стабильный API, можно остаться на `reset` (`reset: () => void`, `onClick={reset}`) — но тогда без повторного fetch.

## `not-found.tsx` в `[locale]/`

Ловит вызовы `notFound()` из двух источников:

1. `[locale]/layout.tsx` — когда `hasLocale(routing.locales, locale)` вернула `false` (URL содержит неизвестную локаль).
2. Любой server page внутри `[locale]/` — когда данные не найдены (например, запись блога с таким `slug` не существует).

Реальный код из `src/app/[locale]/not-found.tsx`:

```tsx
'use client'

// 'use client' is required: useTranslations is a client-only hook,
// and not-found.tsx cannot remain a Server Component when it uses it.

import { useTranslations } from 'next-intl'
import Link from '@/shared/ui/Link'

export default function NotFound() {
  const t = useTranslations('notFound')
  return (
    <section className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="text-8xl font-bold text-gray-200">404</div>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-gray-500">{t('description')}</p>
      <Link href="/" className="text-blue-600 hover:underline">
        {t('home')}
      </Link>
    </section>
  )
}
```

Файл помечен `'use client'` потому что `useTranslations` — клиентский хук. Если нужен Server Component, используй `getTranslations` из `next-intl/server`.

## Два файла not-found: как они работают вместе

В шаблоне есть **два** файла not-found, и каждый покрывает свой сценарий.

### `src/app/[locale]/not-found.tsx` — локализованная 404

Срабатывает только когда `notFound()` вызван **явно** из страницы внутри `[locale]` сегмента. Типичный сценарий — страница блога с неизвестным slug:

```ts
// src/app/[locale]/blog/[slug]/page.tsx
const post = await getPostBySlug(slug)
if (!post) notFound()  // → [locale]/not-found.tsx
```

Этот компонент работает **внутри locale layout** — `NextIntlClientProvider` стоит выше в дереве, поэтому `useTranslations` доступен. Страница 404 будет переведена на язык пользователя (русский, украинский и т.д.).

### `src/app/not-found.tsx` — стандартный root not-found

Срабатывает когда URL вообще не соответствует ни одному маршруту — например `/ru/foobar`. Next.js обходит `[locale]` сегмент целиком и рендерит этот файл напрямую.

Это **стандартный** корневой `not-found.tsx` (встроенная конвенция Next.js с v13.3), а **не** экспериментальный `global-not-found.js` — тот требует флага `experimental.globalNotFound` и нужен лишь при нескольких root layouts (в шаблоне не используется).

Этот компонент рендерится **вне любого locale context** — `useTranslations` здесь недоступен (нет `NextIntlClientProvider` выше). Поэтому используется хардкоженный английский текст и ссылка на `/` (proxy сделает редирект на правильную локаль):

```tsx
import Link from 'next/link'

export default function RootNotFound() {
  return (
    <html lang="en">
      <body ...>
        <main ...>
          <h1>404</h1>
          <p>Page not found</p>
          <Link href="/">Go home</Link>
        </main>
      </body>
    </html>
  )
}
```

Обратите внимание: файл предоставляет собственные `<html>`/`<body>` — потому что корневой `src/app/layout.tsx` намеренно возвращает только `{children}`, делегируя эти теги locale layout.

### Итоговая схема маршрутизации 404

| URL | Какой файл рендерится | Переводы |
|---|---|---|
| `/ru/blog/non-existent-post` (после явного `notFound()`) | `[locale]/not-found.tsx` | Доступны (`useTranslations`) |
| `/ru/foobar` (нет такого маршрута) | `src/app/not-found.tsx` | Недоступны (английский fallback) |

### Опционально: локализованная 404 и для несуществующих URL

Сейчас `/ru/foobar` показывает английский root-404. Чтобы несовпавшие URL **внутри локали** тоже отдавали переведённую страницу, next-intl рекомендует добавить catch-all сегмент, который явно зовёт `notFound()` — тогда сработает локализованный `[locale]/not-found.tsx`:

```tsx
// src/app/[locale]/[...rest]/page.tsx
import { notFound } from 'next/navigation'

export default function CatchAll() {
  notFound()
}
```

Шаблон такой роут **не** добавляет (английский root-404 — разумный дефолт), но если важен полностью локализованный 404 — это стандартный приём.

## Логирование ошибок

Текущая реализация:

```tsx
useEffect(() => {
  console.error(error)
}, [error])
```

На dev-окружении этого достаточно — ошибка видна в браузерном консоле.

**В проде** заменить на реальный трекинг:

```tsx
useEffect(() => {
  Sentry.captureException(error, {
    extra: { digest: error.digest },
  })
}, [error])
```

**Что показывать пользователю vs что слать в Sentry:**
- Пользователю — переведённое сообщение из `t('description')`, никаких технических деталей.
- В Sentry — `error.digest`: это короткий хеш, который Next.js генерирует для серверных ошибок. По нему можно найти полный stack trace в логах сервера, не выдавая его клиенту.

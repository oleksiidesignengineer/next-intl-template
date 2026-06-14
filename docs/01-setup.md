# Установка и конфигурация

## Установка

```bash
npm install next-intl
```

Версия в шаблоне — `^4.12.0`. Next-intl 4 требует Next.js ≥ 15 и React ≥ 19.

## `next.config.ts` и `createNextIntlPlugin`

```ts
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin()

const nextConfig: NextConfig = {}

export default withNextIntl(nextConfig)
```

`createNextIntlPlugin()` без аргументов ищет файл конфигурации по умолчанию (`./i18n/request.ts` или `./src/i18n/request.ts`). В шаблоне он лежит в `src/shared/i18n/request.ts`, поэтому путь передаётся явно:

```ts
const withNextIntl = createNextIntlPlugin('./src/shared/i18n/request.ts')
```

Плагин регистрирует путь к request-конфигу и подключает нужный build-transform, чтобы серверные `getTranslations`/`getFormatter` и клиентские хуки получали конфигурацию запроса.

> **Turbopack по умолчанию.** В Next.js 16 `next dev` и `next build` используют Turbopack без флага `--turbopack` (скрипты шаблона это уже учитывают). `createNextIntlPlugin` совместим с Turbopack. Шаблон не задаёт кастомный `webpack`-конфиг; если добавишь свой — `next build` под Turbopack упадёт, пока не перейдёшь на `turbopack`-опции или не соберёшься с флагом `--webpack`.

## `src/shared/i18n/routing.ts`

Центральная точка конфигурации маршрутизации. Все остальные файлы импортируют `routing` отсюда.

```ts
import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'ru', 'uk'],
  defaultLocale: 'en',
  localePrefix: 'as-needed',
  localeDetection: true,
  pathnames: {
    '/about': { en: '/about', ru: '/o-nas', uk: '/pro-nas' },
  },
})

export type Locale = (typeof routing.locales)[number]
```

> Routes whose URL is identical across locales (`/blog`, `/contact`, etc.) don't need entries — next-intl just prefixes the locale automatically. See [08-pathnames.md](./08-pathnames.md).

### Опции `defineRouting`

| Опция | Тип | Что делает |
|---|---|---|
| `locales` | `string[]` | Список поддерживаемых локалей |
| `defaultLocale` | `string` | Локаль по умолчанию (без префикса при `as-needed`) |
| `localePrefix` | `'always' \| 'as-needed' \| 'never'` | Поведение префикса в URL |
| `localeDetection` | `boolean` | Авто-определение локали по cookie `NEXT_LOCALE` и заголовку `Accept-Language` |
| `pathnames` | `Record<string, string \| Record<Locale, string>>` | Локализованные URL-сегменты для каждой локали |

Подробнее про сохранение пользовательского выбора локали (cookie `NEXT_LOCALE`, Route Handler, Server Action) — см. [13-locale-persistence.md](./13-locale-persistence.md).

### Cookie запоминания локали

next-intl proxy (`src/proxy.ts`) сохраняет выбор пользователя в cookie `NEXT_LOCALE` автоматически — при следующем визите cookie уважается ПЕРЕД `Accept-Language`. В `routing.ts` атрибуты cookie можно сконфигурировать явно:

```ts
localeCookie: {
  name: LOCALE_COOKIE_NAME,     // экспортируем константу, чтобы Route Handler читал то же имя
  maxAge: 60 * 60 * 24 * 365,   // 1 год
}
```

Дефолт next-intl — имя `NEXT_LOCALE` и `sameSite: 'lax'`, но **без `maxAge`**: это session-cookie (намеренно, ради GDPR), которая исчезает при закрытии браузера. Шаблон явно задаёт `maxAge` в 1 год, чтобы выбор локали переживал перезапуск — это сознательное изменение поведения, а не повтор дефолта. Если есть программный Route Handler, который тоже ставит cookie ([13-locale-persistence](./13-locale-persistence.md)) — он должен импортировать `LOCALE_COOKIE_NAME` из `routing.ts`, иначе имена могут разойтись.

### Стратегии `localePrefix`

| Стратегия | URL для default | URL для других | Когда выбирать |
|---|---|---|---|
| `always` | `/en` | `/ru` | Простой кэш на CDN, одинаковая структура для всех локалей |
| `as-needed` | `/` | `/ru` | Чистый URL для основного рынка (используется в шаблоне) |
| `never` | `/` | `/` | Локаль из cookie/header, URL без каких-либо префиксов |

## `src/shared/i18n/request.ts`

```ts
import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale

  return {
    locale,
    messages: await loadMessages(locale), // активная локаль + fallback на defaultLocale
    timeZone: 'Europe/Kyiv',
    now: new Date(),
    formats, // экспортируется, чтобы augment-ить AppConfig['Formats'] в global.d.ts
    onError(error) { /* ... */ },
    getMessageFallback({ namespace, key }) { /* ... */ },
  }
})
```

`loadMessages` грузит словарь активной локали и накладывает его поверх словаря `defaultLocale` (глубокий merge), поэтому ключ, отсутствующий в `ru.json`/`uk.json`, показывается на дефолтной локали, а не как путь ключа. Подробнее про fallback — [03-translations.md](./03-translations.md).

Что возвращает `getRequestConfig`:

| Поле | Назначение |
|---|---|
| `locale` | Валидированная локаль запроса |
| `messages` | Объект переводов: активная локаль с fallback на `defaultLocale` для отсутствующих ключей |
| `timeZone` | Глобальный часовой пояс для форматирования дат |
| `now` | Фиксированный момент времени для `relativeTime` (стабильная гидратация) |
| `formats` | Глобальные шаблоны форматирования (дата, число, валюта) |

### Логирование missing translations: `onError` и `getMessageFallback`

Шаблон конфигурирует обе callback'и в `getRequestConfig`:

```ts
import { IntlErrorCode } from 'next-intl'

onError(error) {
  // Настоящее misuse API логируем; в продакшене подключи Sentry или tracker.
  if (error.code !== IntlErrorCode.MISSING_MESSAGE) {
    console.error('[next-intl] API misuse:', error)
    return
  }
  // Missing-message ожидаемы в разработке — логируем только в dev.
  if (process.env.NODE_ENV === 'development') {
    console.warn('[next-intl] Missing translation:', error.message)
  }
},
getMessageFallback({ namespace, key }) {
  const path = [namespace, key].filter(Boolean).join('.')
  // В dev делаем missing translation ВИДНЫМ в UI — легче заметить пропуски.
  if (process.env.NODE_ENV === 'development') {
    return `[!${path}]`
  }
  return path
}
```

В dev пропущенный ключ логируется как `console.warn('[next-intl] Missing translation: …')` и выглядит как `[!plurals.intro]` в UI. В продакшене падает на key path (читаемо, не падает компонент).

Поскольку шаблон делает fallback на `defaultLocale` (`request.ts` → `loadMessages`), сюда попадают только ключи, отсутствующие И в активной локали, И в дефолтной. Без этих callback'ов next-intl **тихо** возвращает путь ключа как строку — пропавший перевод можно не заметить, пока пользователь не пожалуется.

**Почему `requestLocale` нужно `await`** — в App Router `params` передаётся как `Promise`, чтобы Next.js мог параллельно разрешать сегменты маршрута. `requestLocale` следует той же схеме.

**Почему `now: new Date()`** — `Date.now()` на сервере и клиенте вернут разные значения, что вызовет hydration mismatch при `relativeTime`. Фиксируя `now` на момент render-запроса, оба окружения получают одно значение. Для динамического обновления на клиенте используй `useNow({ updateInterval: 1000 })` — подробнее в [05-formatting.md](./05-formatting.md).

## `src/shared/i18n/navigation.ts`

```ts
import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
```

`createNavigation` возвращает типизированные обёртки над стандартными Next.js примитивами:

| Экспорт | Где использовать | Что даёт |
|---|---|---|
| `Link` | Client / Server Component | `href` автоматически добавляет префикс локали и разворачивает `pathnames` |
| `redirect` | Server Component | Редирект с учётом текущей локали |
| `useRouter` | Client Component | `router.push/replace` с опцией `{ locale }` |
| `usePathname` | Client Component | Canonical pathname без префикса локали |
| `getPathname` | Server / sitemap | Разворачивает pathname для конкретной локали |

Всегда импортируй эти примитивы из `@/shared/i18n/navigation`, а не из `next/navigation` — иначе `pathnames` mapping не применится.

## `src/proxy.ts`

В Next.js 16 файл middleware переименован из `middleware.ts` в `proxy.ts`. Содержимое идентично:

```ts
import createMiddleware from 'next-intl/middleware'
import { routing } from './shared/i18n/routing'

export default createMiddleware(routing)

export const config = {
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
}
```

**Разбор matcher'а** — регулярное выражение пропускает запросы к:
- `api` — API routes, не нуждаются в i18n-редиректе;
- `_next` — статика Next.js (JS-бандлы, CSS);
- `_vercel` — системные роуты Vercel;
- `.*\\..*` — файлы с расширением (`.ico`, `.png`, `.svg` и т.д.).

Все остальные запросы проходят через proxy, который определяет локаль и при необходимости редиректит.

### Композиция с auth middleware

Если позже нужен auth, оберни `createMiddleware` вручную:

```ts
import createIntlMiddleware from 'next-intl/middleware'
import { type NextRequest, NextResponse } from 'next/server'
import { routing } from './shared/i18n/routing'

const intl = createIntlMiddleware(routing)

export default function proxy(request: NextRequest) {
  // 1. Auth check на ранних роутах
  if (request.nextUrl.pathname.startsWith('/admin')) {
    const session = request.cookies.get('session')
    if (!session) return NextResponse.redirect(new URL('/login', request.url))
  }
  // 2. Затем i18n (всегда возвращает валидный response)
  return intl(request)
}

export const config = {
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
}
```

Auth проверяется первым — если пользователь не авторизован, он уходит на `/login` до того, как i18n middleware успевает добавить префикс локали.

# Установка и конфигурация

Здесь собраны файлы, которые подключают next-intl к Next.js: что в каждом из них, почему так и на какие грабли наступают при переносе. Структура маршрутов (`[locale]` как root layout, `generateStaticParams`, Cache Components) описана в [02-app-router.md](./02-app-router.md), перенос в существующий проект — в [PORTABILITY.md](./PORTABILITY.md).

```
next.config.ts                     createNextIntlPlugin: путь к request.ts + типы сообщений; globalNotFound
tsconfig.json                      allowArbitraryExtensions (для en.d.json.ts)
src/proxy.ts                       next-intl middleware: локаль, редиректы, rewrite, cookie
src/global.d.ts                    AppConfig: Messages, Locale, Formats
src/shared/i18n/routing.ts         локали, префиксы, pathnames — общий конфиг proxy и навигации
src/shared/i18n/request.ts         локаль из next/root-params, messages, formats, обработка ошибок
src/shared/i18n/navigation.ts      Link, redirect, useRouter, getPathname… + localizePath
src/shared/i18n/messages/*.json    переводы; en.json — source of truth
src/app/[locale]/layout.tsx        корневой layout (src/app/layout.tsx нет — см. 02)
```

## 1. Установка

```bash
npm install next-intl
```

Версии всего стека — в [package.json](../package.json). Для схемы шаблона критична нижняя граница Next.js: она держится на `next/root-params`, а он включён по умолчанию с **Next.js 16.3**. По документации next-intl, в более ранних версиях его включает `experimental.rootParams`; на ещё более старых остаётся legacy-схема с `setRequestLocale`, и этот шаблон к ним как есть не подходит.

## 2. `src/shared/i18n/routing.ts`

Общий конфиг маршрутизации. Его импортируют proxy, навигационные API (в том числе клиентские), `scripts/check-translations.ts` (обычный Node через `tsx`), e2e-фикстуры Playwright и SEO-хелперы. Поэтому в нём нет серверных зависимостей, и добавлять их туда нельзя. Всё серверное живёт в `request.ts`.

```ts
export const routing = defineRouting({
  locales: ['en', 'ru', 'uk'],
  defaultLocale: 'en',
  // The default locale is served without a prefix (`/about`), the others
  // with one (`/ru/o-nas`). Trade-offs vs 'always': docs/08-pathnames.md.
  localePrefix: 'as-needed',
  // Every UNPREFIXED URL (`/`, `/about`) redirects by NEXT_LOCALE cookie, then
  // Accept-Language: a Russian browser opening /about lands on /ru/o-nas.
  localeDetection: true,
  // NEXT_LOCALE stays a session cookie (next-intl's default). The proxy sets
  // it on document requests whose locale differs from the cookie or from
  // Accept-Language — e.g. an English browser landing on /ru/… from search —
  // so also for visitors who never chose a language, and a long-lived cookie
  // becomes a consent question (GDPR/ePrivacy).
  // To persist the choice across browser restarts, opt in explicitly:
  //   localeCookie: { maxAge: 60 * 60 * 24 * 365 }
  // See docs/13-locale-persistence.md.
  //
  // hreflang is emitted by page metadata and sitemap.xml with the canonical
  // SITE_URL (src/shared/seo). The proxy's `Link` header would duplicate it
  // using the request host, which differs behind reverse proxies/previews.
  alternateLinks: false,
  // Only routes whose URL DIFFERS across locales belong here. Routes with
  // identical URLs work without an entry — next-intl just prefixes the locale.
  // For typed-Link DX with this minimal pathnames map, see @/shared/ui/Link.
  pathnames: {
    '/about': { en: '/about', ru: '/o-nas', uk: '/pro-nas' },
  },
})
```

| Опция | В шаблоне | Дефолт next-intl | Почему так |
|---|---|---|---|
| `localePrefix` | `'as-needed'` | `'always'` | Основная локаль без префикса (`/about`), остальные с ним (`/ru/o-nas`). Компромиссы — ниже. |
| `localeDetection` | `true` | `true` | Задано явно, чтобы контракт был виден. |
| `localeCookie` | не задан | `{ name: 'NEXT_LOCALE', sameSite: 'lax' }`, без `maxAge` | Сессионная cookie. Годовая — осознанный opt-in, см. ниже. |
| `alternateLinks` | `false` | `true` | hreflang отдают metadata и `sitemap.xml` от `SITE_URL`. Заголовок `Link` из proxy строится от хоста запроса (`x-forwarded-host`/`host`), а за reverse proxy и на preview-доменах он другой. |
| `pathnames` | только `/about` | — | Сюда попадают только маршруты с разными URL по локалям. Почему не все — [08-pathnames.md](./08-pathnames.md). |

**Компромиссы `as-needed`.** URL без префикса не закреплён за основной локалью. Proxy применяет к нему определение языка: сначала cookie, потом `Accept-Language`. Это касается любого такого URL, а не только `/`. Поэтому ссылка `/about`, отправленная браузеру с `Accept-Language: ru` и без cookie, получит `307 → /ru/o-nas`. Лишний префикс основной локали убирается редиректом: `/en/about → 307 /about`. Явно выбрать английский можно только через `/en/...` (proxy запишет `NEXT_LOCALE=en` и уберёт префикс) или уже стоящую cookie `NEXT_LOCALE=en`. `<Link locale>` и `router.replace(..., { locale })` при смене локали ведут на путь с префиксом и сами пишут cookie на клиенте. Когда вместо этого брать `'always'` или выключать `localeDetection`, а также опции, которых в шаблоне нет (`domains`, `prefixes`, `localeCookie: false`, `basePath`, `trailingSlash`), разобрано в [08-pathnames.md](./08-pathnames.md).

**Cookie `NEXT_LOCALE`.** Proxy ставит cookie только на document-запросах (`Sec-Fetch-Dest: document` или запрос без этого заголовка; фоновые запросы роутера с `Sec-Fetch-Dest: empty` её не трогают), и только когда локаль запроса расходится с cookie или, если cookie нет, с `Accept-Language`. Значит, её получает и посетитель, который ничего не выбирал, а просто открыл `/ru`-ссылку. Отсюда дефолт без `maxAge`: долгоживущая cookie — вопрос согласия (GDPR/ePrivacy). При soft-навигации через `Link`/`useRouter` из `@/shared/i18n/navigation` cookie ставит клиент. Замеры, условия из исходника next-intl и язык пользователя после логина — в [13-locale-persistence.md](./13-locale-persistence.md).

**RTL.** Направление текста задаёт не `routing.ts`, а `TEXT_DIRECTION` в [src/shared/config/locales.ts](../src/shared/config/locales.ts): `Record<Locale, 'ltr' | 'rtl'>`. Layout ставит по нему `<html dir={TEXT_DIRECTION[locale]}>`. Из-за типа `Record` новая локаль в `routing.locales` даёт ошибку tsc, пока для неё не выбрано направление (для арабского или иврита это `'rtl'`).

## 3. `src/shared/i18n/request.ts`

Конфиг запроса для серверного кода: Server Components, `generateMetadata`, Server Actions. next-intl оборачивает его в React `cache()`: в пределах одного запроса функция выполняется один раз на каждое значение `locale`-override.

### Откуда берётся локаль

```ts
export default getRequestConfig(async ({ locale }) => {
  // `locale` is an explicit override from the caller — e.g.
  // getTranslations({ locale, namespace }) in a Server Action or Route
  // Handler, where next/root-params is not available (Next.js plans support
  // for Route Handlers only).
  if (!locale) {
    // The value of the [locale] segment of the root layout. Works during
    // static rendering — no setRequestLocale needed in pages/layouts.
    const param = await rootParams.locale()
    if (!hasLocale(routing.locales, param)) notFound()
    locale = param
  }
```

- **`rootParams.locale()`** возвращает значение сегмента `[locale]`. Сегмент должен принадлежать **корневому** layout, поэтому `src/app/layout.tsx` в шаблоне нет: если вернуть pass-through layout, `[locale]` перестанет быть root param, и `next typegen` запишет в `.next/types/root-params.d.ts` `// No root params detected.` вместо `export function locale(): Promise<string>`. Типы `next/root-params` генерируют `next dev`, `next build` и `next typegen`. Подробнее — в [02-app-router.md](./02-app-router.md).
- **Аргумент `locale`** — явный override от вызывающего: `getTranslations({ locale, namespace })`, `getFormatter({ locale })`. Он нужен там, где root params недоступны: в Server Actions, Route Handlers и метаданных-картинках (`opengraph-image`). Без явной локали Server Action и Route Handler отвечают 500, а `opengraph-image` валит `next build` (`` used `import('next/root-params').locale()` inside a Route Handler ``). Паттерн с `.bind(null, locale)` описан в [12-server-actions.md](./12-server-actions.md).
- **`notFound()` для неизвестного значения.** Через proxy сюда невалидная локаль не попадает: `/xx/about` proxy считает путём без префикса и отдаёт локализованную 404 через `[locale]/[...rest]`. Невалидное значение приходит только с путями, которые matcher пропускает мимо proxy (`/api/foo`, `/blog/v1.2`), и такую 404 показывает корневая `src/app/not-found.tsx`. Какой URL какую 404 получает — таблица в [09-error-pages.md](./09-error-pages.md#какой-url-куда-попадает).
- **Не деструктурируй `requestLocale`.** Это геттер, который читает `headers()`, и весь сайт уходит в динамический рендеринг. Вместе с `setRequestLocale` он deprecated и в шаблоне не нужен ([02-app-router.md](./02-app-router.md#setrequestlocale-и-requestlocale-больше-не-нужны)). `generateStaticParams` в `[locale]/layout.tsx` нужен по-прежнему.

### Что возвращает конфиг

| Поле | В шаблоне | Зачем |
|---|---|---|
| `locale` | из root params или override | Валидированная локаль, тип `Locale` (см. `global.d.ts`). |
| `messages` | `await loadMessages(locale)` | Словарь локали, наложенный deep-merge на `en.json`. Ключ, которого нет в `ru.json`, показывается по-английски, а не путём `ns.key`. Сам next-intl между локалями не откатывается. Подробнее — [03-translations.md](./03-translations.md). |
| `timeZone` | `'Europe/Kyiv'` | Без него next-intl берёт часовой пояс сервера (`Intl.DateTimeFormat().resolvedOptions().timeZone`), а на хостинге это обычно UTC. Клиентский провайдер наследует значение с сервера. |
| `now` | `new Date()` | На статических страницах это **время сборки**, а не время запроса. Оно нужно, чтобы первый рендер клиентского `useNow()`/`relativeTime` совпал с HTML при гидратации, после чего `useNow({ updateInterval })` его обновляет. С `cacheComponents` его нужно убрать: `new Date()` при пререндере валит сборку. Подробнее — [05-formatting.md](./05-formatting.md). |
| `formats` | `formats` (`satisfies Formats`) | Именованные форматы `short`, `long`, `withTime`, `currency`, `percent`. Имя, совпадающее со встроенным ICU-стилем, перекрывает его и в сообщениях (`{date, date, long}`). Подробнее — [05-formatting.md](./05-formatting.md). |
| `onError`, `getMessageFallback` | см. ниже | Действуют **только на сервере**. |

### Ошибки: `onError` и `getMessageFallback`

Если ничего не настраивать, next-intl пишет ошибку в `console.error` и рендерит `namespace.key`. Пропущенный перевод не проходит молча, он попадает в лог. Шаблон меняет две вещи:

```ts
    onError(error) {
      if (error.code === IntlErrorCode.MISSING_MESSAGE) {
        // Missing keys are already backfilled from the default locale (see
        // loadMessages), so reaching this means the key is missing in en.json
        // too — a real bug, not an untranslated string.
        console.error('[next-intl] Missing message:', error.message)
        return
      }
      // Wire both branches to your error tracker (Sentry, etc.) in production.
      console.error('[next-intl]', error)
    },
    // Only applies to Server Components: functions can't cross to the client,
    // so Client Components use next-intl's default (`namespace.key`).
    getMessageFallback({ namespace, key }) {
      const path = [namespace, key].filter(Boolean).join('.')
      return process.env.NODE_ENV === 'development' ? `[!${path}]` : path
    },
```

- `MISSING_MESSAGE` после fallback на `en.json` означает, что ключа нет и в исходном словаре. Это баг, а не непереведённая строка, поэтому он логируется как ошибка в любом окружении. Остальные коды (ошибка форматирования, неверные ICU-аргументы) — тоже баги. Обе ветки нужно подключить к трекеру.
- В dev пропущенный ключ виден в UI как `[!about.body]`, в production рендерится `about.body`.
- **Только Server Components.** Функции не сериализуются, поэтому `NextIntlClientProvider` не передаёт их на клиент. В Client Component пропущенный ключ отработает по дефолту: `console.error` и `namespace.key`, без маркера `[!…]`. Чтобы маркер работал и на клиенте, нужен отдельный клиентский провайдер с этими функциями (документация next-intl: [How can I provide non-serializable props like `onError` to `NextIntlClientProvider`?](https://next-intl.dev/docs/usage/configuration#nextintlclientprovider-non-serializable-props)). В шаблоне его нет: e2e-фикстура валит тест на любой `console.error`, и клиентский `MISSING_MESSAGE` ловится там ([14-testing.md](./14-testing.md)).

## 4. `src/shared/i18n/navigation.ts`

```ts
export const {
  Link,
  redirect,
  permanentRedirect,
  usePathname,
  useRouter,
  getPathname,
} = createNavigation(routing)
```

```ts
export function localizePath(locale: Locale, href: string): string {
  const split = splitHref(href)
  if (typeof split === 'string') {
    // Untyped href: the same deliberate trade-off as in @/shared/ui/Link.
    return getPathname({ locale, href: split as never })
  }
  // getPathname ignores the hash, so it is appended here.
  const { hash, ...rest } = split
  return getPathname({ locale, href: rest as never }) + (hash ? `#${hash}` : '')
}
```

`splitHref` из [src/shared/lib/href.ts](../src/shared/lib/href.ts) разбирает внутренний путь с query или hash в объект `{ pathname, query, hash }`. Без этого `pathnames` не применился бы: next-intl сопоставляет с `pathnames` только pathname, и `'/about?tab=1'` превратился бы в `/ru/about?tab=1` вместо `/ru/o-nas?tab=1`. Якоря, внешние URL, `mailto:` и `tel:` проходят без изменений. Тот же разбор делает обёртка `@/shared/ui/Link`.

| Экспорт | Где | Что даёт |
|---|---|---|
| `Link` | Server / Client | Префикс локали и маппинг `pathnames`. В коде шаблона используется не напрямую, а через обёртку `@/shared/ui/Link` с `href: string` ([06-navigation.md](./06-navigation.md)). |
| `redirect`, `permanentRedirect` | Server Components, Server Actions | Редирект на локализованный URL: `redirect({ href, locale })`. |
| `useRouter` | Client | `router.push/replace(href, { locale })`. |
| `usePathname` | Client | Канонический путь без префикса и без локализованного сегмента (`/about` на `/ru/o-nas`). |
| `getPathname` | Где угодно, кроме proxy | Путь для конкретной локали. Не добавляет `basePath`. |
| `localizePath` | Где угодно, кроме proxy | `getPathname` для произвольной строки, в том числе с query и hash: `localizePath('ru', '/about?tab=1#team') → '/ru/o-nas?tab=1#team'`. Каст `as never` для нетипизированного `href` собран здесь и в `@/shared/ui/Link`. |

`useRouter`, `usePathname`, `redirect` и `permanentRedirect` бери отсюда, а не из `next/navigation`: иначе не применятся ни `pathnames`, ни префикс. Импорт этих четырёх имён (и `next/link`) из Next.js запрещает правило ESLint `no-restricted-imports`. `useParams`, `useSearchParams` и `notFound` остаются из `next/navigation`.

> **Не импортируй `navigation.ts` в `proxy.ts`.** В proxy `next-intl/navigation` резолвится в серверный вариант. Тот читает конфиг запроса, `request.ts` импортирует `next/root-params`, а этот модуль доступен только в App Router. `next build` падает с двумя ошибками: `'next/root-params' can only be used inside the App Directory` и `Export locale doesn't exist in target module` (проверено сборкой). Как построить локализованный URL в proxy — в примере с auth ниже.

## 5. Плагин: `next.config.ts`

```ts
const withNextIntl = createNextIntlPlugin({
  requestConfig: './src/shared/i18n/request.ts',
  experimental: {
    // Generates en.d.json.ts next to en.json (on dev/build/`next typegen`) so
    // ICU arguments are strictly typed: t('items', { count: 'x' }) is a type
    // error, and `{min, plural, …}` requires a number.
    createMessagesDeclaration: './src/shared/i18n/messages/en.json',
  },
})
```

**`requestConfig`.** Плагин делает alias `next-intl/config` на этот файл, и через него серверные API (`getTranslations`, `getLocale`, `getFormatter`, …) находят конфиг. Клиент получает конфигурацию не от плагина, а от `NextIntlClientProvider`. Если провайдер отрендерен из Server Component, он наследует из `request.ts` `locale`, `timeZone`, `now` и `formats`. `messages` он тоже унаследовал бы, причём все, поэтому шаблон передаёт их явно и только нужные namespace через `<ClientMessages>` ([03-translations.md](./03-translations.md)). Без аргумента плагин ищет `./i18n/request.{ts,tsx,js,jsx}` и `./src/i18n/request.*`. Путь шаблона нестандартный, поэтому он задан явно. Путь должен быть **относительным**: с абсолютным под Turbopack плагин бросает ошибку. Если в `next.config` остался ключ `i18n` от Pages Router, плагин предупредит о конфликте, и ключ нужно удалить.

**`createMessagesDeclaration`.** TypeScript выводит импортированный JSON как `{ title: string }` и теряет текст сообщений, а вместе с ним ICU-аргументы. Плагин генерирует рядом с `en.json` файл `en.d.json.ts` с литеральными типами, и `t('items', { count: 'x' })` становится ошибкой типов. Нужно три вещи:

1. `"allowArbitraryExtensions": true` в [tsconfig.json](../tsconfig.json). Без этого `tsc` падает на каждом импорте `en.json` из `.ts`-файла: `TS6263: Module '…/en.json' was resolved to '…/en.d.json.ts', but '--allowArbitraryExtensions' is not set`.
2. `src/shared/i18n/messages/*.d.json.ts` в [.gitignore](../.gitignore): это сгенерированный файл.
3. `"typecheck": "next typegen && tsc --noEmit --incremental false"` в `package.json` (`--incremental false` — чтобы устаревший `tsconfig.tsbuildinfo` не маскировал правки ICU-аргументов). Файл создаётся при `next dev` (и пересоздаётся при правке `en.json`), `next build` и `next typegen`. Проверено на чистом checkout без `next typegen`: `tsc` падает на `PageProps`/`LayoutProps`, а `next/root-params` и `en.json` получают рыхлые типы (`any`/`string`), и ICU-аргументы молча не проверяются.

Опция находится под `experimental`. Подробнее о типизации — [03-translations.md](./03-translations.md).

**Не включено: `experimental.messages.precompile`** (AOT-компиляция ICU-сообщений, около −9 KB gzip клиентского JS). Почему и как включить — в [03-translations.md](./03-translations.md#опционально-прекомпиляция-сообщений).

**Turbopack.** В Next.js 16 `next dev` и `next build` по умолчанию идут через Turbopack, и плагин с ним совместим: на Next.js 16 он всегда добавляет в конфиг `turbopack.resolveAlias` для `next-intl/config`. Отсюда ловушка для переносимого проекта с собственным `webpack`-конфигом. Next.js 16 валит `next build` только когда в конфиге есть `webpack`, но нет `turbopack` (`This build is using Turbopack, with a webpack config and no turbopack config`). Плагин `turbopack` добавил, поэтому сборка проходит, а `webpack`-функция **молча не вызывается** (проверено сборкой копии шаблона с `webpack`, который пишет в лог). Перенеси такие настройки в `turbopack`-опции или собирай с `--webpack` (гайд Next.js «Upgrading to 16»).

**`experimental.globalNotFound`** в самом `nextConfig` к плагину не относится. Он включает `src/app/global-not-found.tsx` — корневую 404 для URL без маршрута, которая нужна, потому что `src/app/layout.tsx` в шаблоне нет ([09-error-pages.md](./09-error-pages.md)).

## 6. `src/global.d.ts`

```ts
declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof messages
    Locale: (typeof routing.locales)[number]
    // Makes named format strings ('short', 'currency', …) type-checked and
    // autocompleted. `formats` is the single source of truth in request.ts.
    Formats: typeof formats
  }
}
```

- `Messages` — тип `en.json`. С `en.d.json.ts` он литеральный, поэтому проверяются и ключи, и аргументы.
- `Locale` — union `'en' | 'ru' | 'uk'`. Бери его как `import type { Locale } from 'next-intl'`, собственного типа в `routing.ts` нет. `getLocale()` и `useLocale()` возвращают этот union, а `hasLocale(routing.locales, value)` сужает строку до него. Новая локаль в `routing.locales` расширит тип автоматически.
- `Formats` — имена из `formats` в `request.ts` проверяются и автодополняются в `format.dateTime(date, 'short')`.

## 7. `src/proxy.ts`

В Next.js 16 `middleware.ts` переименован в `proxy.ts` (codemod: `npx @next/codemod@latest middleware-to-proxy .`). Импорт остаётся `next-intl/middleware`. Proxy по умолчанию работает на Node.js runtime, а опцию `runtime` в этом файле задать нельзя.

```ts
export default createMiddleware(routing)

export const config = {
  // Run on every page path EXCEPT:
  // - the /api segment (/api, /api/… — but not /apiary), /_next…, /_vercel…;
  // - paths with a dot: /favicon.ico, /sitemap.xml, /robots.txt;
  // - an `opengraph-image` segment at any depth (/en/opengraph-image): served
  //   as-is, so `as-needed` doesn't redirect /en/… away (src/shared/seo/og-image.ts).
  // Excluded paths skip ALL proxy logic — keep that in mind when composing
  // auth or CSP into this file. tests/unit/proxy-matcher.test.ts pins it down.
  matcher: '/((?!api(?:/|$)|_next|_vercel|(?:.*/)?opengraph-image(?:/|$)|.*\\..*).*)',
}
```

На каждый подходящий запрос proxy делает три вещи:

1. **Определяет локаль**: префикс в URL, затем cookie `NEXT_LOCALE`, затем `Accept-Language`, затем `defaultLocale`.
2. **Отвечает redirect или rewrite.** `/about` переписывается во внутренний `/en/about`. `/en/about` редиректится на `/about`. `/ru/about` редиректится на `/ru/o-nas`, а `/ru/o-nas` переписывается в `/ru/about`. В рендер передаётся заголовок запроса с локалью.
3. **Синхронизирует cookie** (см. раздел 2). Заголовок `Link` с hreflang не ставит, потому что `alternateLinks: false`.

### Matcher: что важно знать

- `matcher` должен быть константой: Next.js разбирает его статически при сборке, переменные игнорируются.
- **Пути с точкой proxy не видит.** `/blog/v1.2` для основной локали не будет переписан и уйдёт в `[locale]=blog` → 404. Если такие slug-и возможны, добавь отдельную запись в matcher. В документации next-intl есть пример для `/users/jane.doe`: `'/([\\w-]+)?/users/(.+)'`.
- **`api(?:/|$)`, а не `api`, как в официальном matcher next-intl.** Голый `api` отрезает любой путь, который начинается с этих букв: `/apiary` и `/api-docs` прошли бы мимо proxy и получили корневую английскую 404. С привязкой к сегменту они идут через proxy (проверено на сборке: `x-middleware-rewrite: /en/apiary`), а `/api` и `/api/foo` по-прежнему нет. Если переносишь matcher из документации next-intl или из старого проекта, исправь это место.
- **OG-картинки исключены по целому сегменту** `(?:.*/)?opengraph-image(?:/|$)` на любой глубине. Иначе `as-needed` редиректил бы `/en/opengraph-image` на путь без префикса ([07-metadata-seo.md](./07-metadata-seo.md)). Привязка к сегменту нужна, чтобы исключение не задело страницы вроде `/blog/designing-opengraph-images`.
- Нелокализованный раздел (админка, вебхуки, docs) добавь в исключения. Иначе proxy перепишет `/admin` в `/en/admin`, и запрос упадёт в `[locale]/[...rest]` → 404.
- Matcher закреплён unit-тестом [tests/unit/proxy-matcher.test.ts](../tests/unit/proxy-matcher.test.ts). Тест читает литерал из `src/proxy.ts` и проверяет его через `unstable_doesMiddlewareMatch` из `next/experimental/testing/server`: какие пути идут через proxy, а какие нет. Меняешь matcher — дополни списки путей в тесте. Запуск: `npm run test:unit` (`node:test` через `tsx`, без сборки).

### Композиция: auth-проверка в proxy

Наивная проверка `request.nextUrl.pathname.startsWith('/admin')` при `localePrefix: 'as-needed'` пропускает `/ru/admin` и `/uk/admin/users`. Кроме того, путь декодируется при маршрутизации: next-intl переписывает `/ru/%61dmin` и `/r%75/admin` в `/ru/admin` (`x-middleware-rewrite: /ru/admin`), они открывают ту же страницу, а строковое сравнение сырого пути их не видит. Надёжнее проверять путь, **куда next-intl маршрутизирует запрос**. Это всегда `/<locale>/<канонический путь>`: декодированный, с развёрнутыми `pathnames`. Так же поступает пример композиции в документации next-intl.

```ts
// src/proxy.ts — example: auth + next-intl
import { type NextRequest, NextResponse } from 'next/server'
import { hasLocale } from 'next-intl'
import createMiddleware from 'next-intl/middleware'

import { routing } from './shared/i18n/routing'

const handleI18nRouting = createMiddleware(routing)

// Canonical paths: no locale prefix, no localized segments from `pathnames`.
const PROTECTED_PATHS = ['/account', '/admin']

function isProtected(pathname: string) {
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export default function proxy(request: NextRequest) {
  const response = handleI18nRouting(request)

  // A redirect (/en/admin → /admin, / → /ru) is checked when the browser
  // follows it: that request passes through the proxy again.
  if (!response.ok) return response

  // Where next-intl routes the request: /<locale>/<canonical path>, decoded,
  // with `pathnames` resolved. /admin → /en/admin, /ru/admin → /ru/admin,
  // /ru/%61dmin → /ru/admin, /ru/akkaunt → /ru/account.
  const target = new URL(response.headers.get('x-middleware-rewrite') ?? request.url, request.url)
  const [, locale, ...rest] = target.pathname.split('/')
  const pathname = `/${rest.join('/')}`

  // Optimistic check (cookie presence only). Verify the session again where
  // the data is read: Server Components, Server Actions, Route Handlers.
  if (hasLocale(routing.locales, locale) && isProtected(pathname) && !request.cookies.has('session')) {
    // next-intl normalizes this URL on the next pass (/en/login → /login).
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url))
  }

  return response
}

export const config = {
  matcher: '/((?!api(?:/|$)|_next|_vercel|(?:.*/)?opengraph-image(?:/|$)|.*\\..*).*)',
}
```

Пример проверен `tsc`, ESLint и production-сборкой в копии шаблона с текущим matcher. В копию добавили страницы `admin`, `admin/users`, `account`, `login` и тестовую запись `'/account': { ru: '/akkaunt', … }` в `pathnames`. Результаты без cookie `session`:

| Запрос | Ответ |
|---|---|
| `/admin`, `/%61dmin`, `/account` | `307 → /en/login` (затем `307 → /login`) |
| `/ru/admin`, `/r%75/admin`, `/ru/%61dmin`, `/ru/akkaunt` | `307 → /ru/login` |
| `/uk/admin/users` | `307 → /uk/login` |
| `/en/admin` | `307 → /admin` (next-intl), затем проверка |
| `/admin` с `Accept-Language: ru` | `307 → /ru/admin` (next-intl), затем `→ /ru/login` |
| `POST /ru/admin` (Server Action) | `307 → /ru/login` |
| `/administrator`, `/ru/o-nas`, `/login`, `/ru/login` | проходят без проверки |
| с cookie `session` | `200` на всех защищённых страницах |

Почему код устроен именно так:

- **`response.ok`.** Редиректы next-intl (`/en/admin → /admin`, `/ → /ru`) пропускаются без проверки. Браузер повторит запрос, и он снова пройдёт через proxy.
- **`x-middleware-rewrite`.** Для основной локали next-intl делает rewrite (`/admin → /en/admin`). Для `/ru/admin` rewrite не нужен, и тогда путь берётся из `request.url`. Если используешь `basePath`, отрежь его перед разбором.
- **Логин строится как `/${locale}/login`**, а не через `localizePath`: `navigation.ts` в proxy не импортируется (раздел 4). Следующий проход next-intl сам приведёт URL к каноническому виду (`/en/login → /login`, локализованный путь, если он есть в `pathnames`). Цена — лишний редирект для основной локали.
- **Proxy — только оптимистичная проверка.** Документация Next.js (Authentication) о proxy: «it should not be your only line of defense in protecting your data». Сессию проверяй там, где читаются данные, — в DAL, Server Components, Server Actions. `/api` исключён из matcher, поэтому Route Handlers защищай сами.
- Готовые стартеры с auth и next-intl (`app-router-auth`, `app-router-saas`) есть на [learn.next-intl.dev](https://learn.next-intl.dev).

### Композиция: CSP с nonce

next-intl собирает свой rewrite/next-ответ из **копии `request.headers`** (`NextResponse.rewrite(url, { request: { headers } })`). Поэтому заголовки для рендера выставляются на `request` до вызова next-intl, а CSP-заголовок ответа — после:

```ts
// src/proxy.ts — example: CSP nonce + next-intl
import type { NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'

import { routing } from './shared/i18n/routing'

const handleI18nRouting = createMiddleware(routing)

export default function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const isDev = process.env.NODE_ENV === 'development'
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Not a nonce: libraries such as sonner inject <style> tags without one,
    // and a nonce in the list makes browsers ignore 'unsafe-inline'.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')

  // next-intl builds its rewrite/next response from a copy of request.headers,
  // so headers set here reach the render: Next.js reads the nonce from the
  // request's CSP header, Server Components read x-nonce via headers().
  request.headers.set('x-nonce', nonce)
  request.headers.set('Content-Security-Policy', csp)

  const response = handleI18nRouting(request)
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: '/((?!api(?:/|$)|_next|_vercel|(?:.*/)?opengraph-image(?:/|$)|.*\\..*).*)',
}
```

Плюс одна строка в корневом layout, иначе nonce не во что подставить:

```tsx
// src/app/[locale]/layout.tsx — example
import { connection } from 'next/server'

export default async function LocaleLayout({ children }: LayoutProps<'/[locale]'>) {
  // A nonce exists only per request: render every page dynamically.
  await connection()
  // ...
}
```

Что показала проверка (production-сборка копии шаблона и Playwright):

- Nonce из заголовка ответа совпадает с `nonce` на всех `<script>` страницы. Это верно и для rewrite (`/`, `/about`, `/ru/o-nas`), и для `next` (`/ru`). `x-nonce` читается через `(await headers()).get('x-nonce')`, например для `<Script nonce>`. Без nonce остаётся только JSON-LD (`type="application/ld+json"`), но CSP его не блокирует: он не исполняется.
- **Цена:** все страницы становятся динамическими. В выводе сборки `●` превращается в `ƒ`, теряются SSG и CDN-кеш. В статический HTML nonce подставить нельзя (документация Next.js, Content Security Policy).
- **`style-src` с nonce ломает `sonner`:** он вставляет `<style>` без nonce, и браузер пишет «Applying inline style violates … style-src». `'unsafe-inline'` рядом с nonce не помогает, браузеры его игнорируют. С `style-src 'self' 'unsafe-inline'` ошибок CSP нет, гидратация и `LangSwitcher` работают.
- Если динамический рендеринг не подходит, документация Next.js предлагает CSP без nonce в `headers()` из `next.config.ts` или экспериментальный SRI (`experimental.sri`). В шаблоне ни один из вариантов не проверялся. Сейчас [next.config.ts](../next.config.ts) намеренно ставит только минимальные заголовки без CSP.

## Дальше

- [02-app-router.md](./02-app-router.md) — `[locale]` как root layout, `generateStaticParams`, Cache Components.
- [03-translations.md](./03-translations.md) — server и client, `ClientMessages`, fallback, типизация.
- [08-pathnames.md](./08-pathnames.md) — локализованные URL и остальные опции `routing`.
- [13-locale-persistence.md](./13-locale-persistence.md) — cookie `NEXT_LOCALE` и язык пользователя.
- [14-testing.md](./14-testing.md), [15-production-checklist.md](./15-production-checklist.md) — проверки и чек-лист внедрения.

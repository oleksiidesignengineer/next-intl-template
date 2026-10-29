# Обзор шаблона

Шаблон показывает, как локализовать Next.js-приложение на App Router с next-intl так, чтобы это выдержало продакшн: статический рендеринг всех локалей, строгие типы, минимум сообщений на клиенте, корректное SEO и проверки в CI. Этот документ описывает общую схему и объясняет, почему она устроена именно так. Детали каждого шага вынесены в отдельные главы, ссылки на них есть в тексте.

Источник истины — код. Если документ и код расходятся, верь коду, а расхождение поправь.

## Как проходит запрос

```
GET /ru/o-nas
   │
   ▼
src/proxy.ts ── createMiddleware(routing) из next-intl/middleware
   │  • путь без префикса (/, /about): cookie NEXT_LOCALE → Accept-Language;
   │    не en → 307 на /ru/…, en → rewrite на /en/… (as-needed)
   │  • /en/about → 307 /about;  /ru/about → 307 /ru/o-nas (pathnames)
   │  • /ru/o-nas → внутренний rewrite на /ru/about
   │  • Set-Cookie NEXT_LOCALE: только document-запрос, локаль которого
   │    отличается от cookie (без cookie — от Accept-Language)
   ▼
src/app/[locale]/layout.tsx ── ROOT layout: [locale] — root param
   │  getLocale(), getTranslations(), <ClientMessages namespaces={['error']}>
   ▼
src/shared/i18n/request.ts ── getRequestConfig
   │  locale = явный override ?? await rootParams.locale()
   │  неизвестная локаль → notFound()
   │  messages (en подложкой), timeZone, now, formats, onError
   ▼
├─ Server Components: getTranslations / useTranslations (не-async)
│    сообщения остаются на сервере
└─ Client Components: NextIntlClientProvider
     из layout приходит только namespace `error`,
     островок страницы получает своё через <ClientMessages namespaces={[…]}>
```

Ключевая идея: локаль знают **URL** и **root param**, её не нужно прокидывать через пропсы или `setRequestLocale`. Любой Server Component под root layout, включая `generateMetadata`, получает её из `request.ts`:

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

Выдержка из [src/shared/i18n/request.ts](../src/shared/i18n/request.ts). Подробности: [01-setup.md](./01-setup.md), [02-app-router.md](./02-app-router.md).

## Ключевые решения

### 1. `[locale]/layout.tsx` — корневой layout, `src/app/layout.tsx` нет

`next/root-params` видит только сегменты до root layout включительно. Если оставить pass-through `src/app/layout.tsx`, `[locale]` перестаёт быть root param, и `next typegen` генерирует для `next/root-params` пустую декларацию с комментарием «No root params detected». Поэтому `<html lang dir>` и `<body>` рендерятся в [src/app/[locale]/layout.tsx](../src/app/[locale]/layout.tsx).

Следствия:
- Над корневыми 404 нет layout. Документ для URL без маршрута рисует `global-not-found.tsx` со своими `<html lang="en">`/`<body>` (экспериментальный флаг `experimental.globalNotFound`). `global-error.tsx` тоже рендерит свой документ: он заменяет root layout. Подробнее в разделе 8.
- `generateStaticParams` в `[locale]/layout.tsx` нужен по-прежнему: он перечисляет локали для пререндеринга на этапе сборки.

Подробнее: [02-app-router.md](./02-app-router.md).

### 2. Локаль берётся из `next/root-params`, `setRequestLocale` не используется

`next/root-params` появился в Next.js 16.3 и работает без флагов (прежний `unstable_rootParams` удалён). В next-intl `setRequestLocale` помечен deprecated с 4.13.5, а параметр `requestLocale` в `getRequestConfig` — с 4.13.6. В обоих случаях библиотека рекомендует переходить на root params. В шаблоне ни в одном page или layout нет `setRequestLocale`, но все страницы во всех локалях пререндерятся статически.

Грабли: не деструктурируй `requestLocale` в `getRequestConfig` даже «на всякий случай». Это геттер, который читает `headers()`, и все страницы под `[locale]` становятся динамическими: в выводе `next build` они `ƒ` вместо `●`.

### 3. Где root params нет, локаль передаётся явно

`next/root-params` доступен в Server Components, включая `generateMetadata` и вложенный `generateStaticParams`. В Server Actions и Route Handlers его нет, а metadata-картинки вроде `opengraph-image` ведут себя как Route Handlers. Там локаль передаётся вызову напрямую: `getTranslations({ locale, namespace })`. Таких мест три, в шаблоне встречаются первые два:

| Где | Откуда берётся локаль |
|---|---|
| Server Action ([features/contact/api/actions.ts](../src/features/contact/api/actions.ts)) | Привязывается в Server Component через `submitContact.bind(null, locale)`. В action она проверяется `hasLocale`, потому что bound-аргументы проходят через клиент |
| Metadata image route ([`[locale]/opengraph-image.tsx`](../src/app/[locale]/opengraph-image.tsx)) | Из `params` |
| Route Handlers (в шаблоне их нет) | Из URL или тела запроса |

`.bind` делается именно в Server Component ([contact/page.tsx](../src/app/[locale]/contact/page.tsx)). Если привязать локаль внутри Client Component, на Next.js 16.4.3 отправка формы без JS зависает: `next-server` уходит в 100% CPU и перестаёт отвечать на любые запросы. Подробнее: [12-server-actions.md](./12-server-actions.md).

### 4. На клиент уходят только нужные сообщения

`NextIntlClientProvider`, отрендеренный из Server Component, без пропа `messages` по умолчанию отдаёт клиенту **все** сообщения локали. Шаблон делает иначе:

- layout оборачивает дерево в [`<ClientMessages>`](../src/shared/i18n/ClientMessages.tsx) только с namespace `error`, он нужен для `error.tsx`. `ClientMessages` — async Server Component: `NextIntlClientProvider`, которому передаются лишь перечисленные namespace:
  ```tsx
  <ClientMessages namespaces={['error']}>
  ```
- клиентский островок страница оборачивает в собственный `<ClientMessages>`. У формы свой namespace `contactForm`, а серверные строки страницы (`contact`) на клиент не уходят:
  ```tsx
  <ClientMessages namespaces={['contactForm']}>
    {/* Server Actions can't read next/root-params, so the locale is bound
        here, on the server, and the action translates its errors with it. */}
    <ContactForm action={submitContact.bind(null, locale)} />
  </ClientMessages>
  ```
- если строк всего пара, их проще перевести на сервере и передать пропом. Так сделаны `LangSwitcher` (label и нативные названия языков) и `ErrorTrigger`.

Грабли:
- Вложенный провайдер **заменяет** `messages`, а не сливает их с родительскими, поэтому перечисляй все namespace поддерева. `locale`, `timeZone`, `now` и `formats` наследуются из `request.ts`.
- `onError` и `getMessageFallback` действуют только на сервере: функции не сериализуются в клиентский провайдер.
- Забытый namespace даёт ошибку `MISSING_MESSAGE` в консоли браузера, и e2e на этом падают.

Подробнее: [03-translations.md](./03-translations.md).

### 5. Типы выводятся из `en.json` и `routing.ts`

- [src/global.d.ts](../src/global.d.ts) расширяет `AppConfig` в next-intl: `Messages` берётся из `en.json`, `Locale` — из `routing.locales`, `Formats` — из `formats` в `request.ts`. Тип локали импортируется так: `import type { Locale } from 'next-intl'`.
- Опция `experimental.createMessagesDeclaration` в [next.config.ts](../next.config.ts) генерирует `en.d.json.ts`, а `allowArbitraryExtensions` в `tsconfig.json` позволяет TypeScript подхватить эту декларацию для `en.json`. Сгенерированный файл в `.gitignore`. Благодаря ему ICU-аргументы типизированы строго: `t('items', { count: 'x' })` — ошибка компиляции.
- Поэтому `npm run typecheck` = `next typegen && tsc --noEmit --incremental false`. Route types (`LayoutProps`, `PageProps`), `next/root-params` и декларация сообщений — сгенерированные файлы.

Подробнее: [03-translations.md](./03-translations.md), [05-formatting.md](./05-formatting.md).

### 6. Маршрутизация: `as-needed`, минимальный `pathnames`, сессионная cookie

Настройки собраны в [src/shared/i18n/routing.ts](../src/shared/i18n/routing.ts).

- `localePrefix: 'as-needed'`. Английский живёт без префикса, остальные языки — с префиксом. Путь без префикса подчиняется определению языка: посетителя с cookie или `Accept-Language` для `ru` proxy уведёт на `/ru/…`.
- `pathnames` содержит только маршруты, URL которых **различается** по локалям (сейчас это `/about`). Чтобы не перечислять там все остальные ради типов, [`@/shared/ui/Link`](../src/shared/ui/Link.tsx) принимает `href: string`. Строку с query или hash обёртка разбирает в объект, иначе `/about?x=1` потерял бы маппинг. Разбираются только абсолютные внутренние пути: якоря, внешние ссылки и `mailto:`/`tel:` обёртка не трогает. Для серверного кода есть `localizePath(locale, href)` в [navigation.ts](../src/shared/i18n/navigation.ts).
- `localeCookie` не задан, поэтому `NEXT_LOCALE` — сессионная cookie (дефолт next-intl 4). Proxy ставит её и посетителю, который язык не выбирал, например пришедшему по ссылке на `/ru/…` из англоязычного браузера. Поэтому годовая cookie упирается в вопрос согласия по GDPR/ePrivacy и включается явно: `localeCookie: { maxAge }`. Когда именно cookie ставят proxy и клиентская навигация, разобрано в [13-locale-persistence.md](./13-locale-persistence.md#кто-и-когда-ставит-cookie).
- `alternateLinks: false`. hreflang отдают metadata и sitemap от `SITE_URL`, а `Link`-заголовок proxy строился бы от хоста запроса, который за reverse proxy или на preview другой.
- Отдельного Route Handler для смены языка нет: при префиксной маршрутизации язык задаёт URL. Язык из профиля после логина можно выставить в Server Action через `cookies().set('NEXT_LOCALE', …)` и `redirect({ href, locale })`: рецепт в [13-locale-persistence.md](./13-locale-persistence.md#после-логина-язык-из-профиля), в самом шаблоне логина нет.

Подробнее: [06-navigation.md](./06-navigation.md), [08-pathnames.md](./08-pathnames.md), [13-locale-persistence.md](./13-locale-persistence.md).

### 7. SEO строится от одного origin и одного хелпера

- [src/shared/config/site.ts](../src/shared/config/site.ts) задаёт `SITE_URL` (env → домен Vercel → localhost). От него строятся `metadataBase`, canonical, hreflang, sitemap и robots.
- Каждая страница вызывает `buildPageMetadata({ href, title, description, absoluteTitle?, noindex? })` из [shared/seo/metadata.ts](../src/shared/seo/metadata.ts). Хелпер собирает в одном месте canonical и hreflang, `og:url`, `og:locale` с `alternateLocale`, `og:site_name`, Twitter-теги и картинку. Без него страница получила бы от Next.js только og:title из шаблонного `<title>` («О шаблоне | Шаблон next-intl»), og:description, Twitter-теги и картинку из file convention, но ни canonical, ни hreflang, ни `og:url`, ни `og:locale`, ни `og:site_name`.
- og:image явно указывает на картинку своей локали (`/<locale>/opengraph-image`). Next.js сливает metadata поверхностно: страница со своим `openGraph` заменяет объект родителя целиком и теряет картинку из file convention, поэтому путь прописан руками. Matcher proxy исключает `opengraph-image`, иначе `as-needed` редиректил бы `/en/opengraph-image`. Шрифт Geist 600 для картинки грузится из Google Fonts на этапе сборки (только нужные глифы через `text=`). Встроенный шрифт `next/og` — Geist Regular: кириллица в нём есть, но жирного начертания нет, и `fontWeight: 600` без своего шрифта рисуется обычным. Арабского, иврита и CJK во встроенном шрифте нет, для таких локалей свой шрифт нужен в любом случае.
- [sitemap.ts](../src/app/sitemap.ts) содержит по `<url>` на каждую пару «страница × локаль» с полным набором hreflang и `x-default`. Demo-страницы в sitemap не попадают и помечены `noindex`.

Подробнее: [07-metadata-seo.md](./07-metadata-seo.md).

### 8. Ошибки и 404 на трёх уровнях

| Файл | Когда срабатывает |
|---|---|
| [`[locale]/not-found.tsx`](../src/app/[locale]/not-found.tsx) | `notFound()` внутри локали: любой неизвестный путь, в том числе неизвестный slug (его маршрут закрыт `dynamicParams = false`), приходит через [`[locale]/[...rest]/page.tsx`](../src/app/[locale]/[...rest]/page.tsx). Это Server Component с `useTranslations`: в не-async Server Components хук работает, и namespace `notFound` на клиент не уходит |
| [`src/app/global-not-found.tsx`](../src/app/global-not-found.tsx) | URL без маршрута среди тех, что matcher proxy пропускает (`/unknown.txt`). Флаг `experimental.globalNotFound`, свои `<html lang="en">`/`<body>`, `metadata` работает |
| [`src/app/not-found.tsx`](../src/app/not-found.tsx) | `notFound()` из `request.ts` для невалидной локали в маршруте, который рендерится по запросу (`/api/foo`). Без `<html>`/`<body>`: свой `<html>` оказался бы вложенным в документ Next.js и в dev ломает гидратацию. Поэтому `<html>` здесь от Next.js, без `lang` |
| [`[locale]/error.tsx`](../src/app/[locale]/error.tsx) / [`global-error.tsx`](../src/app/global-error.tsx) | Ошибки рендера. Проп `retry` стабилен с Next.js 16.3: `unstable_retry` удалён без алиаса. Типы — `Pick<ErrorInfo, 'error' \| 'retry'>` из `next/error` |

Особенность Next.js 16.4.3: 404, отданная во время запроса (`/ru/foo`, `/uk/blog/does-not-exist`, `/api/foo`), приходит с кодом 404 и `noindex`, но в HTML только пустая оболочка `<html id="__next_error__">`. Саму страницу браузер строит из RSC payload. Полностью на сервере рендерится `global-not-found` (`/unknown.txt`). Это поведение Next.js, а не шаблона: оно воспроизводится и в минимальном приложении без next-intl.

Почему корневых 404 два и какой URL куда попадает: [09-error-pages.md](./09-error-pages.md#какой-url-куда-попадает).

### 9. Фолбэк переводов и `now`

- `loadMessages` в `request.ts` кладёт `en.json` подложкой под активную локаль. Слияние глубокое, поэтому ключ, которого нет в `ru.json`, покажется по-английски, а не путём `namespace.key`. Сам next-intl между локалями не подставляет.
- `now: new Date()` в `request.ts` оставлен намеренно: серверный и клиентский `useNow`/`relativeTime` стартуют от одного значения, и гидратация совпадает. На статических страницах это время сборки, поэтому живое время на клиенте обновляется через `useNow({ updateInterval })`.

Подробнее: [05-formatting.md](./05-formatting.md).

## Что сознательно не включено

| Что | Почему | Как включить |
|---|---|---|
| Cache Components (`cacheComponents`) | Официальный example next-intl его тоже не включает. Включение требует нескольких правок и меняет поведение 404: первый запрос неизвестного slug вне `generateStaticParams` получает 200 + `noindex` вместо 404, потому что стрим уже начался (повторные — 404 из кеша) | Пошаговый список в [02-app-router.md](./02-app-router.md) |
| Прекомпиляция сообщений (`experimental.messages.precompile`) | Экспериментальная опция. По замерам next-intl экономит около 9 KB сжатого JS, но несовместима с `t.raw`. Официальный example её не включает | Опция плагина в [next.config.ts](../next.config.ts), см. [03-translations.md](./03-translations.md#опционально-прекомпиляция-сообщений) |
| Годовая cookie `NEXT_LOCALE` | Proxy ставит cookie и тем, кто язык не выбирал, поэтому долгоживущая cookie упирается в вопрос согласия (GDPR/ePrivacy) | `localeCookie: { maxAge }` в `routing.ts`, см. [13-locale-persistence.md](./13-locale-persistence.md) |
| Линтер сообщений `@eloqnt/cli` | Есть в официальном example-app-router, но в этом шаблоне не проверялся | Своя проверка — `npm run check:translations` |

## Карта файлов

Шаблон организован по [Feature-Sliced Design](./FSD_GUIDE.md). Импорт из чужого слайса разрешён только через его `index.ts`, это правило проверяет ESLint (`no-restricted-imports`). Клиентские островки одной страницы лежат рядом с ней в `_components/`.

### i18n-ядро и общие модули (`src/shared/`, корень `src/`)

| Путь | Роль |
|---|---|
| [`src/proxy.ts`](../src/proxy.ts) | Proxy (бывший `middleware.ts`, Next.js 16): `createMiddleware(routing)` и matcher |
| [`src/global.d.ts`](../src/global.d.ts) | `AppConfig` для next-intl: `Messages`, `Locale`, `Formats` |
| [`src/shared/i18n/routing.ts`](../src/shared/i18n/routing.ts) | Локали, `localePrefix`, `localeDetection`, `pathnames`, `alternateLinks` |
| [`src/shared/i18n/request.ts`](../src/shared/i18n/request.ts) | `getRequestConfig`: локаль из root params, сообщения с фолбэком, `formats`, `timeZone`, `now`, `onError` |
| [`src/shared/i18n/navigation.ts`](../src/shared/i18n/navigation.ts) | `Link`, `redirect`, `permanentRedirect`, `useRouter`, `usePathname`, `getPathname` из `createNavigation` и `localizePath` |
| [`src/shared/i18n/ClientMessages.tsx`](../src/shared/i18n/ClientMessages.tsx) | `<ClientMessages>` и `pickNamespaces`: какие namespace уходят на клиент |
| [`src/shared/i18n/messages/`](../src/shared/i18n/messages/en.json) | `en.json` (источник истины), `ru.json`, `uk.json`. `en.d.json.ts` генерируется |
| [`src/shared/ui/Link.tsx`](../src/shared/ui/Link.tsx) | `Link` с `href: string` и разбором query/hash |
| [`src/shared/lib/href.ts`](../src/shared/lib/href.ts), [`search-params.ts`](../src/shared/lib/search-params.ts) | `splitHref`: внутренний путь с query/hash → объект для next-intl; `URLSearchParams` → `query` с сохранением повторяющихся ключей |
| [`src/shared/config/site.ts`](../src/shared/config/site.ts) | `SITE_URL`, `absoluteUrl()` |
| [`src/shared/config/locales.ts`](../src/shared/config/locales.ts) | `LOCALE_NATIVE_NAMES` через `Intl.DisplayNames`, `TEXT_DIRECTION` для `<html dir>` |
| [`src/shared/seo/`](../src/shared/seo/metadata.ts) | `buildPageMetadata`, `buildLanguageUrls`/`buildAlternates`, путь OG-картинки, `OG_LOCALE` |

### Слайсы

| Путь | Роль |
|---|---|
| [`src/entities/post/`](../src/entities/post/index.ts) | Посты блога с переводами по `Locale` (`getAllPosts`, `getPostBySlug`) |
| [`src/features/contact/`](../src/features/contact/index.ts) | Server Action `submitContact`, zod-схема с переведёнными ошибками, `ContactForm` |
| [`src/features/locale-switch/`](../src/features/locale-switch/index.ts) | `LangSwitcher` (Client Component, тексты приходят пропами) |
| [`src/widgets/site-header/`](../src/widgets/site-header/index.ts) | `SiteHeader` (Server Component): навигация и переключатель |

### Маршруты (`src/app/`)

| Путь | Роль |
|---|---|
| [`[locale]/layout.tsx`](../src/app/[locale]/layout.tsx) | Root layout: `<html lang dir>`, `generateStaticParams` и `dynamicParams = false`, `metadataBase`, шаблон title, провайдер с namespace `error`, `Toaster` |
| [`[locale]/page.tsx`](../src/app/[locale]/page.tsx), [`about/`](../src/app/[locale]/about/page.tsx), [`blog/`](../src/app/[locale]/blog/page.tsx), [`blog/[slug]/`](../src/app/[locale]/blog/[slug]/page.tsx), [`contact/`](../src/app/[locale]/contact/page.tsx) | Страницы: `getTranslations` без явной локали, `buildPageMetadata`. На `/about` есть JSON-LD |
| [`[locale]/demo/`](../src/app/[locale]/demo/plurals/page.tsx) | `plurals`, `formats`, `errors`: демо ICU, форматирования и error boundary (`noindex`) |
| [`[locale]/opengraph-image.tsx`](../src/app/[locale]/opengraph-image.tsx) | Локализованная OG-картинка: по одной на локаль, пререндер на сборке (`generateStaticParams` и `dynamicParams = false`) |
| [`[locale]/[...rest]/page.tsx`](../src/app/[locale]/[...rest]/page.tsx) | Превращает неизвестный путь внутри локали в `notFound()` |
| [`[locale]/not-found.tsx`](../src/app/[locale]/not-found.tsx), [`[locale]/error.tsx`](../src/app/[locale]/error.tsx) | Локализованные 404 и error boundary |
| [`global-not-found.tsx`](../src/app/global-not-found.tsx), [`not-found.tsx`](../src/app/not-found.tsx) | Корневые 404 без локали: URL без маршрута и невалидная локаль из `request.ts` |
| [`global-error.tsx`](../src/app/global-error.tsx) | Ошибка самого root layout, свои `<html>`/`<body>` |
| [`sitemap.ts`](../src/app/sitemap.ts), [`robots.ts`](../src/app/robots.ts) | sitemap с hreflang, robots от `SITE_URL` |

### Конфигурация и проверки

| Путь | Роль |
|---|---|
| [`next.config.ts`](../next.config.ts) | Плагин next-intl (`requestConfig`, `createMessagesDeclaration`), `experimental.globalNotFound`, базовые security-заголовки |
| [`scripts/check-translations.ts`](../scripts/check-translations.ts) | Ключи и типы значений, ICU-синтаксис, аргументы и их вид (текст/число/дата), склонение по числу, ключи `select`, теги, пустые строки, plural-категории CLDR |
| [`tests/unit/`](../tests/unit/proxy-matcher.test.ts) | `node:test` без сборки: matcher proxy, `splitHref` |
| [`tests/e2e/`](../tests/e2e/fixtures.ts), [`playwright.config.ts`](../playwright.config.ts) | E2e против production-сборки в Chromium, Firefox и WebKit, тест падает на любой console error |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | CI: translations → lint → typecheck → build → `npm test` (unit, затем e2e) |
| [`AGENTS.md`](../AGENTS.md) | Короткие правила для AI-агентов |

## Куда дальше

- Подключаешь локализацию к своему проекту: начни с [PORTABILITY.md](./PORTABILITY.md), потом пройди [15-production-checklist.md](./15-production-checklist.md).
- Разбираешься, как устроено: читай главы по порядку, от [01-setup.md](./01-setup.md) до [13-locale-persistence.md](./13-locale-persistence.md).
- Проверки и CI описаны в [14-testing.md](./14-testing.md), частые вопросы собраны в [10-faq.md](./10-faq.md).

Все документы по порядку (с описаниями — в [README](../README.md#документация)):

1. [00-overview.md](./00-overview.md) — этот обзор
2. [01-setup.md](./01-setup.md) — установка и конфигурация
3. [02-app-router.md](./02-app-router.md) — `[locale]` как root layout, `next/root-params`, Cache Components
4. [03-translations.md](./03-translations.md) — переводы на сервере и клиенте, типизация
5. [04-icu-messages.md](./04-icu-messages.md) — ICU-сообщения
6. [05-formatting.md](./05-formatting.md) — форматирование, `now`, `timeZone`
7. [06-navigation.md](./06-navigation.md) — навигация и `LangSwitcher`
8. [07-metadata-seo.md](./07-metadata-seo.md) — metadata и SEO
9. [08-pathnames.md](./08-pathnames.md) — локализованные URL и опции routing
10. [09-error-pages.md](./09-error-pages.md) — страницы ошибок и 404
11. [10-faq.md](./10-faq.md) — FAQ и грабли
12. [11-dynamic-routes.md](./11-dynamic-routes.md) — динамические роуты
13. [12-server-actions.md](./12-server-actions.md) — Server Actions
14. [13-locale-persistence.md](./13-locale-persistence.md) — cookie `NEXT_LOCALE`, CDN
15. [14-testing.md](./14-testing.md) — тестирование и CI
16. [15-production-checklist.md](./15-production-checklist.md) — чек-лист для продакшна
17. [FSD_GUIDE.md](./FSD_GUIDE.md) — Feature-Sliced Design
18. [PORTABILITY.md](./PORTABILITY.md) — перенос в существующий проект

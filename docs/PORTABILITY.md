# Перенос шаблона в существующий проект

Документ описывает, как внедрить локализацию из шаблона в живой Next.js-проект: что копировать как есть, что адаптировать и в каком порядке. Первая контрольная сборка — в конце шага 4 (там же сказано, что должно получиться), дальше собирай после каждого шага. Как устроен каждый файл, объясняет [01-setup.md](./01-setup.md), а что проверить перед выкладкой — [15-production-checklist.md](./15-production-checklist.md).

Есть два стартовых положения:

- **A. В проекте нет i18n.** Иди по шагам 0–10.
- **B. next-intl уже стоит по старой схеме** (`setRequestLocale`, `requestLocale`, pass-through `app/layout.tsx`, `middleware.ts`). Сначала прочитай раздел [«Миграция со старой схемы next-intl»](#миграция-со-старой-схемы-next-intl), потом сверяйся с шагами.

## 0. Предпосылки и развилки

Проверь до копирования:

- **Next.js ≥ 16.3.** С этой версии `next/root-params` включён по умолчанию, и на нём держится `request.ts`. Версии стека смотри в [package.json](../package.json).
- **App Router.** Ключ `i18n` в `next.config` (i18n Pages Router) удали: плагин next-intl предупреждает о конфликте.
- **Нет `output: 'export'`.** При статическом экспорте proxy не работает. next-intl тогда требует префикс у всех локалей, не умеет определять язык и не поддерживает `pathnames`. Шаблон держится на proxy, так что в таком проекте его схему придётся упростить (документация next-intl, «Usage without proxy»).
- **Корневой layout переедет** в `app/[locale]/layout.tsx`, а `app/layout.tsx` исчезнет. Если какие-то разделы должны остаться без локали (админка, вебхуки, документация), реши это сейчас: см. [«Нелокализованные разделы»](#нелокализованные-разделы).
- **Решения по маршрутизации:** `localePrefix` (`'as-needed'` как в шаблоне или `'always'`), нужны ли локализованные URL (`pathnames`), политика cookie. Компромиссы описаны в [08-pathnames.md](./08-pathnames.md) и [13-locale-persistence.md](./13-locale-persistence.md). Менять это после выкладки дорого: меняются URL.

## 1. Зависимости

```bash
npm install next-intl
npm install -D tsx @formatjs/icu-messageformat-parser   # check:translations, test:unit
npm install -D @playwright/test                          # e2e, if you take them
```

`sonner` нужен, только если переносишь `<Toaster>` из layout шаблона. `zod` использует только демо-форма.

## 2. Ядро i18n: скопировать

Копируй с сохранением путей. Если в проекте нет FSD, сначала посмотри раздел [«Проект без FSD»](#проект-без-fsd).

| Файл | Копировать | Что адаптировать |
|---|---|---|
| [src/shared/i18n/routing.ts](../src/shared/i18n/routing.ts) | да | `locales`, `defaultLocale`, `localePrefix`, `pathnames` (только свои маршруты с разными URL по локалям, [08](./08-pathnames.md)) |
| [src/shared/i18n/request.ts](../src/shared/i18n/request.ts) | да | `timeZone`, `formats` (валюта `EUR`!), подключить `onError` к трекеру |
| [src/shared/i18n/navigation.ts](../src/shared/i18n/navigation.ts) | как есть | Импортирует `splitHref` из `src/shared/lib/href.ts` (строка ниже) |
| [src/shared/i18n/ClientMessages.tsx](../src/shared/i18n/ClientMessages.tsx) | как есть | — |
| `src/shared/i18n/messages/*.json` | структуру | Свои словари. Инфраструктуре нужны namespace `site` (`name`, `description`), `common`, `error`, `notFound`. Остальное — демо |
| [src/global.d.ts](../src/global.d.ts) | как есть | пути импортов, если ядро лежит не в `src/shared/i18n` |
| [src/proxy.ts](../src/proxy.ts) | да | matcher (шаг 5); при существующем middleware — композиция |
| [src/shared/config/locales.ts](../src/shared/config/locales.ts) | да | `TEXT_DIRECTION`: направление для каждой своей локали (`Record`, так что без записи tsc упадёт). Проверь, как `Intl.DisplayNames` назвал твои языки |
| [src/shared/config/site.ts](../src/shared/config/site.ts) | как есть | env `SITE_URL` в каждом окружении |
| [src/shared/seo/](../src/shared/seo/) | да | `OG_LOCALE` для своих локалей. `buildPageMetadata` ссылается на OG-картинку через `og-image.ts`: без картинки убери `images` из хелпера |
| [src/shared/ui/Link.tsx](../src/shared/ui/Link.tsx) + [src/shared/lib/href.ts](../src/shared/lib/href.ts) + [src/shared/lib/search-params.ts](../src/shared/lib/search-params.ts) | как есть | — |
| [src/features/locale-switch/](../src/features/locale-switch/) | да | Вёрстка. `label` и `options` передаются пропами из серверного родителя, как в [SiteHeader.tsx](../src/widgets/site-header/ui/SiteHeader.tsx) |

Файлы `src/app/` переносятся на шаге 4: их нужно не скопировать, а слить с тем, что уже есть в проекте.

## 3. Конфиги

**`next.config.ts`.** Оберни существующий конфиг. Путь `requestConfig` — относительный: абсолютный путь под Turbopack плагин не принимает.

```ts
// next.config.ts — example for an existing config
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin({
  requestConfig: './src/shared/i18n/request.ts',
  experimental: {
    createMessagesDeclaration: './src/shared/i18n/messages/en.json',
  },
})

export default withNextIntl(nextConfig)
```

В сам `nextConfig` добавь `experimental: { globalNotFound: true }`: без `app/layout.tsx` (шаг 4) на нём держится корневая 404 ([09-error-pages.md](./09-error-pages.md)).

**`tsconfig.json`.** Добавь `"allowArbitraryExtensions": true` — этого требует `createMessagesDeclaration` (документация next-intl). TypeScript и без флага резолвит импорт `en.json` в сгенерированный `en.d.json.ts`, но тогда `tsc` падает с TS6263 там, где `en.json` импортирует обычный `.ts`-файл (в шаблоне — `tests/e2e/i18n.spec.ts`). Скопированные файлы импортируют через `@/*` → `./src/*`. Если alias в проекте другой, поправь импорты.

**`.gitignore`.** Добавь `src/shared/i18n/messages/*.d.json.ts`.

**`package.json`.**

```json
"typecheck": "next typegen && tsc --noEmit --incremental false",
"check:translations": "tsx scripts/check-translations.ts",
"test": "npm run test:unit && npm run test:e2e",
"test:unit": "tsx --test tests/unit/*.test.ts",
"test:e2e": "playwright test"
```

`next typegen` обязателен перед `tsc` в CI. Он генерирует `PageProps`/`LayoutProps`, типы `next/root-params` и `en.d.json.ts`. Без него на чистом checkout `tsc` падает на route-типах (`Cannot find name 'LayoutProps'`), а без `en.d.json.ts` неверный ICU-аргумент (`count: 'x'` вместо числа) молча проходит проверку ([01-setup.md](./01-setup.md#5-плагин-nextconfigts)). `--incremental false` — чтобы `tsc` не опирался на устаревший `tsconfig.tsbuildinfo` после правок ICU-аргументов.

## 4. Маршруты под `[locale]`

1. **Корневой layout.** Перенеси содержимое `app/layout.tsx` (шрифты, провайдеры, аналитику) в `app/[locale]/layout.tsx` и слей с [layout шаблона](../src/app/[locale]/layout.tsx). Оттуда нужны:
   - `generateStaticParams` по `routing.locales`;
   - `export const dynamicParams = false` (см. предупреждение ниже);
   - `generateMetadata` с `metadataBase: SITE_URL` и шаблоном title;
   - `<html lang dir>` из `getLocale()` и `TEXT_DIRECTION`;
   - `<ClientMessages namespaces={['error']}>` вокруг дерева: клиенту уходит только namespace `error`.

   Потом **удали `app/layout.tsx`**. Пока он существует, корневой layout — он, `[locale]` не root param: `next typegen` генерирует `next/root-params` без экспортов («No root params detected»), а `next build` падает на `request.ts` с `Export locale doesn't exist in target module` ([02-app-router.md](./02-app-router.md)).

   > **`dynamicParams = false` в корневом layout действует на все вложенные динамические сегменты.** Любой slug вне их `generateStaticParams` получает 404, а не рендер по запросу. `export const dynamicParams = true` ниже по дереву это не отменяет: проверено на Next.js 16.4.3 сборкой, override на странице, на layout сегмента и на layout родителя дал 404, без строки в корневом layout — 200. Если у тебя есть slug'и из CMS, которые рендерятся по запросу, убери эту строку из корневого layout. Неизвестную локаль всё равно отсечёт `notFound()` в `request.ts`. С Cache Components `dynamicParams` не поддерживается вовсе: убери его и из корневого layout, и из `opengraph-image.tsx`.
2. **Страницы.** `app/page.tsx` → `app/[locale]/page.tsx` и так далее для всех публичных страниц. На верхнем уровне `app/` остаются Route Handlers (`app/api/**`), `sitemap.ts`, `robots.ts`, иконки и manifest: корневой layout им не нужен.
3. **Локаль в страницах** читай через `getLocale()` и `getTranslations('ns')` без `params` и без `setRequestLocale`. Типы — `LayoutProps<'/[locale]'>`, `PageProps<'/[locale]/…'>` (генерирует `next typegen`).
4. **404 и ошибки.** Скопируй и адаптируй:
   - [`[locale]/not-found.tsx`](../src/app/[locale]/not-found.tsx) — локализованная 404, Server Component;
   - [`[locale]/[...rest]/page.tsx`](../src/app/[locale]/[...rest]/page.tsx) — превращает неизвестный URL внутри локали в `notFound()`;
   - [`app/global-not-found.tsx`](../src/app/global-not-found.tsx) — 404 для URL без маршрута, со своими `<html>`/`<body>`. Нужен флаг `experimental.globalNotFound: true` в `nextConfig`;
   - [`app/not-found.tsx`](../src/app/not-found.tsx) — 404 для `notFound()` из `request.ts`, **без** `<html>`/`<body>`: Next.js оборачивает его в свой документ;
   - [`[locale]/error.tsx`](../src/app/[locale]/error.tsx) и [`app/global-error.tsx`](../src/app/global-error.tsx) — проп `retry`. Он стабилен с Next.js 16.3, а `unstable_retry` удалён без алиаса, так что старые error boundary с ним падают `TypeError` при нажатии на кнопку.

   Если в проекте уже есть catch-all (например, страницы из CMS в `app/[...slug]`), перенеси его под `[locale]`. `[...rest]` тогда не нужен: для неизвестного slug вызывай `notFound()` в самом catch-all. Для CMS-страниц, которые рендерятся по запросу, учти предупреждение о `dynamicParams` выше. Подробнее — [09-error-pages.md](./09-error-pages.md).

После этого шага сайт уже должен собираться: `npm run typecheck && npm run build`. В выводе сборки страницы под `[locale]` должны быть `●` (SSG). Исключение — `[locale]/[...rest]`: он `ƒ` и в шаблоне. Если `ƒ` стали обычные страницы, ищи, кто читает `headers()`/`cookies()` или деструктурирует `requestLocale`.

## 5. Proxy

- **Middleware нет.** Скопируй `src/proxy.ts`. Он лежит рядом с `app/`, то есть в `src/`, если проект использует `src/`.
- **Есть `middleware.ts`.** Переименуй его codemod'ом (`npx @next/codemod@latest middleware-to-proxy .`) и скомпонуй с next-intl. Готовые примеры для auth и CSP nonce — в [01-setup.md](./01-setup.md#композиция-auth-проверка-в-proxy). Главная ловушка — проверка пути без учёта префикса локали: `/ru/admin` обходит `startsWith('/admin')`. Если middleware работал на Edge runtime, учти: proxy работает на Node.js runtime, а `runtime` в нём задать нельзя, Next.js бросит ошибку.
- **Matcher.** Исключи нелокализованные пути (админку, вебхуки, `/docs`): иначе proxy перепишет `/admin` в `/en/admin`, и запрос получит 404. Сохрани исключение `opengraph-image`, если берёшь OG-картинки. Пути с точкой matcher пропускает мимо proxy. В шаблоне `api` привязан к сегменту (`api(?:/|$)`), а matcher из документации next-intl отрезает и `/api-docs`. Подробности — в [01-setup.md](./01-setup.md#matcher-что-важно-знать). Перенеси и unit-тест matcher ([tests/unit/proxy-matcher.test.ts](../tests/unit/proxy-matcher.test.ts)), дописав в него свои пути.
- **Не импортируй `@/shared/i18n/navigation` в proxy:** сборка падает с `'next/root-params' can only be used inside the App Directory` и `Export locale doesn't exist in target module`.

## 6. Строки → сообщения

- `en.json` — source of truth: из него выводятся типы. Остальные локали зеркалят его ключи. Namespace заводи по странице или фиче (`home`, `contact`).
- **Server Components** (большинство): `getTranslations('ns')` в async-компонентах, `useTranslations('ns')` в не-async. Сообщения остаются на сервере.
- **Client Components** получают только то, что им передали. Layout отдаёт клиенту лишь `error`. Островок страницы оборачивай в `<ClientMessages namespaces={['ns']}>`. Если нужна пара строк, проще передать переведённый текст пропом: так сделаны `LangSwitcher` и `ErrorTrigger`. Вложенный провайдер **заменяет** `messages`, а не сливает их ([03-translations.md](./03-translations.md)).
- ICU: плюралы с полными CLDR-категориями для каждой локали (для `ru`/`uk` это `one`/`few`/`many`/`other`). Числа выводи через `#` внутри `plural` или через `{n, number}`, чтобы они форматировались по локали ([04-icu-messages.md](./04-icu-messages.md)). `npm run check:translations` ловит расхождения ключей, аргументов, тегов и plural-категорий.

## 7. Навигация

- Замени `next/link` на [`@/shared/ui/Link`](../src/shared/ui/Link.tsx) в локализованных страницах. `href` указывай канонический (`/about`), без префикса: префикс и `pathnames` подставятся сами.
- `useRouter`, `usePathname`, `redirect`, `permanentRedirect`, `getPathname` бери из `@/shared/i18n/navigation`. `useParams`, `useSearchParams` и `notFound` остаются из `next/navigation`. Это закреплено ESLint: `no-restricted-imports` в [eslint.config.mjs](../eslint.config.mjs) запрещает `next/link` и `useRouter`/`usePathname`/`redirect`/`permanentRedirect` из `next/navigation` (исключение — две корневые 404 без локали). Перенеси правило вместе с ядром.
- Захардкоженные URL с префиксом (`/ru/...`) замени на канонические. Абсолютные URL для внешних сервисов, писем и metadata строй через `localizePath` + `absoluteUrl`.
- Переключатель языка: [06-navigation.md](./06-navigation.md).

## 8. Где root params недоступны

`next/root-params` работает только в Server Components. В остальных местах локаль передаётся явно:

| Где | Как в шаблоне |
|---|---|
| Server Actions | `action.bind(null, locale)` в Server Component, в action — `hasLocale` и `getTranslations({ locale, namespace })` ([12-server-actions.md](./12-server-actions.md)) |
| Route Handlers | В шаблоне их нет. Бери локаль из URL, тела запроса или cookie, затем `getTranslations({ locale, namespace })` ([12-server-actions.md](./12-server-actions.md#route-handlers)) |
| `opengraph-image` (и `generateImageMetadata`, если используешь) | Из `params` + `hasLocale`, затем `getTranslations({ locale, namespace })` ([07-metadata-seo.md](./07-metadata-seo.md)) |

Server Action, который вызывает `getTranslations('ns')` без локали, падает с 500: `request.ts` зовёт `rootParams.locale()`, а в Server Action это ошибка («`import('next/root-params').locale()` was used inside a Server Action. This is not supported»). В старой схеме он получал локаль из заголовка, который ставил proxy. С `next/root-params` этот путь больше не работает, поэтому при миграции такие actions нужно найти все.

## 9. SEO

- Задай `SITE_URL` в каждом окружении: от него строятся `metadataBase`, canonical, hreflang, sitemap и robots ([site.ts](../src/shared/config/site.ts)).
- В `generateMetadata` каждой страницы вызывай `buildPageMetadata({ href, title, description, noindex? })`. Страница со своим `openGraph` заменяет объект layout целиком, поэтому хелпер собирает его полностью ([07-metadata-seo.md](./07-metadata-seo.md)).
- `sitemap.ts`: по `<url>` на каждую пару «страница × локаль» с полным набором hreflang. Источник страниц — свой.
- OG-картинка ([opengraph-image.tsx](../src/app/[locale]/opengraph-image.tsx)) грузит шрифт с Google Fonts во время сборки, как и `next/font/google` в layout. Для сборки без сети положи `.ttf` в репозиторий (вариант описан в комментарии к файлу).

## 10. Проверки и CI

- [scripts/check-translations.ts](../scripts/check-translations.ts) переносится как есть, если ядро лежит в `src/shared/i18n`. Иначе поправь импорт `routing` и `MESSAGES_DIR`.
- [tests/unit](../tests/unit) переносятся как есть: тест matcher proxy и тест `splitHref`. Они идут на `node:test` через `tsx --test`, без сборки и браузера.
- [tests/e2e](../tests/e2e) написаны под маршруты и тексты шаблона. Целиком они не переносятся. Возьми [fixtures.ts](../tests/e2e/fixtures.ts) (тест падает на любой console error — hydration mismatch, клиентский `MISSING_MESSAGE` — и на 404 любого запроса, кроме самого документа) и паттерны спеков: редиректы, 404, hreflang, клиентский payload, переключатель языка.
- [.github/workflows/ci.yml](../.github/workflows/ci.yml): `check:translations` → lint → `typecheck` → build → `npm test` (unit, затем e2e против production-сборки), с `SITE_URL` в env.
- Подробности — [14-testing.md](./14-testing.md).

## Нелокализованные разделы

Если часть страниц должна жить без `[locale]` (например, `app/(admin)/admin/...`), ей нужен **свой** корневой layout. Тогда в проекте несколько root layouts. Последствия:

- `rootParams.locale()` типизируется как `string | undefined` и для этих маршрутов возвращает `undefined` (документация Next.js, `next/root-params` → «Multiple root layouts»). Клади такой layout под статический сегмент: `app/(admin)/admin/layout.tsx`. Если он лежит прямо в группе (`app/(admin)/layout.tsx`), рантайм работает, но `next typegen` в Next.js 16.4.3 пишет «No root params detected», и `next/root-params` остаётся без типов.
- `request.ts` шаблона вызовет `notFound()` на любом вызове next-intl оттуда. Если такие страницы используют next-intl, отличай «маршрут без локали» от «неверной локали». Пример ниже собран по документации Next.js и next-intl (блог «Using next/root-params») и проверен сборкой копии шаблона: страница под `app/(admin)/admin/layout.tsx` с `getTranslations('site')` получает `defaultLocale`, а `/api/<что угодно>` по-прежнему отдаёт 404.

```ts
// src/shared/i18n/request.ts — example for multiple root layouts (not used in the template)
if (!locale) {
  const param = await rootParams.locale()
  if (param === undefined) {
    // A root layout without [locale], e.g. app/(admin)/admin/layout.tsx
    locale = routing.defaultLocale
  } else if (hasLocale(routing.locales, param)) {
    locale = param
  } else {
    notFound()
  }
}
```

- Исключи эти пути из matcher proxy (шаг 5).
- Переход между разными root layouts — это полная перезагрузка страницы, а не soft-навигация.

## Миграция со старой схемы next-intl

Признаки старой схемы: `setRequestLocale` в страницах, `requestLocale` в `request.ts`, pass-through `app/layout.tsx` (`return children`), `middleware.ts`. Порядок миграции:

1. `request.ts`: `async ({ requestLocale })` → `async ({ locale })` + `rootParams.locale()` и `notFound()` для неизвестного значения ([01-setup.md](./01-setup.md#откуда-берётся-локаль)). `requestLocale` нельзя даже деструктурировать: геттер читает `headers()`, и сайт становится динамическим.
2. Удали pass-through `app/layout.tsx`. `<html>`/`<body>` уже должны быть в `[locale]/layout.tsx`. Корневые 404 (`global-not-found.tsx` и `not-found.tsx`) — по схеме шага 4.
3. Удали `setRequestLocale` из всех страниц и layout (deprecated с next-intl 4.13.5). `generateStaticParams` в `[locale]/layout.tsx` **оставь**.
4. В layout `const { locale } = await params` → `const locale = await getLocale()`. Получишь union-тип `Locale` без кастов.
5. В `generateMetadata` убери `getTranslations({ locale, namespace })`: хватает `getTranslations('ns')`.
6. В Server Actions, Route Handlers и OG-картинках, наоборот, **добавь** явную локаль (шаг 8).
7. `middleware.ts` → `proxy.ts` (codemod).
8. Проверь: `npm run typecheck`, `npm run build` (страницы `●`), e2e.

## Проект без FSD

Ядро шаблона лежит в слое `shared/` по Feature-Sliced Design ([FSD_GUIDE.md](./FSD_GUIDE.md)), но от FSD не зависит. В проекте без FSD положи его в инфраструктурный каталог (`lib/`, `core/`, что принято):

| Шаблон | Проект без FSD |
|---|---|
| `src/shared/i18n/` | `<infra>/i18n/` |
| `src/shared/config/locales.ts`, `site.ts` | `<infra>/i18n/locales.ts`, `<infra>/site.ts` |
| `src/shared/seo/` | `<infra>/seo/` |
| `src/shared/ui/Link.tsx`, `src/shared/lib/href.ts`, `src/shared/lib/search-params.ts` | `<ui>/Link.tsx`, `<infra>/href.ts`, `<infra>/search-params.ts` |
| `src/features/locale-switch/` | `<components>/LangSwitcher.tsx` |
| `src/proxy.ts`, `src/global.d.ts` | там же, в корне `src/` (или проекта) |

При переезде поправь пути в местах, которые ссылаются на ядро не через `@/shared/...`:

- `src/proxy.ts` и `src/global.d.ts` — относительные импорты `./shared/i18n/...`;
- `next.config.ts` — `requestConfig` и `createMessagesDeclaration`;
- `.gitignore` — путь к `*.d.json.ts`;
- `scripts/check-translations.ts` — импорт `routing` и `MESSAGES_DIR`;
- `tests/e2e/fixtures.ts`, `tests/e2e/routing.spec.ts`, `tests/e2e/i18n.spec.ts` и `tests/unit/href.test.ts` — относительные импорты `../../src/shared/...`; `tests/unit/proxy-matcher.test.ts` читает `src/proxy.ts` по пути;
- импорты `@/shared/...` внутри скопированных файлов.

В `no-restricted-imports` ([eslint.config.mjs](../eslint.config.mjs)) две части: `paths` запрещают `next/link` и навигацию из `next/navigation` (шаг 7, нужны и без FSD), `patterns` — границы FSD-слайсов. Без FSD переноси только `paths`.

## Не переносить: демо

Эти файлы существуют, чтобы показать паттерны. В реальный проект их не копируют:

- `src/entities/post/` — захардкоженный блог; `src/features/contact/` — демо-форма (Server Action + zod). Как паттерн смотри [12-server-actions.md](./12-server-actions.md).
- `src/widgets/site-header/` — демо-шапка. Полезна как пример, как передать `LangSwitcher` подписи пропами.
- `src/app/[locale]/{about,blog,contact,demo}/` и их `_components/`.
- Namespace демо в `messages/*.json`: `home`, `about`, `plurals`, `formats`, `errorsDemo`, `blog`, `contact`, `contactForm`, `header`.
- Спеки `tests/e2e/*.spec.ts` — как образец, не как есть.

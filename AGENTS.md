<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# next-intl specifics in this template

Шаблон — эталон локализации для Next.js 16.4 + next-intl 4.14. Ключевое поведение закреплено тестами (`tests/unit`, `tests/e2e`). Подробности, обоснования и замеры — в `docs/`.

## Файловые конвенции
- `src/proxy.ts` (не `middleware.ts` — Next.js 16 переименовал), импорт остаётся `next-intl/middleware`. Matcher пропускает сегмент `api` (но не `/apiary`), всё, что начинается с `/_next` и `/_vercel`, сегмент `opengraph-image` на любой глубине и любой путь с точкой (не только `/favicon.ico`, но и `/blog/v1.2`); исключённые пути идут мимо ВСЕЙ логики proxy (учитывай при композиции с auth/CSP). Поведение закреплено в `tests/unit/proxy-matcher.test.ts`.
- **Нет `src/app/layout.tsx`.** Корневой layout — `src/app/[locale]/layout.tsx`: только так `[locale]` становится root param и работает `next/root-params`. Не добавляй pass-through layout обратно.
- 404: `[locale]/not-found.tsx` (Server Component, локализованный) + `[locale]/[...rest]/page.tsx` (ловит `/ru/foo`, а также `/xx/about` — proxy считает `xx` путём). `src/app/global-not-found.tsx` (флаг `experimental.globalNotFound`, свои `<html lang="en">/<body>`) — для URL без маршрута (`/unknown.txt`). `src/app/not-found.tsx` БЕЗ `<html>/<body>` — для `notFound()` из `request.ts` вне proxy (`/api/foo`); свой `<html>` там даёт ошибку гидрации (проверено в dev). На Next 16.4.3 любой `notFound()` во время запроса (`/ru/foo`, `/xx/about`, `/api/foo`) отдаёт 404 и `noindex`, но SSR-HTML — пустая оболочка `<html id="__next_error__">`, а саму 404 браузер рисует из RSC payload. Из 404 шаблона полный HTML с сервера получает только пререндеренная `global-not-found` (`/unknown.txt`). Статус и `noindex` видны и в `curl`, а содержимое 404 проверяй в браузере (`docs/09-error-pages.md`).
- `src/shared/i18n/` — ядро: `routing.ts`, `request.ts`, `navigation.ts` (+ `localizePath`), `ClientMessages.tsx`, `messages/{en,ru,uk}.json`. `en.json` — source of truth; `en.d.json.ts` рядом генерируется (`createMessagesDeclaration`) и в git не хранится.
- `src/shared/seo/` — `buildPageMetadata`, alternates/hreflang, путь OG-картинки (`ogImagePath`) и `OG_LOCALE`. Сама картинка лежит в `src/app/[locale]/opengraph-image.tsx`, по одной на локаль, и пререндерится при сборке. `src/shared/config/site.ts` — `SITE_URL` (env).
- FSD-слайсы `src/{entities,features,widgets}/<slice>/` (сегменты `ui/`, `api/`, `model/` по необходимости + барель `index.ts`). Импорт из чужого слайса — только через барель (ESLint `no-restricted-imports`). Клиентские островки одной страницы — в `src/app/[locale]/<route>/_components/`.

## Локаль на сервере — `next/root-params`
- `request.ts` читает локаль через `rootParams.locale()` и вызывает `notFound()` для неизвестной. **`setRequestLocale` не нужен и не используется** (deprecated с next-intl 4.13.5). `generateStaticParams` в `[locale]/layout.tsx` по-прежнему нужен: без него страницы рендерятся по запросу (`ƒ` вместо `●` в выводе `next build`), а вместе с `dynamicParams = false` сборка падает. Он же задаёт список разрешённых локалей.
- В `getRequestConfig` не деструктурируй `requestLocale` (deprecated с 4.13.6). Это геттер, который вызывает `headers()`: одна деструктуризация, даже без чтения значения, переводит все страницы в динамический рендеринг. Используй аргумент `locale` (override от вызывающего).
- Server Components, включая `generateMetadata`: `getLocale()`, `getTranslations('ns')` — без явного `locale`.
- Где root params недоступны — передавай локаль явно: `getTranslations({ locale, namespace })`. Это Server Actions, Route Handlers, metadata-роуты картинок (`opengraph-image`, `generateImageMetadata`) и `generateStaticParams` самого `[locale]/layout.tsx`. Во вложенных `generateStaticParams` `getLocale()`/`getTranslations('ns')` работают.
- `[locale]/layout.tsx` экспортирует `dynamicParams = false`: неизвестные локали и slug сразу дают 404, страница по запросу не генерируется. `false` в ЛЮБОМ сегменте закрывает весь маршрут (вложенный `dynamicParams = true` его не открывает), поэтому проект с параметрами из CMS удаляет эту строку и полагается на `notFound()` в `request.ts` и страницах. С `cacheComponents` экспорт тоже нужно убрать (там не поддерживается).
- Server Action: привязывай локаль в Server Component — `<ContactForm action={submitContact.bind(null, locale)} />`, в action проверяй `hasLocale`: bound-аргументы приходят от клиента (в HTML формы это скрытое поле `$ACTION_1:1`). `.bind` внутри Client Component на Next 16.4.3 вешает сервер при отправке формы без JS: ответа нет, `next-server` держит ~100% CPU и не отвечает на другие запросы (`docs/12-server-actions.md`).

## Типы
- Layout: `LayoutProps<'/[locale]'>`; страницам params обычно не нужны, а если нужны — `PageProps<'/[locale]/blog/[slug]'>` (глобальные хелперы из `next typegen`).
- Тип локали: `import type { Locale } from 'next-intl'` (выведен из `routing.locales` в `src/global.d.ts`).
- `npm run typecheck` = `next typegen && tsc --noEmit --incremental false`: route types, `next/root-params` и `en.d.json.ts` — сгенерированные файлы.
- ICU-аргументы строго типизированы: `{count, plural, …}` требует number, `{name}` — обязательный аргумент.

## Переводы и клиент
- Server Component: `getTranslations('ns')` (async) или `useTranslations('ns')` (не-async) — сообщения остаются на сервере.
- Client Component: `useTranslations('ns')`, но namespace должен быть передан провайдером. Layout отдаёт клиенту только `error` (для `error.tsx`). Островок страницы оборачивай в `<ClientMessages namespaces={['ns']}>`. У клиентского компонента свой namespace (`contactForm`), серверные строки страницы (`contact`: title, intro, errors) на клиент не уходят. Для пары строк проще передать переведённый текст пропом (так сделаны `LangSwitcher`, `ErrorTrigger`).
- `onError`/`getMessageFallback` из `request.ts` действуют только на сервере.
- `error.tsx` и `global-error.tsx` — `'use client'`, проп `retry` (стабилен с Next 16.3; `unstable_retry` из 16.2 в 16.4.3 уже не передаётся), типы `Pick<ErrorInfo, 'error' | 'retry'>` из `next/error`.

## Навигация
- `<Link>` — из `@/shared/ui/Link` (default export): обёртка с `href: string`, чтобы не перечислять все маршруты в `pathnames`. Query и hash во внутренних путях поддерживаются (`/about?ref=terms` → `/ru/o-nas?ref=terms`); якоря, внешние URL и `mailto:` проходят как есть (`src/shared/lib/href.ts`, `tests/unit/href.test.ts`).
- `pathnames` держим минимальным: только маршруты с РАЗНЫМИ URL по локалям.
- `useRouter`, `usePathname`, `redirect`, `getPathname`, `localizePath` — из `@/shared/i18n/navigation`, не из `next/navigation`. ESLint запрещает `next/link`, а из `next/navigation` — `useRouter`, `usePathname`, `redirect`, `permanentRedirect` (исключение — два корневых 404).
- `LangSwitcher`: `router.replace({ pathname, params, query }, { locale })` с `useParams` из `next/navigation`. Query читается из `window.location` в момент смены — не через `useSearchParams` (это выбросило бы переключатель из статического HTML). `#hash` при смене языка не сохраняется (router next-intl его не учитывает).
- `localeDetection` включён: ЛЮБОЙ URL без префикса (не только `/`) редиректит по cookie `NEXT_LOCALE`, затем по `Accept-Language` (`/about` у русского браузера → 307 `/ru/o-nas`). В тестах и `curl` задавай `Accept-Language` явно. Ответ на такой URL зависит от заголовков, которых нет в `Vary`, — про CDN см. `docs/15-production-checklist.md`.
- Cookie `NEXT_LOCALE` — сессионная (дефолт next-intl). При смене языка через next-intl `Link`/`useRouter` её ставит клиент. Proxy ставит её только на document-запросах и только если локаль страницы отличается от cookie или (без cookie) от `Accept-Language`.

## SEO
- `generateMetadata` каждой страницы (кроме catch-all `[...rest]`) → `buildPageMetadata({ href, title, description, absoluteTitle?, noindex? })`: canonical, hreflang (+ `x-default`), OpenGraph/Twitter, og:image своей локали.
- Абсолютные URL — от `SITE_URL` (`absoluteUrl`), hreflang в sitemap и в `<head>` — из одного `buildLanguageUrls`. Link-заголовок proxy выключен (`alternateLinks: false`).

## Проверки
`npm run check:translations`, `npm run lint`, `npm run typecheck`, `npm run build`, затем `npm test` (`test:unit` — node:test без сборки, `test:e2e` — Playwright против production-сборки). Всё это гоняет CI (`.github/workflows/ci.yml`).

## Добавление новой локали
1. `src/shared/i18n/routing.ts`: код в `locales` (+ `pathnames`, если URL локализованы).
2. `src/shared/i18n/messages/<code>.json` зеркально к `en.json`. `check:translations` проверит ключи, ICU и plural-категории CLDR этой локали.
3. `OG_LOCALE` в `src/shared/seo/og-locale.ts` и `TEXT_DIRECTION` в `src/shared/config/locales.ts` (`'rtl'` для арабского, иврита, фарси) — TypeScript потребует обе записи, а заодно переводы демо-постов в `src/entities/post/api/posts.ts` (тоже `Record<Locale, …>`).
4. Шрифт: Geist покрывает латиницу, кириллицу и вьетнамский — для них хватит subset в `Geist({ subsets })` в `[locale]/layout.tsx`. Для других письменностей (арабская, иврит, греческая, CJK) подключи второй `next/font` (например, Noto Sans Arabic) и добавь его переменную в `src/shared/styles/globals.css`: в `font-family` у `body` (основной текст берёт шрифт оттуда) и в `--font-sans`. В `opengraph-image.tsx` передай в `fonts` шрифт этой письменности.
5. `LOCALE_NATIVE_NAMES` вычислится через `Intl.DisplayNames` — проверь, как выглядит название. Обход страниц и проверка `<html lang dir>` в e2e подхватят локаль сами (`LOCALES = routing.locales`).

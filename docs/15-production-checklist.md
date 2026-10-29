# Чек-лист: локализация в продакшне

Пройди этот список перед релизом проекта, в который локализация внедрена по этому шаблону. У каждого пункта три части: что сделать, почему, где подробнее. Развёрнутые объяснения лежат в профильных документах, здесь их нет. Перенос файлов описан в [PORTABILITY.md](./PORTABILITY.md), устройство проверок — в [14-testing.md](./14-testing.md).

## 1. Окружение и сборка

- [ ] **`SITE_URL` задан в каждом окружении: production, staging, preview, self-hosted.** От него строятся `metadataBase`, canonical, hreflang, `sitemap.xml` и `robots.txt` ([site.ts](../src/shared/config/site.ts)). Если переменной нет, берётся `https://$VERCEL_PROJECT_PRODUCTION_URL`, а вне Vercel — `http://localhost:3000`. В последнем случае canonical продакшна укажет на localhost.
- [ ] **После смены `SITE_URL` проект пересобран.** Статические страницы получают значение в момент сборки. Если один Docker-образ разворачивается в нескольких окружениях, во всех будет origin той сборки, так что собирай образ под каждое окружение.
- [ ] **e2e запускаются с тем же `SITE_URL`, что и сборка.** Тесты сверяют с ним canonical, hreflang и sitemap ([fixtures.ts](../tests/e2e/fixtures.ts)).
- [ ] **В [request.ts](../src/shared/i18n/request.ts) стоят свой `timeZone` и своя валюта.** В шаблоне это `'Europe/Kyiv'` и `currency: 'EUR'`. Если зону не задать, используется зона машины, на которой идёт сборка, и в SSG она попадает прямо в HTML. Подробнее в [05-formatting.md](./05-formatting.md).
- [ ] **У сборки есть доступ к Google Fonts.** Он нужен и `next/font/google` в layout, и загрузчику шрифта OG-картинки. Если сборка изолирована от сети, держи шрифты в репозитории: в layout подключай их через `next/font/local`, а для OG-картинки читай `.ttf` через `fs.readFile` (эта альтернатива описана в комментарии [opengraph-image.tsx](../src/app/[locale]/opengraph-image.tsx)).
- [ ] **Демо удалено:** `/demo/*`, блог, контактная форма и их namespace в `messages/*.json`. Полный список — в [PORTABILITY.md](./PORTABILITY.md).

## 2. Откуда берётся локаль

- [ ] **Язык задаёт URL, а сервер читает его через `next/root-params`.** Root layout — `[locale]/layout.tsx`, файла `src/app/layout.tsx` нет. Если он есть, `[locale]` перестаёт быть root param, а в сгенерированных типах `next typegen` появляется «No root params detected». `setRequestLocale` не используется. `requestLocale` в `getRequestConfig` не деструктурируй: это геттер с `headers()`, и весь сайт станет динамическим. Подробнее в [02-app-router.md](./02-app-router.md).
- [ ] **После `npm run build` страницы под `[locale]` помечены `●` (SSG).** Исключение — `[locale]/[...rest]`: он помечен `ƒ`, и это нормально, потому что он только вызывает `notFound()`. Если `ƒ` стоит у обычной страницы, значит, какой-то код сделал её динамической: например, деструктуризация `requestLocale`, чтение `headers()` или `cookies()`.
- [ ] **Там, где root params нет, локаль передаётся явно:** `getTranslations({ locale, namespace })`. Это Server Actions, Route Handlers, metadata-роуты картинок (`opengraph-image`, `generateImageMetadata`) и `generateStaticParams` самого `[locale]/layout.tsx`. Во вложенных `generateStaticParams` root params доступны. Action без явной локали отвечает HTTP 500: `next/root-params` бросает «was used inside a Server Action. This is not supported».
- [ ] **Локаль для Server Action привязана в Server Component и проверена в action.** На странице это выглядит так: `<ContactForm action={submitContact.bind(null, locale)} />` ([contact/page.tsx](../src/app/[locale]/contact/page.tsx)). Внутри action локаль проверяется через `hasLocale`, потому что bound-аргументы приходят от клиента. `.bind` внутри Client Component (вместе с `useActionState`) на Next 16.4.3 вешает сервер при отправке формы без JS: ответа нет, `next-server` держит ~100% CPU и не отвечает на другие запросы. Подробнее в [12-server-actions.md](./12-server-actions.md).
- [ ] **Matcher proxy подходит под твои URL.** Proxy не вызывается для `api`, `_next`, `_vercel`, путей с точкой и `opengraph-image` ([proxy.ts](../src/proxy.ts)). Поэтому URL дефолтной локали с точкой (`/blog/v1.2`) proxy пропустит: сегмент `blog` станет значением `[locale]`, и ответом будет корневая 404. Добавляешь под `[locale]` другие metadata-роуты (`twitter-image`, `icon`)? Исключи их из matcher так же, как `opengraph-image`, иначе `as-needed` начнёт редиректить их версии для дефолтной локали. Matcher закреплён тестом [proxy-matcher.test.ts](../tests/unit/proxy-matcher.test.ts): правишь matcher — правь и тест.
- [ ] **Внутренние ссылки строятся через `@/shared/ui/Link` и `localizePath`, а не через `next/link`.** Иначе не применятся префикс локали и `pathnames`. ESLint запрещает `next/link`, а из `next/navigation` — `useRouter`, `usePathname`, `redirect` и `permanentRedirect`. Подробнее в [06-navigation.md](./06-navigation.md).

## 3. Сообщения и типы

- [ ] **Клиент получает только те сообщения, которые нужны странице.** Layout отдаёт на клиент только namespace `error` (для `error.tsx`). Клиентский островок страница оборачивает в `<ClientMessages namespaces={['contactForm']}>` ([contact/page.tsx](../src/app/[locale]/contact/page.tsx)). У клиентского компонента свой namespace, а серверные строки страницы (`contact`) на клиент не уходят. Если строк всего пара, передай готовый текст пропом. Вложенный провайдер **заменяет** `messages` родителя, а не дополняет их, поэтому перечисляй все namespace поддерева. Подробнее в [03-translations.md](./03-translations.md).
- [ ] **Забытый на клиенте namespace ловит e2e.** Fixture роняет тест на любую ошибку в консоли, в том числе на `MISSING_MESSAGE`, на необработанное исключение и на 404 любого запроса, кроме самого документа на 404-страницах. Статические проверки этого не видят: `check:translations` и `tsc` молчат, а `next build` только печатает `MISSING_MESSAGE` в лог и завершается успешно.
- [ ] **ICU-аргументы строго типизированы, а `next typegen` выполняется в CI.** Для этого нужны `createMessagesDeclaration` в [next.config.ts](../next.config.ts), `allowArbitraryExtensions` в tsconfig и `*.d.json.ts` в `.gitignore`. На чистом checkout сгенерированных файлов нет, поэтому скрипт выглядит так: `"typecheck": "next typegen && tsc --noEmit --incremental false"`. Без `next typegen` `tsc` падает на `LayoutProps`/`PageProps`, а `en.json` получает рыхлые типы, и неверные ICU-аргументы молча проходят.
- [ ] **В CI идут `check:translations`, `lint`, `typecheck`, `build` и `test`** ([ci.yml](../.github/workflows/ci.yml)). `npm test` запускает unit-тесты хелперов (`test:unit`, node:test без сборки) и e2e против production-сборки (`test:e2e`). `check:translations` проверяет паритет ключей и типов значений, синтаксис ICU, аргументы и вид их значения, склонение по числу, ключи `select`, теги, пустые строки и plural-категории CLDR каждой локали. Можно добавить линтер сообщений `@eloqnt/cli` (его запускает скрипт `lint` официального `example-app-router`), но в шаблоне он не проверялся. Подробнее в [14-testing.md](./14-testing.md).
- [ ] **`MISSING_MESSAGE` в проде считается багом, а не шумом.** Ключи, которых нет в активной локали, `loadMessages` уже подставляет из `en.json`. Значит, до `onError` доходит только ключ, которого нет и в `en.json`, то есть опечатка или динамический ключ.

## 4. Cookie, CDN и кеш

- [ ] **Решено, нужна ли постоянная cookie `NEXT_LOCALE`.** По умолчанию она сессионная. Proxy ставит её и тем, кто язык не выбирал, например при заходе по `/ru`-ссылке из англоязычного браузера. Поэтому долгоживущая cookie — вопрос согласия по GDPR/ePrivacy. Если согласие есть, включай явно: `localeCookie: { maxAge: 60 * 60 * 24 * 365 }`. Если язык определяется только по URL, ставь `localeCookie: false` и вместе с ним `localeDetection: false`. Без второго при `as-needed` пользователь с «чужим» `Accept-Language` не сможет остаться на дефолтной локали. Подробнее в [13-locale-persistence.md](./13-locale-persistence.md).
- [ ] **Язык пользователя после логина выставляется в Server Action.** Сначала `(await cookies()).set('NEXT_LOCALE', …)` с теми же атрибутами, что в `routing.localeCookie`, затем `redirect({ href, locale })` из `@/shared/i18n/navigation`. Серверный redirect сам cookie не синхронизирует. Подробнее в [13-locale-persistence.md](./13-locale-persistence.md).
- [ ] **Proxy выполняется до CDN-кеша.** Ответ на URL без префикса зависит от cookie и `Accept-Language`, но этих заголовков нет в `Vary`, а сам ответ приходит с `s-maxage` на год (на запрос без `Accept-Language` — ещё и с `Set-Cookie: NEXT_LOCALE`). На Vercel порядок правильный. Если CDN стоит перед приложением, есть два пути. Первый: не кешировать URL без префикса в общем кеше (или добавить в ключ кеша `NEXT_LOCALE` и язык из `Accept-Language`) и не кешировать 307. Второй: сделать страницы однозначными по URL через `localePrefix: 'always'` (тогда без префикса остаются только 307, их не кешируй) или через `localeDetection: false` вместе с `localeCookie: false`. Подробнее в [13-locale-persistence.md](./13-locale-persistence.md).

## 5. SEO

- [ ] **`generateMetadata` каждой индексируемой страницы возвращает `buildPageMetadata({ href, title, description })`.** Хелпер собирает canonical, hreflang с `x-default`, OpenGraph, Twitter и og:image нужной локали ([metadata.ts](../src/shared/seo/metadata.ts)). Он закрывает две ловушки. Страница без своего `openGraph` наследует объект layout: если og:title задан в layout, у всех страниц он будет заголовком главной, и ни у одной не будет своих og:url и og:locale. Страница со своим `openGraph` заменяет объект layout целиком и теряет og:image из file convention. Подробнее в [07-metadata-seo.md](./07-metadata-seo.md).
- [ ] **Новая страница добавлена в `STATIC_PAGES` в [sitemap.ts](../src/app/sitemap.ts).** Динамические страницы добавляются через `entriesFor`, как посты блога. На каждую пару «страница × локаль» получается свой `<url>`.
- [ ] **Служебные страницы помечены `noindex: true` и не попали в sitemap.**
- [ ] **hreflang приходит только из metadata и sitemap.** `alternateLinks: false` остаётся: заголовок `Link` от proxy строился бы от хоста запроса, а не от `SITE_URL`.
- [ ] **После деплоя проверено вживую:** canonical и hreflang в `<head>`, `/sitemap.xml`, `/robots.txt` и `/<locale>/opengraph-image`. Все URL должны быть на боевом домене, картинка не должна редиректить для дефолтной локали, а `/xx/opengraph-image` должен отвечать 404.

## 6. Ошибки и 404

- [ ] **404 работает на всех трёх уровнях.** `[locale]/not-found.tsx` — локализованная, это Server Component с `useTranslations`. `[locale]/[...rest]/page.tsx` превращает `/ru/foo` в `notFound()`. Запросы без локали, которые matcher пропускает, получают корневую 404: `src/app/global-not-found.tsx` (флаг `experimental.globalNotFound`) для URL без маршрута и `src/app/not-found.tsx` без `<html>`/`<body>` для `notFound()` из `request.ts`. Проверь в браузере: `/ru/foo` отдаёт 404 с `lang="ru"` и шапкой, `/uk/blog/does-not-exist` отдаёт 404 (а не 200), `/unknown.txt` и `/api/foo` показывают английскую корневую 404. Проверяй именно в браузере: 404, построенная во время запроса, приходит с сервера пустой оболочкой и без JS не видна. Подробнее в [09-error-pages.md](./09-error-pages.md).
- [ ] **Error boundaries используют `retry`.** `unstable_retry` удалён в Next.js 16.3 без алиаса, и старая кнопка «Try again» падала с TypeError. Типы — `Pick<ErrorInfo, 'error' | 'retry'>` из `next/error`. `error` имеет тип `unknown`, так что перед чтением `digest` сузь его через `instanceof Error`. Проверь на `/demo/errors`, пока демо не удалено.
- [ ] **`global-error.tsx` — свой документ без next-intl.** Он заменяет root layout и находится выше `NextIntlClientProvider`, поэтому тексты в нём захардкожены.
- [ ] **Трекер ошибок подключён во всех точках.** В шаблоне везде стоит `console.error`:
  - `onError` в [request.ts](../src/shared/i18n/request.ts) — ошибки next-intl на сервере;
  - `useEffect` в [error.tsx](../src/app/[locale]/error.tsx) и [global-error.tsx](../src/app/global-error.tsx) — ошибки, которые показал пользователю boundary. По `digest` серверная ошибка находится в логах;
  - ошибки next-intl в Client Components. `onError` из `request.ts` до клиента не доходит, потому что функции не сериализуются. Нужен клиентский провайдер с `onError`: паттерн `IntlErrorHandlingProvider` из [документации next-intl](https://next-intl.dev/docs/usage/configuration#nextintlclientprovider-non-serializable-props). Поставь его внутрь `<ClientMessages>` в layout, тогда вложенные `<ClientMessages>` страниц унаследуют его `onError`: `IntlProvider` в use-intl берёт `onError || prevContext?.onError`. В шаблоне такой провайдер не подключён;
  - остальные серверные ошибки (рендер, Route Handlers, Server Actions, proxy) — `onRequestError` в `src/instrumentation.ts` (документация Next.js, `instrumentation.md`).

## 7. Новая локаль

Порядок шагов описан в [AGENTS.md](../AGENTS.md#добавление-новой-локали). Перед релизом проверь, что не забыто:

- [ ] `routing.locales` и, если у страниц локализованные URL, `pathnames`;
- [ ] `messages/<code>.json`. `check:translations` сам возьмёт CLDR-категории plural для новой локали;
- [ ] `OG_LOCALE` в [og-locale.ts](../src/shared/seo/og-locale.ts) и `TEXT_DIRECTION` в [locales.ts](../src/shared/config/locales.ts): обе записи требует TypeScript, без них код не скомпилируется. Пока демо-блог не удалён, TypeScript потребует и переводы постов в [posts.ts](../src/entities/post/api/posts.ts) (тоже `Record<Locale, …>`). Для арабского, иврита и фарси направление — `'rtl'`. `<html dir>` берётся из `TEXT_DIRECTION`, а sonner читает направление из `<html dir>`. В вёрстке используй логические утилиты (`ms-*`, `pe-*`) и `rtl:`;
- [ ] шрифт покрывает письменность новой локали. Geist покрывает латиницу, кириллицу и вьетнамский, для них хватит subset в `Geist({ subsets })` в layout. Для других письменностей подключи второй `next/font` и передай шрифт этой письменности в `fonts` OG-картинки. Встроенный шрифт `next/og` (Geist Regular, только начертание 400) покрывает латиницу, кириллицу и вьетнамский, но не греческий, иврит, арабский, деванагари и CJK. Проверь картинку глазами;
- [ ] название языка в переключателе: `LOCALE_NATIVE_NAMES` вычисляется через `Intl.DisplayNames`, посмотри, как оно выглядит;
- [ ] e2e прогнаны. Править их не нужно: `LOCALES` в [tests/e2e/fixtures.ts](../tests/e2e/fixtures.ts) — это `routing.locales`, и общие проверки подхватят локаль сами.

## 8. Proxy: композиция с auth и CSP

- [ ] **Auth-проверка сравнивает внутренний путь, а не URL запроса.** Проверка `pathname.startsWith('/admin')` по `request.nextUrl` пропускает `/ru/admin`. Сначала вызови next-intl, потом возьми путь из его rewrite, как в разделе «Composing other middlewares» [документации next-intl](https://next-intl.dev/docs/routing/middleware#composing-other-middlewares):

  ```ts
  // example: inside proxy(), after `const response = handleI18nRouting(request)`
  // and `if (!response.ok) return response` (redirects are checked on the next request)
  const [, locale, ...rest] = new URL(
    response.headers.get('x-middleware-rewrite') ?? request.url,
    request.url
  ).pathname.split('/')
  const pathname = `/${rest.join('/')}` // '/admin' for /admin, /ru/admin, /uk/admin
  ```

  Проверено прогоном с `createMiddleware(routing)` шаблона. `/admin`, `/ru/admin` и `/uk/admin/users` дают `pathname` `/admin…`. Локализованный `/ru/o-nas` даёт канонический `/about`. Redirect на логин строй из `locale`: при `as-needed` у дефолтной локали префикса нет. Proxy подходит только для оптимистичной проверки по cookie. Документация Next.js (`authentication.md`): «it should not be your only line of defense», поэтому сессию проверяй ещё раз рядом с данными. Полный пример есть в [01-setup.md](./01-setup.md#композиция-auth-проверка-в-proxy).
- [ ] **Тип CSP выбран с учётом SSG.** В [next.config.ts](../next.config.ts) есть только базовые заголовки, CSP там нет. Статическая CSP через `headers()` сохраняет статический рендеринг. CSP с nonce, по документации Next.js (`content-security-policy.md`), требует динамического рендеринга **всех** страниц, несовместима с PPR и по умолчанию лишает страницы CDN-кеша, то есть для этого шаблона означает потерю SSG. Экспериментальная альтернатива — SRI. Если nonce всё же нужен, учти: next-intl собирает `NextResponse.next()`/`rewrite()` из `request.headers` входящего запроса (`middleware.js` в next-intl). Значит, заголовки запроса меняются до вызова intl-middleware, а CSP-заголовок ответа ставится на его ответ. Пример и результаты его проверки — в [01-setup.md](./01-setup.md#композиция-csp-с-nonce).

## 9. Опции производительности

- [ ] **Cache Components включаются только вместе со всеми правками из [02-app-router.md](./02-app-router.md#cache-components).** В шаблоне режим выключен. По документации Next.js в следующем мажорном релизе он станет дефолтом, а флаги удалят. Список проверен на копии шаблона, причины каждого пункта — в 02:
  1. `cacheComponents: true` и явный `partialPrefetching: true`;
  2. убрать `now: new Date()` из `request.ts`, иначе сборка падает на «unstable value `new Date()`»;
  3. убрать `dynamicParams = false` из `[locale]/layout.tsx` и `opengraph-image.tsx`, иначе сборка падает: с Cache Components этот экспорт не поддерживается. Побочный эффект: `/unknown.txt` теряет `global-not-found.tsx`, и 404 приходит без `<html lang>`;
  4. клиентские островки с `useNow` обернуть в `<Suspense>` (в шаблоне так уже сделано), иначе сборка падает на `new Date()` в Client Component;
  5. добавить `'use cache'` в загрузчик шрифта OG, иначе картинка перестаёт пререндериться и шрифт запрашивается на каждый запрос;
  6. **soft 404:** неизвестный slug вне `generateStaticParams` отдаёт 200 + `noindex`, потому что стрим уже начался (404 приходит только на повторный запрос того же URL). Проверяй slug в proxy, до рендера;
  7. проверить ошибки префетча после смены языка на дефолтную локаль: в эксперименте с Cache Components они валили e2e.
- [ ] **Прекомпиляцию сообщений рассмотри как оптимизацию.** `experimental.messages.precompile` экономит около 9 КБ gzip клиентского JS. Опция экспериментальная и несовместима с `t.raw`, официальный example её не включает. Конфиг — в [03-translations.md](./03-translations.md).
- [ ] **Известно, что `now` на SSG — время сборки.** Серверный `relativeTime` без явной опорной даты устаревает до следующей сборки. Живое время показывает клиентский `useNow({ updateInterval })`. Подробнее в [05-formatting.md](./05-formatting.md).

## 10. Зависимости

Стек и точные версии — в [package.json](../package.json), компромиссы — в [README](../README.md#стек).

- [ ] **Node.js ≥ 24** (`engines`), в CI тоже Node 24.
- [ ] **`allowScripts` пересмотрен после добавления зависимостей.** Шаблон запрещает install-скрипты `@parcel/watcher`, `@swc/core`, `esbuild`, `fsevents` и `unrs-resolver`: без них сборка, lint, typecheck и тесты проходят. Новые пакеты со скриптами показывает `npm install-scripts ls`.
- [ ] **Учтён выбор ESLint 9 или 10.** Шаблон остаётся на ESLint 9, хотя у него EOL с 2026-08-06. На ESLint 10 плагины `react`, `import` и `jsx-a11y` из `eslint-config-next` дают `ERESOLVE`, а часть правил падает. Предупреждение `npm warn deprecated eslint@9…` при установке ожидаемо. Переходи на 10, когда эти плагины выпустят релизы с peer-зависимостью от ESLint 10.
- [ ] **TypeScript остаётся на линии 6.0:** typescript-eslint пока не поддерживает TS 7, даже у версии 8.72 peer-зависимость — `typescript >=4.8.4 <6.1.0`.

## Финальный прогон

```bash
npm run check:translations && npm run lint && npm run typecheck
SITE_URL=https://your-domain.example npm run build   # pages under [locale] must stay ● ([...rest] is ƒ)
SITE_URL=https://your-domain.example npm test        # unit + e2e against this build
```

Если e2e переносишь в свой проект, бери спеки из `tests/e2e` как образец: они завязаны на демо-страницы шаблона.

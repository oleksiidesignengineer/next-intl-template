# next-intl template

Эталон локализации для Next.js (App Router) на [next-intl](https://next-intl.dev/). Отсюда можно брать паттерны в любой Next.js-проект. Каждое решение обосновано в [docs/](docs/00-overview.md), а поведение закреплено e2e-тестами против production-сборки.

## Что внутри

- **Три локали**: `en` (по умолчанию, без префикса), `ru`, `uk`. Режим `localePrefix: 'as-needed'`. На путях без префикса (`/`, `/about`) язык определяется по cookie `NEXT_LOCALE`, затем по `Accept-Language`.
- **Локаль на сервере через `next/root-params`**: `[locale]/layout.tsx` служит root layout, а [`request.ts`](src/shared/i18n/request.ts) читает локаль сам. `setRequestLocale` не используется, при этом все страницы × локали пререндерятся статически.
- **Локализованные URL только там, где они различаются**: `/about` ↔ `/ru/o-nas` ↔ `/uk/pro-nas`. Обёртка [`Link`](src/shared/ui/Link.tsx) принимает `href: string`, поэтому перечислять в `pathnames` все маршруты не нужно. Маппинг сохраняется и для ссылок с query и hash (`/about?ref=x` → `/ru/o-nas?ref=x`).
- **Строгая типизация**: ключи сообщений, ICU-аргументы (`{count, plural, …}` требует number), имена глобальных форматов, тип `Locale`.
- **Минимум сообщений на клиенте**: layout отдаёт в браузер только namespace `error`. Клиентские островки получают свои namespace через [`<ClientMessages>`](src/shared/i18n/ClientMessages.tsx), а пару строк проще передать пропом.
- **ICU**: plural с полным набором CLDR-категорий для `ru`/`uk`, select, selectordinal, rich text, number-скелетоны. Демо — `/demo/plurals`.
- **Форматирование**: глобальные `formats`, диапазоны дат, relative time, «живое» время на клиенте без рассинхрона при гидратации. Демо — `/demo/formats`.
- **Фолбэк переводов**: если ключа нет в `ru`/`uk`, подставляется английский текст. Fallback работает по отдельным ключам, а не по namespace целиком. Здесь же настроены `onError` и `getMessageFallback`.
- **SEO**: canonical, hreflang и `x-default` строятся из одного источника. Есть `sitemap.xml` с alternates, OpenGraph/Twitter на каждой странице и OG-картинка для каждой локали (с кириллицей). `robots.txt` и JSON-LD тоже на месте, а demo-страницы помечены `noindex`.
- **Ошибки**: локализованная 404 (включая `/ru/любой-несуществующий-путь`), корневые 404 для запросов без локали (`global-not-found.tsx` и `not-found.tsx`), `error.tsx` с `retry` и `global-error.tsx`. Демо — `/demo/errors`.
- **Server Action**: форма `/contact` валидируется через zod с переведёнными ошибками, отправляется и без JavaScript и при ошибке не теряет введённое.
- **Переключатель языка** сохраняет query и dynamic params и рендерится на сервере (без `useSearchParams` и `Suspense`). `#hash` при смене языка не сохраняется.
- **Готовность к RTL**: направление каждой локали задано в `TEXT_DIRECTION` ([locales.ts](src/shared/config/locales.ts)), по нему выставляется `<html dir>`. Новая локаль без записи там — ошибка типов.
- **Проверки**: `check:translations` сверяет ключи, синтаксис ICU, аргументы, теги и plural-категории. E2e на Playwright гоняются против production-сборки в Chromium, Firefox и WebKit. CI на GitHub Actions.
- **Структура FSD** с границами импортов через ESLint.

## Структура URL

| Страница | `en` (default) | `ru` | `uk` |
|---|---|---|---|
| Главная | `/` | `/ru` | `/uk` |
| О шаблоне (локализованный путь) | `/about` | `/ru/o-nas` | `/uk/pro-nas` |
| Блог | `/blog` | `/ru/blog` | `/uk/blog` |
| Пост (dynamic route) | `/blog/hello-world` | `/ru/blog/hello-world` | `/uk/blog/hello-world` |
| Контакты (Server Action) | `/contact` | `/ru/contact` | `/uk/contact` |
| Демо ICU | `/demo/plurals` | `/ru/demo/plurals` | `/uk/demo/plurals` |
| Демо форматирования | `/demo/formats` | `/ru/demo/formats` | `/uk/demo/formats` |
| Демо error boundary | `/demo/errors` | `/ru/demo/errors` | `/uk/demo/errors` |

Что ещё стоит знать о путях:

- `/en/...` отвечает 307 на путь без префикса (`as-needed`), а канонический путь в чужой локали (`/ru/about`) — 307 на локализованный (`/ru/o-nas`).
- Неизвестный путь внутри локали (`/ru/foo`, `/uk/blog/nope`) получает локализованную 404 с шапкой. Корневая английская 404 достаётся только запросам, которые proxy пропускает (`/unknown.txt`, `/api/foo`).
- 404, которую Next.js 16.4 строит во время запроса (`/ru/foo`, `/xx/about`), приходит с сервера пустой оболочкой `<html id="__next_error__">` со статусом 404 и `noindex`, а страницу браузер рисует из RSC payload. Полный HTML с сервера получает только `global-not-found` (`/unknown.txt`). Подробности в [docs/09-error-pages.md](docs/09-error-pages.md#как-выглядит-ответ-404).
- Служебные маршруты: `/sitemap.xml`, `/robots.txt` и `/<locale>/opengraph-image`. OG-картинка всегда идёт с префиксом, в том числе для `en`.

## Требования

- **Node.js ≥ 24** (`engines` в [package.json](package.json)), npm.
- Vercel на открытый диапазон `>=24` выводит при деплое предупреждение: проект автоматически перейдёт на следующую мажорную версию Node. Сборку оно не останавливает. Если оно мешает, сузь диапазон под свою политику обновлений.

## Запуск

```bash
npm install
npm run dev
```

Открой [http://localhost:3000](http://localhost:3000).

На свежем клоне часть типов ещё не сгенерирована: `en.d.json.ts` со строгими типами сообщений, глобальные `LayoutProps`/`PageProps` и типы `next/root-params`. Они появляются после первого `npm run dev`, `npm run build` или `npm run typecheck`. До этого IDE может подсвечивать, например, `Cannot find name 'LayoutProps'`.

Production локально:

```bash
npm run build
npm run start
```

## Скрипты

| Скрипт | Что делает |
|---|---|
| `npm run dev` | Dev-сервер на `:3000` |
| `npm run build` | Production-сборка. Статические страницы получают `SITE_URL` в момент сборки |
| `npm run start` | Запуск собранного приложения |
| `npm run lint` | ESLint: правила `eslint-config-next`, FSD-границы импортов и запрет `next/link` и `useRouter`/`usePathname`/`redirect`/`permanentRedirect` из `next/navigation` |
| `npm run typecheck` | `next typegen && tsc --noEmit --incremental false`. Сначала генерируются route types, `next/root-params` и `en.d.json.ts`, затем проверяются типы |
| `npm run check:translations` | Сверка `ru`/`uk` с `en.json`: ключи, типы значений, синтаксис ICU, аргументы (и вид значения: текст, число, дата), склонение по числу, ключи `select`, теги, пустые строки, plural-категории CLDR каждой локали |
| `npm run test:unit` | Unit-тесты на `node:test` без сборки: matcher proxy, разбор `href` для `Link` |
| `npm run test:e2e` | Playwright против **production-сборки** (сначала `npm run build`) |
| `npm test` | `test:unit`, затем `test:e2e` |

Про e2e:

- Playwright сам запускает `next start -p 3100`, порт меняется переменной `PORT`. Уже запущенный сервер он берёт, только если задан `PW_REUSE_SERVER=1`.
- Перед первым запуском поставь браузеры: `npx playwright install`.
- Тесты ждут тот же `SITE_URL`, с которым собрана сборка. По умолчанию обе стороны берут `http://localhost:3000`. `playwright.config.ts` читает `.env*` так же, как `next build`, поэтому значение из `.env.local` подхватят обе стороны. Если собирал с другим значением из окружения, запускай тесты с ним же.
- Любая ошибка в консоли браузера или необработанное исключение на странице валит тест. Так же валит его 404 любого запроса, кроме самого документа на страницах 404. Так ловятся гидратационные расхождения и сообщения, которые забыли передать на клиент.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) прогоняет по очереди `check:translations`, `lint`, `typecheck`, `build` и `npm test` с `SITE_URL=https://example.com`. Подробности в [docs/14-testing.md](docs/14-testing.md).

## Переменная `SITE_URL`

Канонический origin сайта. От него строятся `metadataBase`, canonical, hreflang, `sitemap.xml` и `robots.txt` ([src/shared/config/site.ts](src/shared/config/site.ts)). Значение выбирается по порядку:

1. `SITE_URL` из окружения;
2. `https://$VERCEL_PROJECT_PRODUCTION_URL` (системная переменная Vercel с production-доменом проекта, задаётся и в preview);
3. `http://localhost:3000`.

Файла `.env.example` нет, потому что `.env*` целиком в `.gitignore`. Для локальной проверки с боевым доменом создай `.env.local`:

```bash
SITE_URL=https://example.com
```

Учти три вещи:

- Переменная **серверная** (без `NEXT_PUBLIC_`), и это сделано намеренно: её читают только серверный код и метаданные.
- Статические страницы получают значение **при сборке**. После смены `SITE_URL` нужно пересобрать проект.
- Задай `SITE_URL` в каждом окружении, где адрес отличается от production-домена Vercel (preview, staging, self-hosted). Иначе canonical и hreflang там будут указывать на production-домен (на Vercel) или на `http://localhost:3000` (вне Vercel).

## Деплой

- Proxy (`src/proxy.ts`) должен выполняться **до** CDN-кеша, как это устроено на Vercel. Ответ на путь без префикса (`/`, `/about`) зависит от cookie `NEXT_LOCALE` и `Accept-Language`, но этих заголовков нет в `Vary`. Вдобавок такой ответ может нести `Set-Cookie` вместе с `Cache-Control: s-maxage=31536000` (например, `/about` на запрос без `Accept-Language`). Если CDN стоит перед Next.js, читай [docs/13-locale-persistence.md](docs/13-locale-persistence.md).
- Полный чек-лист внедрения в продакшн-проект: [docs/15-production-checklist.md](docs/15-production-checklist.md).

## Стек

Точные версии смотри в [package.json](package.json). Основа: Next.js (App Router, `proxy.ts`), next-intl 4, React 19, TypeScript, Tailwind CSS v4, zod, sonner (тосты), Playwright.

Осознанные компромиссы:

- **TypeScript на линии 6.0** (`~6.0.3`) — это мост к TS 7. TS 7 typescript-eslint пока не поддерживает: даже у typescript-eslint 8.72 peer-зависимость — `typescript >=4.8.4 <6.1.0`.
- **ESLint 9, хотя он EOL с 2026-08-06.** Peer-зависимость `eslint-config-next` (`eslint >=9.0.0`) допускает ESLint 10, но у плагинов react, import и jsx-a11y peer-диапазон заканчивается на ESLint 9. С ESLint 10 npm ставит их с предупреждением `ERESOLVE overriding peer dependency`, а часть их правил (`import/order`, `react/jsx-curly-spacing` и другие стилевые `react/jsx-*`) падает с `TypeError`. В конфиге шаблона этих правил нет. При `npm install` ожидаемо появляется предупреждение `npm warn deprecated eslint@9…`. Переходить на 10 стоит, когда эти плагины выпустят релизы с peer-зависимостью от ESLint 10.
- **`allowScripts` в package.json** запрещает install-скрипты пакетов `@parcel/watcher`, `@swc/core`, `esbuild`, `fsevents` и `unrs-resolver`. npm начиная с 11.16 предупреждает о неодобренных скриптах. Шаблону эти скрипты не нужны: без них сборка, lint, typecheck и тесты проходят. Пересмотреть список можно командой `npm install-scripts ls`.
- **Tailwind подключён через `@tailwindcss/postcss`**, как в документации Next.js, хотя create-next-app 16.4 перешёл на `@tailwindcss/turbopack`.

## Документация

| Документ | О чём |
|---|---|
| [00 — Обзор](docs/00-overview.md) | Архитектура, поток запроса, ключевые решения, карта файлов |
| [01 — Установка и конфигурация](docs/01-setup.md) | `routing.ts`, `request.ts`, плагин, proxy и его композиция, `global.d.ts` |
| [02 — App Router](docs/02-app-router.md) | `[locale]` как root layout, `next/root-params`, `generateStaticParams`, Cache Components |
| [03 — Переводы](docs/03-translations.md) | Server vs Client, `ClientMessages`, типизация |
| [04 — ICU-сообщения](docs/04-icu-messages.md) | plural, select, selectordinal, rich text, скелетоны |
| [05 — Форматирование](docs/05-formatting.md) | Глобальные форматы, `now`, `timeZone` |
| [06 — Навигация](docs/06-navigation.md) | `Link`, навигационные API, `LangSwitcher` |
| [07 — Metadata и SEO](docs/07-metadata-seo.md) | metadata, hreflang, sitemap, OG-картинки |
| [08 — Локализованные pathnames](docs/08-pathnames.md) | Локализованные URL, `localePrefix` и другие опции routing |
| [09 — Страницы ошибок](docs/09-error-pages.md) | `error.tsx`, `global-error.tsx`, три уровня `not-found` |
| [10 — FAQ](docs/10-faq.md) | Частые вопросы и грабли |
| [11 — Динамические роуты](docs/11-dynamic-routes.md) | `/blog/[slug]`, `generateStaticParams`, локализованные slug |
| [12 — Server Actions](docs/12-server-actions.md) | Server Action + zod, явная локаль |
| [13 — Сохранение локали](docs/13-locale-persistence.md) | Cookie `NEXT_LOCALE`, предпочтение пользователя, CDN-кеширование |
| [14 — Тестирование](docs/14-testing.md) | `check:translations`, e2e на Playwright, CI |
| [15 — Чек-лист для продакшна](docs/15-production-checklist.md) | Что проверить при внедрении в свой проект |
| [FSD Guide](docs/FSD_GUIDE.md) | Feature-Sliced Design в Next.js (общий гайд) |
| [Portability](docs/PORTABILITY.md) | Как перенести шаблон в существующий проект |

Правила для AI-агентов лежат в [AGENTS.md](AGENTS.md) (`CLAUDE.md` подключает его через `@AGENTS.md`). Блок между маркерами `nextjs-agent-rules` поддерживает сам `next dev`: когда его запускает AI-агент, он перезаписывает устаревший текст блока. Руками блок не правь. Если он не нужен, задай `agentRules: false` в `next.config.ts`: тогда `next dev` удалит блок из `AGENTS.md`.

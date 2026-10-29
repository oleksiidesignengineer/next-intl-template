# Локализованные URL и опции routing

Разбираем `pathnames` (разные URL одной страницы по локалям), то, как шаблон их урезал, и остальные опции `defineRouting`: `localePrefix`, `localeDetection`, `domains`, `localeCookie`, `alternateLinks`, а также `basePath` из `next.config`. Сам конфиг лежит в [src/shared/i18n/routing.ts](../src/shared/i18n/routing.ts), установка описана в [01-setup.md](./01-setup.md).

## Как работает `pathnames`

Ключ — внутренний путь, то есть путь в файловой системе (`src/app/[locale]/about/page.tsx` → `/about`). Его же пишешь в `href`. Значение задаёт внешний URL: строку, общую для всех локалей, или объект с URL для каждой локали.

```ts
  pathnames: {
    '/about': { en: '/about', ru: '/o-nas', uk: '/pro-nas' },
  },
```

Как маппинг работает в обе стороны (проверено на production-сборке):

- **Входящий запрос.** Proxy переписывает `/ru/o-nas` → `/ru/about` внутри сервера, адрес у пользователя не меняется. Канонический путь в чужой локали получает редирект: `/ru/about` → 307 → `/ru/o-nas`, query сохраняется.
- **Исходящие ссылки.** `Link`, `useRouter`, `redirect` и `getPathname` строят `/ru/o-nas` из `/about`. `Link` и `useRouter` берут текущую локаль сами, `redirect` и `getPathname` получают её аргументом `locale`.

### Когда локализовать URL

- **Стоит:** публичные контентные и маркетинговые страницы. Google в [URL structure best practices](https://developers.google.com/search/docs/crawling-indexing/url-structure) советует «Use words in your audience's language in the URL (and, if applicable, transliterated words)».
- **Не стоит:** кабинеты, админки и SaaS за логином. SEO там не важно, а URL обычно состоят из ID.
- **Цена:** каждый локализованный URL становится публичным контрактом. Переименовал `/o-nas` — старый адрес отдаёт 404, если не добавить редирект, например в `redirects` в `next.config` (они выполняются до proxy).

## Шаблон: в `pathnames` только маршруты с разными URL

В карте только `/about`. Остальные страницы (`/`, `/blog`, `/blog/[slug]`, `/contact`, `/demo/*`) в ней не перечислены. Документация next-intl прямо разрешает так делать в runtime: «Unknown routes will be passed through as-is, but will receive relevant locale prefixes in case of absolute pathnames». Это подтверждено и SSR: `/ru/o-nas` содержит `<a href="/ru/blog">`, `<a href="/ru/demo/plurals">`.

**Это осознанное отступление от дефолта.** В примере конфигурации next-intl и в официальных example-приложениях при включённом `pathnames` перечислены все маршруты, включая одинаковые (`'/': '/'`, `'/blog': '/blog'`). Причина в типах: «the navigation APIs are strictly typed and only allow routes specified in the `pathnames` config». Для неизвестных маршрутов документация предлагает отключать проверку типов «on a case-by-case basis». Шаблон отключает её централизованно, в двух местах:

- [`@/shared/ui/Link`](../src/shared/ui/Link.tsx) — обёртка с `href: string`;
- [`localizePath`](../src/shared/i18n/navigation.ts) — `getPathname` для произвольного пути.

Подробности — в [06-navigation.md](./06-navigation.md).

## Trade-off: что теряешь с обёрткой

**Что получаешь.** В конфиге только реальные маппинги, и новая страница не требует правки `routing.ts`.

**Чем платишь:**

1. **Опечатки в `href`.** `<Link href="/abuot">` скомпилируется. Ошибку увидишь только в runtime, в виде локализованной 404.
2. **Типизированные `params`.** Проверка `{ pathname: '/news/[slug]', params: { slug } }` есть только для маршрутов из `pathnames`. Обёртка принимает лишь строку, поэтому динамические маршруты вне карты собираются строкой: `` `/blog/${post.slug}` ``.
3. **`useRouter`, `redirect`, `getPathname` остаются строгими.** Обёртки есть только у `Link` и `getPathname` (`localizePath`). `router.push('/blog')` и `redirect({ href: '/blog', locale })` не компилируются (проверено `tsc`). Для `router.push` это TS2345 `Argument of type '"/blog"' is not assignable to parameter of type '"/about" | …'`, для `redirect` — TS2322 на поле `href`. Выходов три:
   - каст на месте вызова: `'/blog' as never`;
   - добавить маршрут в `pathnames` (`'/blog': '/blog'`);
   - написать свои обёртки по образцу `localizePath`.
4. **Query и hash в строке.** Типизированный `Link` такую строку просто не пропустит. А вот после каста next-intl ищет в `pathnames` всю строку, и `'/about?x=1'` превращается в `/ru/about?x=1` с лишним 307. В `@/shared/ui/Link` и `localizePath` это лечит разбор строки ([src/shared/lib/href.ts](../src/shared/lib/href.ts), подробности в [06-navigation.md](./06-navigation.md)). `useRouter` и `redirect` строку не разбирают. Им передавай чистый путь, а query объектом: `{ pathname: '/about', query: { x: '1' } }`. Поля `hash` в их объектной форме нет (TS2353), а после каста `getPathname` его молча отбрасывает.

**Как вернуть строгость.** Перечисли все маршруты в `pathnames`, как в документации, и импортируй `Link` прямо из `@/shared/i18n/navigation`. Обёртка тогда не нужна. Так стоит сделать, если в проекте много программной навигации (`router.push`, `redirect`) или много динамических маршрутов с локализованными сегментами: там типизированные `params` окупают бойлерплейт.

## Динамические и catch-all сегменты

В шаблоне не используется. Пример из документации next-intl:

```ts
// Example
pathnames: {
  '/news/[articleSlug]': { de: '/neuigkeiten/[articleSlug]' },
  '/categories/[...slug]': { de: '/kategorien/[...slug]' },
}
```

```tsx
// Example: typed Link from @/shared/i18n/navigation (the wrapper takes strings only)
<Link href={{ pathname: '/news/[articleSlug]', params: { articleSlug: 'launch' } }}>…</Link>
```

- Статический маршрут, который пересекается с динамическим (`/news/just-in`), имеет приоритет.
- Не-ASCII сегменты (`/über-uns`) next-intl кодирует сам.
- `usePathname` на таком маршруте вернёт шаблон `/news/[articleSlug]`, поэтому LangSwitcher передаёт `params`.
- Локализованные slug из CMS (`/de/neuigkeiten/produktneuheit`) — отдельная задача: [11-dynamic-routes.md](./11-dynamic-routes.md).

## `localePrefix`: `as-needed`, `always`, `never`

| | `as-needed` (шаблон) | `always` (дефолт next-intl) | `never` |
|---|---|---|---|
| URL дефолтной локали | `/about` | `/en/about` | `/about` |
| URL остальных локалей | `/ru/o-nas` | `/ru/o-nas` | `/o-nas` |
| От чего зависит ответ на URL без префикса | cookie, `Accept-Language` | всегда 307 на префикс | cookie, `Accept-Language` |
| Уникальный URL на каждую локаль (hreflang) | да | да | нет |
| CDN-кеш по одному URL | только префиксные URL | да (кроме редиректов) | нет |

### `as-needed` — что важно знать

Ниже реальное поведение шаблона (curl и Playwright, production-сборка):

- **URL без префикса нестабилен для конкретного пользователя.** `/about` с `Accept-Language: ru` даёт 307 → `/ru/o-nas`. `/` с `Cookie: NEXT_LOCALE=uk` даёт 307 → `/uk`. Если поделиться английской ссылкой, у человека с русским браузером она откроется по-русски.
- **Лишний префикс дефолтной локали убирается редиректом.** `/en/about` → 307 → `/about`. На document-запросе proxy заодно переписывает cookie на `en`, если она указывала на другую локаль.
- **Явно выбрать дефолтную локаль можно только через `/en/...`.** Это делают `<Link locale>` и `router.replace(..., { locale })`, которые вдобавок пишут cookie на клиенте. Иначе detection по cookie или `Accept-Language` вернёт пользователя обратно. Серверный `redirect({ ..., forcePrefix: true })` cookie не пишет и помогает, только если браузер идёт по редиректу document-запросом. Из Server Action при включённом JS это не так: в браузере адрес становится `/en`, а страница остаётся на старом языке (проверено). Там cookie ставь сам ([13-locale-persistence.md](./13-locale-persistence.md#после-логина-язык-из-профиля)).
- **Matcher proxy должен ловить пути без префикса.** В [src/proxy.ts](../src/proxy.ts) так и сделано.
- **Ответ на URL без префикса зависит от заголовков запроса.** Отсюда требования к CDN: [13-locale-persistence.md](./13-locale-persistence.md#cdn-и-кеширование).

### `always`

У каждого URL есть префикс. `/` и любой путь без префикса отвечают 307 по результату detection, а страницы целиком определяются URL. Кешировать это проще всего, канонические URL однозначны. Платишь лишним редиректом с `/` и префиксом `/en` у основного рынка.

### `never`

Префикса в URL нет, локаль берётся из cookie и `Accept-Language`, а proxy переписывает запрос на `/[locale]/...` внутри сервера, так что статический рендеринг сохраняется. Документация next-intl называет два случая: на каждом домене одна локаль или локаль задаёт cookie при статическом рендеринге. Если локаль берётся из настроек пользователя (приложение за логином), она советует сначала подумать, нужна ли маршрутизация по локали вообще. Минусы:

- URL не уникальны по локалям, поэтому next-intl отключает `alternateLinks`, а поисковик на одном URL видит один язык;
- кеш должен различать cookie;
- выбор хранится только в cookie, поэтому документация советует подумать о долгом `maxAge` (см. [13-locale-persistence.md](./13-locale-persistence.md#почему-cookie-сессионная)).

### Как переключиться

Поменяй `localePrefix` в `routing.ts`. При переходе на `always` навигационные API и `localizePath` подстроятся сами, а с ними hreflang и sitemap. Проверь две вещи: захардкоженные абсолютные URL и e2e-тесты на префиксы ([tests/e2e/routing.spec.ts](../tests/e2e/routing.spec.ts)).

С `never` так не выйдет. `localizePath` тогда возвращает один URL для всех локалей: `localizePath('ru', '/blog')` даёт `/blog`, отличаются только маршруты из `pathnames`. В результате [src/shared/seo/alternates.ts](../src/shared/seo/alternates.ts) выдаст hreflang, где все языки указывают на один адрес, а [src/app/sitemap.ts](../src/app/sitemap.ts) — повторяющиеся `<url>`. hreflang и sitemap придётся перестроить, например от доменов.

## `localeDetection`

`localeDetection: false` выключает выбор локали по cookie и `Accept-Language`: локаль задаёт только префикс (и домен, если он используется). При `as-needed` URL без префикса всегда отдаёт дефолтную локаль. Учти, что proxy продолжает писать cookie, пока она не выключена: `syncCookie` смотрит на `localeCookie`, а `localeDetection` не проверяет. Если cookie больше не нужна, ставь вместе с `localeCookie: false`.

## Прочие опции, кратко

- **`localePrefix: { mode, prefixes }`** задаёт пользовательские префиксы, например `'en-US': '/us'`, `'de-AT': '/eu/at'`. В `[locale]` всё равно приходит локаль, а не префикс. Matcher proxy должен ловить и эти префиксы.
- **`domains`** — локали по доменам (`us.example.com` → `en-US`). Хост берётся из `x-forwarded-host` с fallback на `host`. Локали не должны повторяться между доменами. На неизвестном хосте, например `localhost`, работает обычная логика префиксов. Каждый домен может переопределить `localePrefix`. Для шаблона учти: [src/shared/seo/alternates.ts](../src/shared/seo/alternates.ts) строит hreflang от одного `SITE_URL`, и при `domains` ему понадобится origin каждого домена.
- **`localeCookie`** — атрибуты cookie или `false`. С `false` есть ловушка: при `as-needed` и включённом `localeDetection` пользователь, чей `Accept-Language` не совпадает с дефолтной локалью, не может остаться на ней. `/about` → `Accept-Language: ru` → 307 `/ru/o-nas` на каждом заходе: без cookie запомнить выбор негде (видно по исходнику `resolveLocale` и `middleware` в next-intl и по прогону proxy: `/en/about` → 307 `/about` без `Set-Cookie`, затем снова 307 `/ru/o-nas`). Поэтому `localeCookie: false` ставь вместе с `localeDetection: false`. Остальное про cookie — в [13-locale-persistence.md](./13-locale-persistence.md).
- **`alternateLinks`** — HTTP-заголовок `Link` с hreflang от proxy. В шаблоне он `false`: заголовок строится от хоста запроса, а за reverse proxy или на preview-деплое этот хост отличается от канонического. hreflang выдают metadata и sitemap от `SITE_URL` ([07-metadata-seo.md](./07-metadata-seo.md)).
- **`basePath` и `trailingSlash`** из `next.config` подхватывают и proxy, и навигационные API. Исключение — `getPathname`, а значит и `localizePath`: он возвращает путь без `basePath`. При `basePath` в matcher нужна отдельная запись `'/'`.

## Грабли

- **Static export (`output: 'export'`).** Proxy не выполняется, а `pathnames` требует серверных rewrite. Документация next-intl: «You can't use `pathnames`, as these require server-side rewrites». Там же условия для static export: обязателен префикс и не работает detection.
- **`revalidatePath` для локализованного маршрута.** Страница из `generateStaticParams` ревалидируется по внутреннему пути (`/de/news/some-article`), страница, сгенерированная в runtime, — по внешнему (`/de/neuigkeiten/some-article`). Если не уверен, используй `revalidateTag`.

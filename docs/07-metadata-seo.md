# Metadata и SEO

Что шаблон отдаёт поисковикам и соцсетям на каждой странице каждой локали:

- `<title>` по шаблону `%s | <имя сайта>` и `description` на языке страницы;
- self-canonical и hreflang на все локали плюс `x-default`. Все URL абсолютные и строятся от одного origin;
- OpenGraph и Twitter со своими title/description, `og:locale` и картинкой своей локали;
- `sitemap.xml`, где у каждой пары «страница × локаль» свой `<url>`;
- `robots.txt`, `noindex` на демо-страницах, JSON-LD на `/about`.

| Файл | Что делает |
|---|---|
| [src/shared/config/site.ts](../src/shared/config/site.ts) | `SITE_URL`, `absoluteUrl()` |
| [src/shared/seo/metadata.ts](../src/shared/seo/metadata.ts) | `buildPageMetadata()`: вся metadata страницы одним вызовом |
| [src/shared/seo/alternates.ts](../src/shared/seo/alternates.ts) | `buildLanguageUrls()`, `buildAlternates()`: canonical и hreflang |
| [src/shared/seo/og-image.ts](../src/shared/seo/og-image.ts) | путь и размер OG-картинки |
| [src/shared/seo/og-locale.ts](../src/shared/seo/og-locale.ts) | `OG_LOCALE`: `ru` → `ru_RU` |
| [src/app/[locale]/opengraph-image.tsx](../src/app/[locale]/opengraph-image.tsx) | OG-картинка для каждой локали |
| [src/app/sitemap.ts](../src/app/sitemap.ts), [src/app/robots.ts](../src/app/robots.ts) | sitemap и robots |
| [src/app/[locale]/layout.tsx](../src/app/[locale]/layout.tsx) | `metadataBase`, шаблон title |

Примеры вывода ниже сняты с production-сборки с `SITE_URL=https://example.com`.

## Один origin: `SITE_URL`

Все абсолютные URL строятся от одной константы в [site.ts](../src/shared/config/site.ts):

```ts
function resolveSiteUrl(): URL {
  if (process.env.SITE_URL) return new URL(process.env.SITE_URL)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  }
  return new URL('http://localhost:3000')
}
```

Хост запроса для этого не годится. За reverse proxy, на preview и staging он не совпадает с каноническим, а canonical, hreflang, sitemap и robots должны называть один и тот же адрес. Google к тому же требует для hreflang полные URL со схемой: «Alternate URLs must be fully-qualified».

Что учесть:

- Статические страницы, sitemap и robots получают значение при сборке. После смены `SITE_URL` проект нужно пересобрать.
- Задай `SITE_URL` во всех окружениях, где адрес отличается от production-домена Vercel: preview, staging, self-hosted. Если его нет, на Vercel URL укажут на production-домен, а вне Vercel — на `http://localhost:3000`.
- e2e сравнивают URL с тем `SITE_URL`, с которым собрана сборка (см. [README](../README.md)).

`metadataBase: SITE_URL` в layout нужен для **относительных** URL в metadata. В шаблоне такой URL один: путь OG-картинки. Next.js достраивает его до абсолютного от `metadataBase`. Документация [`generateMetadata`](https://nextjs.org/docs/app/api-reference/functions/generate-metadata#metadatabase) обещает на относительный URL без `metadataBase` ошибку сборки, но Next.js 16.4.3 сборку не останавливает. Путь картинки он достраивает от запасного origin. Вне Vercel это `http://localhost:3000`, и в выводе сборки есть только предупреждение «metadataBase property in metadata export is not set…». На Vercel берётся адрес preview-деплоя или production-домен, без предупреждения. Без `metadataBase` og:image на `/ru/o-nas` становится `http://localhost:3000/ru/opengraph-image`, так что пропажу легко не заметить. canonical и hreflang от `metadataBase` не зависят: `absoluteUrl()` сразу строит их абсолютными.

## Title: шаблон в layout, заголовок на странице

Layout задаёт `metadataBase`, шаблон заголовка и описание по умолчанию. `openGraph` и `twitter` в нём нет, почему — [ниже](#почему-хелпер-а-не-metadata-в-layout).

```ts
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site')
  return {
    // Resolves relative URLs in metadata (e.g. og:image, see
    // src/shared/seo/og-image.ts) against the canonical origin, not the request host.
    metadataBase: SITE_URL,
    title: { default: t('name'), template: `%s | ${t('name')}` },
    description: t('description'),
  }
}
```

Страница отдаёт только свой `title`, а Next.js подставляет его в шаблон. На `/ru/contact` получается «Связаться с нами | Шаблон next-intl», это проверяет e2e. Главная передаёт `absoluteTitle: true`, и её заголовок — просто имя сайта.

**Явная локаль в `generateMetadata` не нужна.** Это серверный код под root layout `[locale]`. `request.ts` читает локаль через `next/root-params`, поэтому `getTranslations('about')` и `getLocale()` работают без аргументов. Форма `getTranslations({ locale, namespace })` в metadata осталась от схемы с `setRequestLocale`, её миграция описана в [02-app-router.md](./02-app-router.md#миграция-со-схемы-setrequestlocale). Явная локаль по-прежнему нужна там, где root params недоступны: в OG-картинке (см. ниже), Server Actions и Route Handlers ([02-app-router.md](./02-app-router.md#где-root-params-нет-локаль-передаётся-явно)).

## `buildPageMetadata`: metadata страницы одним вызовом

Каждая страница собирает metadata одним хелпером, например [about/page.tsx](../src/app/[locale]/about/page.tsx):

```ts
export async function generateMetadata() {
  const t = await getTranslations('about')
  return buildPageMetadata({
    href: '/about',
    title: t('seo.title'),
    description: t('seo.description'),
  })
}
```

### Почему хелпер, а не metadata в layout

Next.js сливает metadata сегментов **поверхностно**: ключ верхнего уровня, заданный страницей, целиком заменяет такой же ключ из layout ([документация](https://nextjs.org/docs/app/api-reference/functions/generate-metadata#merging)). С `openGraph` отсюда две ловушки:

1. Страница не задала `openGraph` и унаследовала объект layout. Если og:title лежит в layout, он у всех страниц один, то есть заголовок главной. Так было в шаблоне раньше: `/about` с `<title>About | …</title>` отдавал `og:title` главной страницы.
2. Страница задала свой `openGraph`, пусть даже только ради og:title. Тогда объект layout пропадает весь: `og:locale`, `og:locale:alternate`, `siteName` и картинка из file convention.

Поэтому `openGraph` и `twitter` в layout не задаются, а [`buildPageMetadata`](../src/shared/seo/metadata.ts) каждый раз собирает полный набор:

```ts
  // Resolved from next/root-params via src/shared/i18n/request.ts.
  const locale = await getLocale()
  const t = await getTranslations('site')
  const alternates = buildAlternates(locale, href)
  const image = { url: ogImagePath(locale), ...OG_IMAGE_SIZE, alt: t('name') }

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates,
    openGraph: {
      type: 'website',
      siteName: t('name'),
      url: alternates.canonical,
      title,
      description,
      locale: OG_LOCALE[locale],
      alternateLocale: routing.locales
        .filter((other) => other !== locale)
        .map((other) => OG_LOCALE[other]),
      images: [image],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
    ...(noindex && { robots: { index: false, follow: true } }),
  }
```

| Параметр | Что передавать |
|---|---|
| `href` | канонический внутренний путь без префикса локали и до маппинга `pathnames`: `'/about'`, `'/blog/hello-world'` |
| `title`, `description` | уже переведённые строки. `title` попадает в `<title>` через шаблон и в og/twitter как есть |
| `absoluteTitle` | не применять шаблон layout (главная) |
| `noindex` | убрать страницу из индекса (демо) |

Локаль хелпер получает сам через `getLocale()`. У динамической страницы `href` собирается из параметра, пример с `/blog/[slug]` — в [11-dynamic-routes.md](./11-dynamic-routes.md).

Что из этого следует:

- Новое OG-поле для всех страниц (`type: 'article'` и `publishedTime` для постов, другая картинка) добавляй в хелпер, а не в layout. В layout оно потеряется на первой же странице со своим `openGraph`.
- Страница без `generateMetadata` получит из layout title по умолчанию и description. Из file convention `[locale]/opengraph-image.tsx` она унаследует og:image, а Next.js добавит og:title и og:description, равные этим title и description. canonical, hreflang, og:url, og:locale и og:site_name у неё не будет. Это замер на тестовой странице без metadata.

## canonical, hreflang и `x-default`

URL всех локалей считает [alternates.ts](../src/shared/seo/alternates.ts):

```ts
export function buildLanguageUrls(href: string): Record<Locale | 'x-default', string> {
  const urls = Object.fromEntries(
    routing.locales.map((locale) => [locale, absoluteUrl(localizePath(locale, href))])
  ) as Record<Locale, string>
  return { ...urls, 'x-default': urls[routing.defaultLocale] }
}

/** `alternates` for Metadata: self-referencing canonical + hreflang for all locales. */
export function buildAlternates(locale: Locale, href: string) {
  const languages = buildLanguageUrls(href)
  return { canonical: languages[locale], languages }
}
```

- **`localizePath` применяет маппинг `pathnames`**: `/about` превращается в `/ru/o-nas`. Склейка вручную, `/${locale}${href}`, дала бы `/ru/about`, а этот URL proxy редиректит на `/ru/o-nas` (проверяет e2e). Строковый `href` пропускается в `getPathname` через каст `as never` внутри `localizePath`, тем же компромиссом, что и в `@/shared/ui/Link`. Query и hash переносятся: `/about?tab=1#team` превращается в `/ru/o-nas?tab=1#team`. Подробности в [06-navigation.md](./06-navigation.md#localizepath--путь-строкой-вне-jsx).
- **canonical ссылается на саму страницу.** Каждая языковая версия каноническая для себя, на английскую её не направляют. Для Google переводы не дубли: «Localized versions of a page are only considered duplicates if the main content of the page remains untranslated».
- **`x-default` совпадает с URL дефолтной локали.** По Google это вариант, который «is used when no other language/region matches the user's browser setting». В шаблоне это URL без префикса. С `localeDetection: true` proxy уводит с него посетителя, у которого cookie или `Accept-Language` указывают на `ru`/`uk`, на его язык ([08-pathnames.md](./08-pathnames.md#localedetection)).
- **Набор один на все каналы.** `buildLanguageUrls` вызывают и metadata, и sitemap, поэтому URL в `<head>` и в `sitemap.xml` совпадают по построению.

Что получается в `<head>` на `/ru/o-nas` (вывод сборки):

```html
<link rel="canonical" href="https://example.com/ru/o-nas"/>
<link rel="alternate" hrefLang="en" href="https://example.com/about"/>
<link rel="alternate" hrefLang="ru" href="https://example.com/ru/o-nas"/>
<link rel="alternate" hrefLang="uk" href="https://example.com/uk/pro-nas"/>
<link rel="alternate" hrefLang="x-default" href="https://example.com/about"/>
```

На `/about` и `/uk/pro-nas` набор `alternate` тот же, меняется только canonical.

Для чего hreflang: по документации Google он помогает «point users to the most appropriate version of your page by language or region». О влиянии на ранжирование на этой странице Google ничего не пишет.

## Почему `alternateLinks: false`

Отдать hreflang можно тремя способами: HTTP-заголовком `Link`, тегами `<link>` в `<head>` и в sitemap. По умолчанию proxy next-intl добавляет заголовок `Link` к ответам, которые через него проходят. Google о сочетании способов: «While you can use all three methods at the same time, there's no benefit in Search».

Шаблон оставляет `<head>` и sitemap, а заголовок выключает в [routing.ts](../src/shared/i18n/routing.ts):

```ts
  // hreflang is emitted by page metadata and sitemap.xml with the canonical
  // SITE_URL (src/shared/seo). The proxy's `Link` header would duplicate it
  // using the request host, which differs behind reverse proxies/previews.
  alternateLinks: false,
```

Почему:

- Заголовок строится от хоста запроса: next-intl берёт `x-forwarded-host`, а если его нет — `host`. `<head>` и sitemap строятся от `SITE_URL`. В прежней версии шаблона на `/ru/o-nas` заголовок указывал на `http://localhost:…`, а `<head>` — на `https://example.com`: два разных набора URL для одной страницы.
- Заголовок уходил и с ответами 404 (`/ru/foobar`). Ответы 4xx Google не индексирует («Google doesn't index URLs that return a 4xx status code»), так что вреда нет, но это шум.
- canonical всё равно нужен в `<head>`, поэтому основной канал естественно держать там же.

next-intl называет поводами для отключения страницы, которых нет в части локалей, и пути из CMS. В шаблоне причина другая: один источник URL. Если вернёшь заголовок (например, для страниц без своей metadata), проверь, что прокси передаёт правильный `x-forwarded-host`.

e2e проверяет, что в заголовке `Link` нет hreflang.

## sitemap.xml: свой `<url>` для каждой пары «страница × локаль»

Записи строит [sitemap.ts](../src/app/sitemap.ts):

```ts
function entriesFor(href: string): MetadataRoute.Sitemap {
  const languages = buildLanguageUrls(href)
  return routing.locales.map((locale) => ({
    url: languages[locale],
    alternates: { languages },
  }))
}
```

Так требует Google: «Create a separate `<url>` element for each URL», и каждый элемент «lists every alternate version of the page, including itself». Примеры в документации Next.js и next-intl делают одну запись на страницу. Тогда `/ru/o-nas` и `/uk/pro-nas` попадают в sitemap только как `xhtml:link`, без собственного `<loc>`. Шаблон следует спецификации Google.

Две из трёх записей для `/about` (вывод сборки):

```xml
<url>
<loc>https://example.com/about</loc>
<xhtml:link rel="alternate" hreflang="en" href="https://example.com/about" />
<xhtml:link rel="alternate" hreflang="ru" href="https://example.com/ru/o-nas" />
<xhtml:link rel="alternate" hreflang="uk" href="https://example.com/uk/pro-nas" />
<xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/about" />
</url>
<url>
<loc>https://example.com/ru/o-nas</loc>
<xhtml:link rel="alternate" hreflang="en" href="https://example.com/about" />
<!-- …the same four links… -->
</url>
```

Что важно:

- В sitemap попадают только страницы, которые должны индексироваться: `STATIC_PAGES = ['/', '/about', '/blog', '/contact']` и посты из `getAllPosts()`. Демо исключены, у них `noindex`.
- Если страница или пост есть не во всех локалях, убирай недостающие и из `<url>`, и из hreflang: hreflang не должен вести на 404. Для постов это разобрано в [11-dynamic-routes.md](./11-dynamic-routes.md#пост-переведён-не-на-все-языки).
- `sitemap.ts` лежит в корне `app/`, вне `[locale]`. Путь с точкой matcher proxy пропускает, а локаль `localizePath` получает явно. Next.js кеширует sitemap как статический Route Handler: `/sitemap.xml` пререндерится при сборке.
- `lastModified` не задан: у статических страниц нет дат изменения. Если даты есть (CMS), добавь их.
- Для большого сайта sitemap делят вложенными `sitemap.ts` в сегментах или через [`generateSitemaps`](https://nextjs.org/docs/app/api-reference/functions/generate-sitemaps).

## OpenGraph-картинка для каждой локали

[`src/app/[locale]/opengraph-image.tsx`](../src/app/[locale]/opengraph-image.tsx) рисует PNG 1200×630 с названием и описанием сайта на языке локали: `/en/opengraph-image`, `/ru/opengraph-image`, `/uk/opengraph-image`.

```tsx
// Only the known locales; anything else is a 404 without rendering or caching.
// (Remove `dynamicParams` if you enable cacheComponents — it isn't supported
// there; the notFound() below keeps unknown locales out.)
export const dynamicParams = false
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()

  const t = await getTranslations({ locale, namespace: 'site' })
```

**Локаль берётся из `params`.** Metadata image routes ведут себя как Route Handlers, `next/root-params` в них недоступен. Поэтому локаль приходит из `params` и передаётся в `getTranslations({ locale, namespace })` явно.

**Картинки пререндерятся при сборке.** Собственный `generateStaticParams` даёт по картинке на локаль. В выводе `next build` это `● /en/opengraph-image`, `● /ru/opengraph-image` и `● /uk/opengraph-image`, в `prerender-manifest.json` у них `initialRevalidateSeconds: false`. На запрос сервер отдаёт готовый PNG (`x-nextjs-cache: HIT`). `generateStaticParams` из `[locale]/layout.tsx` на картинку не распространяется. Без своего списка маршрут собирается как `ƒ /[locale]/opengraph-image`, и картинка рендерится заново на каждый запрос: на копии шаблона два запроса `/ru/opengraph-image` дали два рендера.

`dynamicParams = false` отдаёт 404 на `/xx/opengraph-image`, картинка при этом не рендерится. Это проверяет e2e. С Cache Components `dynamicParams` не поддерживается, его придётся убрать. Тогда неизвестную локаль отсечёт `notFound()` после `hasLocale`.

**`alt`.** Экспорта `alt` у файла нет: он задаёт одну строку на все локали. Переведённый `og:image:alt` (`site.name`) задаёт `buildPageMetadata`.

**Шрифт.** Дефолтный шрифт `next/og` в Next.js 16.4.3 — Geist Regular, в нём только начертание 400, кириллица есть. Заголовок картинки набран начертанием 600, ради него шаблон передаёт свой шрифт. С заданным `fonts` дефолтный шрифт не подключается, поэтому в переданном шрифте должны быть все глифы текста. Шаблон грузит Geist 600 из Google Fonts с параметром `text=`, и Google отдаёт подмножество только с нужными глифами:

```ts
async function loadGoogleFont(family: string, text: string): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`
  const css = await fetch(url).then((res) => (res.ok ? res.text() : ''))
  const source = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1]
  const font = source ? await fetch(source) : undefined
  if (!font?.ok) throw new Error(`Failed to load font ${family} for the OpenGraph image`)
  return font.arrayBuffer()
}
```

Шрифт запрашивается при сборке, как и `next/font/google` в layout, поэтому сборке нужен доступ к fonts.googleapis.com. Если шрифт не загрузился, `loadGoogleFont` бросает ошибку, и сборка останавливается на `/[locale]/opengraph-image`. Это проверено с несуществующим семейством шрифта. Картинка без нужного шрифта в продакшн не уйдёт. Если сборка идёт без сети, положи `.ttf` в репозиторий и читай его через `fs.readFile`, как подсказывает комментарий в коде. С Cache Components `loadGoogleFont` нужно пометить `'use cache'`.

Добавляешь локаль с другой письменностью — проверь, что в выбранном шрифте есть её глифы.

**Почему ссылка на картинку прописана явно.** File convention добавляет og:image сегменту `[locale]`, и вложенные страницы его наследуют. Но только пока страница не задаёт свой `openGraph`, а `buildPageMetadata` задаёт его всегда (ради og:title). Поэтому путь указан явно в [og-image.ts](../src/shared/seo/og-image.ts):

```ts
export function ogImagePath(locale: Locale): string {
  return `/${locale}/opengraph-image`
}
```

Путь относительный, абсолютным его делает `metadataBase`: `<meta property="og:image" content="https://example.com/ru/opengraph-image"/>`. `twitter:image` указывает на ту же картинку.

**Исключение из matcher.** Путь картинки всегда с префиксом, даже у `en`. При `localePrefix: 'as-needed'` proxy редиректил бы `/en/opengraph-image` на URL без префикса. Краулер получил бы редирект вместо картинки, а с `Accept-Language: ru` ещё и второй: `/opengraph-image` уводит его на `/ru/opengraph-image`. По документации next-intl при настроенном `localePrefix` такой маршрут может и вовсе оказаться недоступен. Поэтому matcher в [proxy.ts](../src/proxy.ts) эти пути пропускает:

```ts
  matcher: '/((?!api(?:/|$)|_next|_vercel|(?:.*/)?opengraph-image(?:/|$)|.*\\..*).*)',
```

В документации next-intl исключения записаны как `api` и `.*/opengraph-image`. Такой вариант пропускает мимо proxy и `/apiary`, и пост `/blog/opengraph-image-tips`. В шаблоне оба исключения привязаны к целому сегменту пути. Proxy обрабатывает `/apiary`, `/api-docs` и `/blog/designing-opengraph-images`, а `/api/health`, `/en/opengraph-image` и `/ru/blog/hello-world/opengraph-image` пропускает. Это закрепляет unit-тест [tests/unit/proxy-matcher.test.ts](../tests/unit/proxy-matcher.test.ts). Для исключённых путей не работает никакая логика proxy, в том числе auth и CSP, если ты их туда добавишь ([01-setup.md](./01-setup.md#matcher-что-важно-знать)).

e2e проверяет, что `/en/opengraph-image` отвечает 200 без редиректа, а `/xx/opengraph-image` — 404. og:image страницы `/uk/blog/hello-world` должен вести на `/uk/opengraph-image` и отдавать `image/png`.

**`og:locale`.** [`OG_LOCALE`](../src/shared/seo/og-locale.ts) переводит код локали в формат `language_TERRITORY`: `en_US`, `ru_RU`, `uk_UA`. Тип у него `Record<Locale, string>`, поэтому пропущенная локаль — ошибка компиляции.

## `noindex` для демо-страниц

Демо-страницы передают `noindex: true`, например [demo/formats/page.tsx](../src/app/[locale]/demo/formats/page.tsx):

```ts
  return buildPageMetadata({
    href: '/demo/formats',
    title: t('title'),
    description: t('intro'),
    noindex: true,
  })
```

В `<head>` получается `<meta name="robots" content="noindex, follow"/>`. `nofollow` нет, поэтому по ссылкам со страницы Google может находить другие страницы: «Google may use the links on the page to discover those linked pages».

- Демо нет в sitemap: sitemap перечисляет только то, что должно индексироваться.
- В `robots.txt` демо **не** закрыты, и это сделано намеренно. Google видит `noindex`, только если может загрузить страницу: «For the noindex rule to be effective, the page or resource must not be blocked by a robots.txt file».
- 404-ответы получают `noindex` от самого Next.js, см. [09-error-pages.md](./09-error-pages.md).

## JSON-LD

На `/about` есть структурированные данные с языком страницы ([about/page.tsx](../src/app/[locale]/about/page.tsx)):

```tsx
      <script
        type="application/ld+json"
        // Escape `<` so a `</script>` inside any string value (e.g. a future
        // CMS-sourced translation) can't break out of the JSON-LD block.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
```

- `inLanguage: locale` берётся из `getLocale()`, `name` и `description` — переведённые строки.
- `JSON.stringify` не экранирует HTML. Строка с `</script>`, например перевод из CMS, закрыла бы тег, и после него можно было бы внедрить разметку. Замена `<` на `\u003c` — способ из [документации Next.js](https://nextjs.org/docs/app/guides/json-ld).
- JSON-LD рендерится тегом `<script>` в странице, а не через metadata. Так рекомендует Next.js.

## robots.txt

Один [robots.ts](../src/app/robots.ts) на весь сайт:

```ts
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
```

`robots.txt` живёт в корне origin, а не в каждой локали. На него приходится один sitemap для всех языков, связи между которыми задаёт hreflang внутри. Вывод:

```
User-Agent: *
Allow: /

Sitemap: https://example.com/sitemap.xml
```

Закрывать preview от индексации шаблон не умеет. Если нужно, правило можно сделать зависимым от окружения:

```ts
// example: not in the template
rules: process.env.VERCEL_ENV === 'production'
  ? [{ userAgent: '*', allow: '/' }]
  : [{ userAgent: '*', disallow: '/' }],
```

## Как перенести в свой проект

1. Возьми [site.ts](../src/shared/config/site.ts) и задай `SITE_URL` во всех окружениях.
2. Добавь `localizePath` в свой `navigation.ts` ([06-navigation.md](./06-navigation.md#localizepath--путь-строкой-вне-jsx)) вместе с `splitHref` из [src/shared/lib/href.ts](../src/shared/lib/href.ts) (он импортирует соседний `search-params.ts`) и скопируй `src/shared/seo/*`.
3. В root layout `[locale]` задай `metadataBase` и шаблон title. `openGraph` и `twitter` в layout не задавай.
4. В каждой странице сделай `generateMetadata` → `buildPageMetadata({ href, title, description })`. Утилитарным страницам передавай `noindex: true`.
5. Перенеси `sitemap.ts` и `robots.ts`, впиши в `STATIC_PAGES` свои индексируемые страницы и добавь динамический контент.
6. Перенеси `opengraph-image.tsx` вместе с его `generateStaticParams`, иначе картинка будет рендериться на каждый запрос. Исключи `opengraph-image` из matcher proxy с привязкой к сегменту и выбери шрифт под свои письменности. Если сборка идёт без доступа к Google Fonts, используй локальный файл шрифта.
7. Поставь `alternateLinks: false`, если hreflang у тебя отдают metadata и sitemap.
8. Перенеси проверки из [tests/e2e/seo.spec.ts](../tests/e2e/seo.spec.ts) и [tests/unit/proxy-matcher.test.ts](../tests/unit/proxy-matcher.test.ts).

## Проверка

[tests/e2e/seo.spec.ts](../tests/e2e/seo.spec.ts) на production-сборке проверяет:

- canonical и hreflang всех локалей с `x-default` на `/ru/o-nas`;
- свои og:title, og:locale, og:url, twitter:card у поста, og:image своей локали (`/uk/opengraph-image`), который отвечает 200 и `image/png`;
- `/en/opengraph-image` без редиректа, `/xx/opengraph-image` — 404;
- шаблон title, `inLanguage` в JSON-LD;
- `noindex` у демо и его отсутствие на `/about`;
- `<loc>` для каждой локали в sitemap, `x-default`, отсутствие `/demo/`;
- `Sitemap:` в `robots.txt`, отсутствие hreflang в заголовке `Link`.

[tests/unit/proxy-matcher.test.ts](../tests/unit/proxy-matcher.test.ts) без сборки проверяет, какие пути matcher отдаёт proxy, а какие пропускает.

Как запускать и как устроен CI — в [14-testing.md](./14-testing.md).

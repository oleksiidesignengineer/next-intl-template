# Динамические роуты: `/blog/[slug]`

Блог показывает SSG для пар «локаль × slug»: 3 локали × 3 поста = **9 статических страниц**. Slug во всех локалях одинаковый, префикс локали добавляет next-intl: `/blog/hello-world` для `en` (default, `as-needed`), `/ru/blog/hello-world`, `/uk/blog/hello-world`.

Файлы:
- [src/app/[locale]/blog/page.tsx](../src/app/[locale]/blog/page.tsx) — список постов;
- [src/app/[locale]/blog/[slug]/page.tsx](../src/app/[locale]/blog/[slug]/page.tsx) — пост;
- [src/entities/post/](../src/entities/post/index.ts) — данные.

Как локаль попадает в серверный код и зачем `generateStaticParams` в layout, описано в [02-app-router.md](./02-app-router.md). Навигация — в [06-navigation.md](./06-navigation.md).

## Данные: `src/entities/post`

```ts
export type BlogPost = {
  slug: string
  publishedAt: string // ISO date string
  translations: Record<Locale, BlogPostTranslation>
}
```

Выдержка из [model/types.ts](../src/entities/post/model/types.ts). `Locale` здесь — `import type { Locale } from 'next-intl'`, union из `routing.locales`. Поэтому при добавлении локали TypeScript потребует перевод для каждого поста. В CMS переводов может не быть, этот случай разобран [ниже](#пост-переведён-не-на-все-языки).

[api/posts.ts](../src/entities/post/api/posts.ts) экспортирует `getAllPosts()` (свежие первыми) и `getPostBySlug(slug)`. Данные захардкожены. В реальном проекте замени реализацию на запрос к CMS или базе. Такой запрос асинхронный, поэтому функции начнут возвращать `Promise`, и в местах вызова (страницы блога, `generateStaticParams`, `generateMetadata`, [sitemap.ts](../src/app/sitemap.ts)) добавится `await`. Импорт — только через барель `@/entities/post` (правило FSD, см. [FSD_GUIDE.md](./FSD_GUIDE.md)).

## `generateStaticParams`: дочерний сегмент возвращает только `slug`

```tsx
// Every (locale × slug) pair is pre-rendered: the locale values come from
// [locale]/layout.tsx's generateStaticParams, the slugs from here.
export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}
```

Локали перечисляет `generateStaticParams` корневого layout. Next.js вызывает дочернюю функцию один раз для каждого набора параметров родителя и объединяет результаты: 3 × 3 = 9 страниц, в выводе `next build` они помечены `●`. Возвращать `locale` из дочернего `generateStaticParams` (через `flatMap` по `routing.locales`) не нужно.

### Если список slug зависит от локали

Когда CMS отдаёт посты по языкам, возьми локаль из аргумента `params`: его заполняет родительский `generateStaticParams`.

```tsx
// example: slugs fetched per locale from a CMS
export async function generateStaticParams({
  params: { locale },
}: {
  params: Awaited<LayoutProps<'/[locale]'>['params']>
}) {
  const posts = await cms.getPosts({ locale })
  return posts.map((post) => ({ slug: post.slug }))
}
```

Здесь `locale` — это `string`. Если клиент CMS ждёт `Locale`, сузь значение через `hasLocale(routing.locales, locale)`.

Root params во вложенном `generateStaticParams` тоже доступны. По документации Next.js там работает getter из `next/root-params`, и это проверено в шаблоне: `rootParams.locale()` и `getTranslations('blog')` без явной локали возвращают значения нужной локали и в `next build`, и в `next dev`. Аргумент `params` всё равно удобнее: зависимость видна в сигнатуре.

### Много постов

В шаблоне список slug закрыт: `export const dynamicParams = false` в [`[locale]/layout.tsx`](../src/app/[locale]/layout.tsx) действует на все маршруты ниже, и slug вне `generateStaticParams` сразу получает 404. Для захардкоженных постов это правильно. Если же постов много и ты хочешь пререндерить только часть (например, свежие), а остальные рендерить при первом запросе, список нужно открыть:

- **убери `dynamicParams = false` из layout.** `export const dynamicParams = true` в `blog/[slug]/page.tsx` его не перекрывает: Next.js закрывает маршрут, если `false` объявил хоть один сегмент пути. Это проверено, подробнее в [02-app-router.md](./02-app-router.md#generatestaticparams);
- неизвестные локали после этого отсекает `notFound()` в `request.ts`, а неизвестные slug — `notFound()` в странице (см. [ниже](#404-при-неизвестном-slug));
- сегменты, где список должен остаться закрытым, могут объявить `dynamicParams = false` у себя.

## Страница: `PageProps` и `getLocale()`

```tsx
export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  const locale = await getLocale()
  const t = await getTranslations('blog')
  const translation = post.translations[locale]
```

- **`type Props = PageProps<'/[locale]/blog/[slug]'>`.** Это глобальный хелпер: Next.js генерирует его при `next dev`, `next build` и `next typegen`. В `params` есть `{ locale: string; slug: string }`, но страница читает только `slug`.
- **Локаль — из `getLocale()`, а не из `params`.** `getLocale()` возвращает union `Locale`, поэтому `post.translations[locale]` типизирован без каста. `params.locale` — это `string`, и для того же индекса пришлось бы сужать его вручную. Неизвестную локаль к этому моменту уже отсеяли `dynamicParams = false` и `request.ts`.
- **`setRequestLocale` не нужен.** Страница статическая благодаря root params и `generateStaticParams`.
- **`t('publishedOn', { date: new Date(post.publishedAt) })`** — сообщение `Published on {date, date, long}`. Стиль `long` здесь — глобальный формат из `formats` в [request.ts](../src/shared/i18n/request.ts): его опции накладываются поверх встроенного ICU-стиля `long` по полям, а не заменяют его целиком. Сейчас они совпадают со встроенными, поэтому на `/blog/hello-world` выходит «Published on April 12, 2026». Подробнее в [05-formatting.md](./05-formatting.md).

## `generateMetadata`

```tsx
export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return {}

  const translation = post.translations[await getLocale()]
  return buildPageMetadata({
    href: `/blog/${slug}`,
    title: translation.title,
    description: translation.excerpt,
  })
}
```

- Явная локаль не нужна ни в `getLocale()`, ни в `getTranslations()`: `generateMetadata` — серверный код под root layout, и root params в нём доступны.
- `buildPageMetadata` собирает title, description, canonical, hreflang для всех локалей с `x-default`, OpenGraph/Twitter и og:image своей локали. `href` передаётся каноническим внутренним путём, без префикса локали. Подробнее в [07-metadata-seo.md](./07-metadata-seo.md).
- `return {}` для неизвестного slug нужен, когда список slug открыт (см. [Много постов](#много-постов)): тогда страница сама вызовет `notFound()`. В ответ с 404 Next.js добавляет `<meta name="robots" content="noindex">`.

## Ссылки на пост

В списке ([blog/page.tsx](../src/app/[locale]/blog/page.tsx)):

```tsx
<Link href={`/blog/${post.slug}`} className="text-blue-600 hover:underline">
  {translation.title}
</Link>
```

`Link` здесь — обёртка [`@/shared/ui/Link`](../src/shared/ui/Link.tsx) с `href: string`. `/blog/[slug]` нет в `pathnames`: URL во всех локалях одинаковый, и next-intl только добавляет префикс. Почему `pathnames` держим минимальным, объяснено в [08-pathnames.md](./08-pathnames.md).

Переключатель языка на странице поста сохраняет slug. Для маршрута вне `pathnames` `usePathname()` из next-intl возвращает путь как есть (`/blog/hello-world`), и `LangSwitcher` меняет только локаль. Это покрыто e2e: `/blog/hello-world` → `/uk/blog/hello-world`.

## Sitemap

```ts
...getAllPosts().flatMap((post) => entriesFor(`/blog/${post.slug}`)),
```

Выдержка из [src/app/sitemap.ts](../src/app/sitemap.ts). Каждый пост даёт по `<url>` на локаль, и в каждом полный набор hreflang с `x-default`. URL строит тот же `buildLanguageUrls`, что и `<link rel="alternate">` в metadata, поэтому sitemap и `<head>` не расходятся.

## Локализованные URL постов: два разных случая

«Локализовать URL поста» может означать две разные задачи, и решаются они по-разному. В шаблоне не включена ни одна: slug общий, сегмент `/blog` одинаковый во всех локалях. Ниже рецепты на случай, если понадобится. Их можно и совмещать: документация next-intl предлагает локализовать статическую часть через `pathnames`, а динамическую брать из CMS.

### Случай 1: локализован статический сегмент, slug общий

`/blog/hello-world` ↔ `/ru/stati/hello-world` ↔ `/uk/statti/hello-world`.

```ts
// example: not enabled in the template
pathnames: {
  '/about': { en: '/about', ru: '/o-nas', uk: '/pro-nas' },
  '/blog': { en: '/blog', ru: '/stati', uk: '/statti' },
  '/blog/[slug]': { en: '/blog/[slug]', ru: '/stati/[slug]', uk: '/statti/[slug]' },
},
```

Страницы, `generateStaticParams` и данные не меняются. Proxy переписывает `/ru/stati/hello-world` во внутренний `/ru/blog/hello-world`, а `LangSwitcher` работает без правок: `usePathname()` возвращает шаблон `/blog/[slug]`, а `useParams()` подставляет slug. Проверено: `/ru/stati/hello-world` → `/uk/statti/hello-world`.

**Грабли (проверено).** next-intl сопоставляет с `pathnames` только ключи, а строка `/blog/hello-world` ключом не является. Поэтому строковый `href` не маппится:

- `Link` из `@/shared/ui/Link` рендерит `/ru/blog/hello-world`. До страницы он доходит только через лишний 307 от proxy;
- хуже того, canonical, hreflang и sitemap строятся через `localizePath` от той же строки и указывают на `/ru/blog/hello-world`, то есть на URL, который отвечает редиректом.

Поэтому для такого маршрута везде используй объектную форму `{ pathname: '/blog/[slug]', params: { slug } }`:

```tsx
// example: typed Link from navigation — the route is now in `pathnames`
import { Link } from '@/shared/i18n/navigation'

<Link href={{ pathname: '/blog/[slug]', params: { slug: post.slug } }}>{translation.title}</Link>
```

Для metadata и sitemap расширь тип `href` по цепочке `localizePath` → `buildLanguageUrls` → `buildAlternates` → `buildPageMetadata`. Сейчас там `string`, а `getPathname` объектную форму принимает:

```ts
// example: localizePath that also accepts the object form
export function localizePath(
  locale: Locale,
  href: string | { pathname: string; params?: Record<string, string> }
): string {
  if (typeof href !== 'string') return getPathname({ locale, href: href as never })
  // ...the template's string branch (query and #hash via splitHref) stays as is
}
```

Если страницы перегенерируются через `revalidatePath`, учти ещё одну деталь из документации next-intl: для страницы, пререндеренной при сборке, путь указывается внутренний (`/ru/blog/hello-world`), а для отрендеренной по запросу — локализованный (`/ru/stati/hello-world`). Если сомневаешься, используй `revalidateTag` ([next-intl: revalidation](https://next-intl.dev/docs/routing/configuration#localized-pathnames-revalidation)).

### Случай 2: у каждой локали свой slug из CMS

`/blog/hello-world` ↔ `/ru/blog/privet-mir` ↔ `/uk/blog/pryvit-svit`.

Модель данных хранит slug для каждой локали:

```ts
// example: CMS-driven slugs, one per locale
type BlogPost = {
  id: string
  publishedAt: string
  slugs: Record<Locale, string>
  translations: Record<Locale, BlogPostTranslation>
}
```

Документация next-intl формулирует главное требование так: переключатель языка и alternate links должны знать URL из CMS. В коде это затрагивает пять мест.

**1. `generateStaticParams`** возвращает slug своей локали. Пример с `params: { locale }` приведён [выше](#если-список-slug-зависит-от-локали).

**2. Поиск поста** идёт по паре (локаль, slug), а не только по slug.

**3. canonical, hreflang и sitemap.** `buildLanguageUrls(href)` подставляет один `href` во все локали, а здесь у каждой локали свой. Нужен вариант, который принимает карту:

```ts
// example: hreflang when every locale has its own slug
export function buildLanguageUrlsFromHrefs(
  hrefs: Record<Locale, string>
): Record<Locale | 'x-default', string> {
  const urls = Object.fromEntries(
    routing.locales.map((locale) => [locale, absoluteUrl(localizePath(locale, hrefs[locale]))])
  ) as Record<Locale, string>
  return { ...urls, 'x-default': urls[routing.defaultLocale] }
}
```

Карта строится из `post.slugs`: `/blog/${post.slugs[locale]}` для каждой локали. Её используют и `generateMetadata` (через `buildPageMetadata`, где `href` придётся сделать строкой или картой), и `sitemap.ts`.

**4. Переключатель языка.** `LangSwitcher` сохраняет текущие `params`, поэтому с `/ru/blog/privet-mir` он ведёт на `/uk/blog/privet-mir`. Такого slug в `uk` нет, и пользователь получит 404. Переключатель не может просто узнать правильный slug: он живёт в шапке, которую рендерит layout, а Next.js передаёт layout только его собственные параметры, без `slug` страницы. Есть два варианта:

- **Терпимый поиск на странице (проще).** Если slug не найден в текущей локали, страница ищет пост по slug любой локали и делает редирект на slug своей. Переключатель остаётся как есть. Цена — один лишний редирект при смене языка. Кроме того, такие URL рендерятся по запросу, потому что их нет в `generateStaticParams` этой локали. Значит, список slug должен быть открыт (см. [Много постов](#много-постов)): при `dynamicParams = false` в layout Next.js ответит 404 раньше, чем страница успеет сделать редирект.

  ```tsx
  // example: CMS-driven slugs; not part of the template
  const post = await cms.getPost({ locale, slug })
  if (!post) {
    // LangSwitcher keeps the slug of the previous locale: find the post by it
    // and redirect to this locale's own slug.
    const other = await cms.findPostBySlugInAnyLocale(slug)
    if (!other) notFound()
    // Untyped href: the same deliberate cast as in @/shared/ui/Link.
    redirect({ href: `/blog/${other.slugs[locale]}` as never, locale })
  }
  ```

  `redirect` здесь берётся из `@/shared/i18n/navigation`, а не из `next/navigation`: он сам добавляет префикс локали. Чтобы поиск был однозначным, slug должен определять пост во всех локалях.
- **Готовые URL для переключателя.** Страница знает slug всех локалей и может отдать переключателю готовые адреса: отрендерить переключатель у себя или передать карту URL через клиентский контекст, который читает `LangSwitcher`. Лишнего редиректа нет, но такой код сложнее.

**5. `Link`-заголовок proxy.** Здесь делать ничего не нужно: в [routing.ts](../src/shared/i18n/routing.ts) уже стоит `alternateLinks: false`. С включённым заголовком proxy перечислял бы один и тот же slug для всех локалей, а next-intl прямо называет управление URL из CMS поводом его отключить. hreflang в шаблоне отдают metadata и sitemap.

### Пост переведён не на все языки

Типичная ситуация для CMS. Сделай `slugs` и `translations` типа `Partial<Record<Locale, …>>`. Отсутствующую локаль исключай из `generateStaticParams`, из hreflang и из sitemap: hreflang не должен вести на 404. Для такой страницы переключатель должен вести на что-то осмысленное, например на `/blog` этой локали.

## 404 при неизвестном slug

```tsx
const post = getPostBySlug(slug)
if (!post) notFound()
```

В шаблоне неизвестный slug до этой строки не доходит. Список закрыт `dynamicParams = false` в layout: для slug вне `generateStaticParams` маршрут `blog/[slug]` не совпадает, страница не вызывается, и URL достаётся catch-all `[locale]/[...rest]`, который сам вызывает `notFound()` (проверено логированием; без `[...rest]` ответом была бы английская `global-not-found`). `notFound()` в странице — для случая, когда список открыт: CMS со slug, рендерящимися по запросу, или Cache Components.

В обоих случаях рендерится [src/app/[locale]/not-found.tsx](../src/app/[locale]/not-found.tsx). Это Server Component с `useTranslations`, и он рендерится внутри root layout, то есть с шапкой и правильным `lang`. По e2e `/uk/blog/does-not-exist` отвечает 404 с заголовком «Сторінку не знайдено». Все уровни 404 описаны в [09-error-pages.md](./09-error-pages.md).

Учти, что этот контент появляется только на клиенте: серверный HTML такой 404 — пустая оболочка `<html id="__next_error__">`, статус 404 и `noindex` при этом правильные ([09-error-pages.md](./09-error-pages.md#как-выглядит-ответ-404)).

С включёнными Cache Components это меняется: первый запрос неизвестного slug вне `generateStaticParams` отдаёт 200 с `noindex` (soft 404), потому что к моменту `notFound()` стрим уже начался. Повторные запросы того же URL получают 404 из кеша. Как с этим быть, описано в [02-app-router.md](./02-app-router.md#cache-components).

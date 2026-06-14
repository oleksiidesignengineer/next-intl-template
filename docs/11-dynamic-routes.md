# Динамические роуты с `/blog/[slug]`

Страница `/blog` и `/blog/[slug]` демонстрируют SSG-паттерн: 3 поста × 3 локали = **9 статически сгенерированных страниц**. Slug одинаковый для всех локалей, URL получает префикс локали автоматически.

Для навигации с динамическими роутами см. также [06-navigation.md](./06-navigation.md).

## Источник данных: `src/entities/post/api/posts.ts`

Тип `BlogPost`:

```ts
export type BlogPost = {
  slug: string
  publishedAt: string // ISO date string
  translations: Record<Locale, BlogPostTranslation>
}
```

`BlogPostTranslation` содержит `title`, `excerpt`, `body`. Переводы для каждой локали хранятся внутри самого поста — никаких отдельных файлов.

Два хелпера:

```ts
// Все посты, отсортированные по дате (свежие первые).
export function getAllPosts(): BlogPost[]

// Пост по slug или undefined.
export function getPostBySlug(slug: string): BlogPost | undefined
```

`getAllPosts()` сортирует через `new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()`.

**В реальном проекте** замени реализацию на fetch из CMS — подробнее про паттерны интеграции в [10-faq.md](./10-faq.md).

## `generateStaticParams` для (locale × slug)

Файл `src/app/[locale]/blog/[slug]/page.tsx`:

```tsx
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    getAllPosts().map((post) => ({ locale, slug: post.slug }))
  )
}
```

`flatMap` создаёт все комбинации: для 3 локалей и 3 постов возвращает 9 объектов `{ locale, slug }`. Это говорит Next.js: «pre-render каждую из этих страниц на этапе `next build`».

Без `generateStaticParams` страница с `params.slug` будет рендериться динамически при каждом запросе. С ним — выдаётся как статический HTML из CDN.

## Тело страницы: `setRequestLocale` обязателен

Как и в любом server page/layout под `[locale]`, в самой странице нужно вызвать `setRequestLocale` — иначе она выпадет из static rendering, и `generateStaticParams` выше теряет смысл:

```tsx
type Props = { params: Promise<{ locale: string; slug: string }> }

export default async function BlogPostPage({ params }: Props) {
  const { locale, slug } = await params
  setRequestLocale(locale as Locale) // <-- обязательно, иначе страница не SSG

  const post = getPostBySlug(slug)
  if (!post) notFound()

  const t = await getTranslations('blog')
  // ...
}
```

Подробнее про `setRequestLocale` и его статус — [02-app-router.md](./02-app-router.md).

## `generateMetadata` с пост-переводом

```tsx
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return {}

  const translation = post.translations[locale as Locale]
  return {
    title: translation.title,
    description: translation.excerpt,
    alternates: buildLanguageAlternates(locale, `/blog/${slug}`),
  }
}
```

Fallback `return {}` при несуществующем slug не ломает сборку — Next.js примет пустой объект. Страница сама вернёт 404 через `notFound()` (см. ниже).

`buildLanguageAlternates` генерирует hreflang-теги для всех трёх локалей. Подробнее — в [07-metadata-seo.md](./07-metadata-seo.md).

## Использование `Link` с динамическим slug

В списке постов (`src/app/[locale]/blog/page.tsx`):

```tsx
import Link from '@/shared/ui/Link'

<Link href={`/blog/${post.slug}`}>
  {translation.title}
</Link>
```

`@/shared/ui/Link` принимает `href: string` и принимает любой путь без TypeScript-ошибки. next-intl добавляет префикс локали в runtime: для `ru` это будет `/ru/blog/hello-world`, для `en` (defaultLocale) — `/blog/hello-world`.

### Почему строковый шаблон работает

Оригинальный `Link` из `@/shared/i18n/navigation` типизирован строго против ключей `pathnames` в `routing.ts`. `/blog` и `/blog/[slug]` там не перечислены — URL одинаковый во всех локалях, поэтому регистрировать их в `pathnames` нет смысла.

Обёртка снимает это ограничение через `href as never` на границе. Подробнее — в комментарии [`src/shared/ui/Link.tsx`](../src/shared/ui/Link.tsx).

### Объектная форма `{ pathname, params }` — когда нужна

Если slug **локализован** (в `pathnames` записан маршрут с параметром), Link нужен в объектной форме:

```tsx
// pathnames содержит: '/blog/[slug]': { en: '/blog/[slug]', de: '/artikel/[slug]' }
import { Link } from '@/shared/i18n/navigation'

<Link href={{ pathname: '/blog/[slug]', params: { slug: post.slug } }}>
  {translation.title}
</Link>
```

**Trade-off строковой формы**: нет compile-time проверки, что такой slug вообще существует. Это нормально, если источник данных заведомо корректный (данные из CMS или `getAllPosts()`). Если хочешь compile-time гарантий — добавь маршрут в `pathnames` и используй типизированный Link напрямую.

## Локализованные slugs (в шаблоне не сделано)

Паттерн оправдан для рынков с чувствительностью к URL-семантике (DE, FR, ES). Объявление в `pathnames`:

```ts
pathnames: {
  '/blog/[slug]': {
    en: '/blog/[slug]',
    de: '/blog/[slug]',
    fr: '/blog/[slug]',
  },
}
```

Когда slug **реально разный** по локалям (`/blog/hello-world` vs `/blog/hallo-welt`), структура данных усложняется: у поста должны быть `slug.en`, `slug.de` и т.д. `generateStaticParams` тоже меняется — нужно брать slug из нужного поля. В шаблоне этого нет. Для CMS-проектов этот маппинг обычно приходит из самого CMS.

## Sitemap

`src/app/sitemap.ts` добавляет блог-посты автоматически:

```ts
const blogEntries = getAllPosts().map((post) =>
  buildEntry(`/blog/${post.slug}`)
)
```

`buildEntry` строит запись с `url` (URL для defaultLocale) и `alternates.languages` со всеми локалями. Каждый пост получает hreflang-alternates для `en`, `ru`, `uk`.

## 404 при несуществующем slug

```tsx
const post = getPostBySlug(slug)
if (!post) notFound()
```

`notFound()` из `next/navigation` прерывает рендер и передаёт управление ближайшему `not-found.tsx`. В шаблоне это `src/app/[locale]/not-found.tsx` — Client Component с `useTranslations`, показывает переведённое сообщение об ошибке. Подробнее — в [09-error-pages.md](./09-error-pages.md).

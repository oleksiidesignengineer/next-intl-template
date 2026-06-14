# Metadata и SEO

## `generateMetadata` + `getTranslations`

Базовый паттерн — переведённые title/description через `getTranslations`.

**`[locale]/layout.tsx`** — шаблон title для всего приложения:

```ts
export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  const t = await getTranslations({ locale, namespace: 'home' })
  return {
    title: {
      default: t('seo.title'),          // используется если страница не задала свой title
      template: `%s | ${t('seo.title')}` // → "About | next-intl template"
    },
    description: t('seo.description'),
  }
}
```

**`[locale]/about/page.tsx`** — переопределение title на конкретной странице:

```ts
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'about' })
  return {
    title: t('seo.title'),        // подставится в template → "About | next-intl template"
    description: t('seo.description'),
  }
}
```

В `generateMetadata` `locale` всегда передаётся явно в `getTranslations({ locale, namespace })` — на этапе генерации метадаты `setRequestLocale` ещё не вызван, и request context не привязан.

## `alternates.languages` (hreflang) на странице

hreflang сообщает поисковикам, что одна и та же страница доступна на нескольких языках. Страницы шаблона используют хелпер `buildLanguageAlternates` из `@/shared/seo/alternates`:

```ts
import { buildLanguageAlternates } from '@/shared/seo/alternates'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'about' })
  return {
    title: t('seo.title'),
    description: t('seo.description'),
    alternates: buildLanguageAlternates(locale, '/about'),
  }
}
```

Хелпер возвращает `canonical` (абсолютный URL текущей локали) и `languages` (словарь всех локалей). Использование абсолютных URL — требование Google для hreflang.

### Что делает хелпер внутри (для справки)

```ts
import type { Metadata } from 'next'
import { getPathname } from '@/shared/i18n/navigation'
import { routing } from '@/shared/i18n/routing'

const HOST = 'https://example.com'

export function buildLanguageAlternates(
  currentLocale: string,
  href: string
): NonNullable<Metadata['alternates']> {
  return {
    // @ts-expect-error -- href intentionally widened beyond pathnames keys
    canonical: HOST + getPathname({ locale: currentLocale, href }),
    languages: {
      // x-default — вариант для пользователей, чей язык не совпал ни с одной
      // из локалей; указываем на defaultLocale.
      'x-default':
        // @ts-expect-error -- href intentionally widened beyond pathnames keys
        HOST + getPathname({ locale: routing.defaultLocale, href }),
      ...Object.fromEntries(
        routing.locales.map((locale) => [
          locale,
          // @ts-expect-error -- href intentionally widened beyond pathnames keys
          HOST + getPathname({ locale, href }),
        ])
      ),
    },
  }
}
```

**Зачем `@ts-expect-error`** — `getPathname` типизирует `href` как ключ из `pathnames`. Обёртка осознанно расширяет его до `string`, поэтому над каждым вызовом подавляем ошибку типа (то же самое в `sitemap.ts`).

**Зачем `x-default`** — Google использует его как вариант по умолчанию, когда язык пользователя не совпал ни с одной локалью. next-intl proxy тоже отдаёт `x-default` в своём `Link`-заголовке — здесь мы дублируем это на уровне страницы.

Результат для `locale: 'en'`:
```
canonical: https://example.com/about
languages: {
  'x-default': 'https://example.com/about',
  en: 'https://example.com/about',
  ru: 'https://example.com/ru/o-nas',
  uk: 'https://example.com/uk/pro-nas',
}
```

Next.js рендерит это в `<head>` как:
```html
<link rel="canonical" href="https://example.com/about" />
<link rel="alternate" hreflang="x-default" href="https://example.com/about" />
<link rel="alternate" hreflang="en" href="https://example.com/about" />
<link rel="alternate" hreflang="ru" href="https://example.com/ru/o-nas" />
<link rel="alternate" hreflang="uk" href="https://example.com/uk/pro-nas" />
```

**Почему `getPathname`, а не ручная конкатенация** — `getPathname` уважает `pathnames` mapping. Для `/about` с локалью `ru` вернёт `/ru/o-nas`, а не `/ru/about`. Ручная конкатенация `/${locale}/about` дала бы неправильный URL.

Google и Bing используют эти теги для однозначного понимания языковых вариантов одной страницы и правильного распределения PageRank.

## `sitemap.ts`

`src/app/sitemap.ts` генерирует sitemap с `alternates.languages` для каждой страницы:

```ts
import type { MetadataRoute } from 'next'

import { getAllPosts } from '@/entities/post'
import { getPathname } from '@/shared/i18n/navigation'
import { routing } from '@/shared/i18n/routing'

const HOST = 'https://example.com'

const STATIC_PAGES = [
  '/',
  '/about',
  '/blog',
  '/contact',
  '/demo/plurals',
  '/demo/formats',
] as const

function buildEntry(href: string): MetadataRoute.Sitemap[number] {
  return {
    // @ts-expect-error -- href intentionally widened beyond pathnames keys
    url: HOST + getPathname({ locale: routing.defaultLocale, href }),
    alternates: {
      languages: {
        // x-default — вариант для несовпавших языков (defaultLocale).
        'x-default':
          // @ts-expect-error -- href intentionally widened beyond pathnames keys
          HOST + getPathname({ locale: routing.defaultLocale, href }),
        ...Object.fromEntries(
          routing.locales.map((locale) => [
            locale,
            // @ts-expect-error -- href intentionally widened beyond pathnames keys
            HOST + getPathname({ locale, href }),
          ])
        ),
      },
    },
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries = STATIC_PAGES.map(buildEntry)
  const blogEntries = getAllPosts().map((post) => buildEntry(`/blog/${post.slug}`))
  return [...staticEntries, ...blogEntries]
}
```

**Почему `getPathname`, а не ручная конкатенация** — `getPathname` уважает `pathnames` mapping. Для `/about` с локалью `ru` вернёт `/ru/o-nas`, а не `/ru/about`. Ручная конкатенация `/${locale}/about` дала бы неправильный URL.

**Что Next.js генерирует в XML** — каждая запись sitemap с `alternates.languages` превращается в блок с `<xhtml:link rel="alternate">`:

```xml
<url>
  <loc>https://example.com/about</loc>
  <xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/about"/>
  <xhtml:link rel="alternate" hreflang="en" href="https://example.com/about"/>
  <xhtml:link rel="alternate" hreflang="ru" href="https://example.com/ru/o-nas"/>
  <xhtml:link rel="alternate" hreflang="uk" href="https://example.com/uk/pro-nas"/>
</url>
```

Проверить: `/sitemap.xml` в работающем dev server.

## OpenGraph и локализация

OpenGraph теги нужно адаптировать к текущей локали. `og:locale` — текущая локаль в формате BCP 47, `og:locale:alternate` — остальные.

Маппинг locale → BCP 47 код:

| Локаль | og:locale |
|---|---|
| `en` | `en_US` |
| `ru` | `ru_RU` |
| `uk` | `uk_UA` |

Маппинг locale → og:locale вынесен в `src/shared/seo/og-locale.ts`. При добавлении новой локали добавляй запись туда.

Пример использования в `generateMetadata`:

```ts
import { OG_LOCALE } from '@/shared/seo/og-locale'
import { type Locale } from '@/shared/i18n/routing'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'about' })
  const ogLocale = OG_LOCALE[locale as Locale]
  return {
    title: t('seo.title'),
    description: t('seo.description'),
    openGraph: {
      locale: ogLocale,
      alternateLocale: Object.entries(OG_LOCALE)
        .filter(([code]) => code !== locale)
        .map(([, og]) => og),
    },
  }
}
```

## `robots.ts`

`src/app/robots.ts` — единый файл для всего сайта:

```ts
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: 'https://example.com/sitemap.xml',
  }
}
```

**Что специфично для мультиязычного проекта**: ссылаться на один `sitemap.xml`, не создавать отдельные sitemaps по локалям (`/sitemap-ru.xml`, `/sitemap-uk.xml`). Next.js поддерживает только один файл `sitemap.ts` в `app/` — если нужно разбить на части, используй `generateSitemaps()` API, но это оправдано только для очень больших сайтов (тысячи страниц).

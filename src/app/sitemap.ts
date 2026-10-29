import type { MetadataRoute } from 'next'

import { getAllPosts } from '@/entities/post'
import { routing } from '@/shared/i18n/routing'
import { buildLanguageUrls } from '@/shared/seo/alternates'

// Demo routes (/demo/*) are excluded — they're showcase scaffolding and
// carry `noindex` (see buildPageMetadata({ noindex: true })).
const STATIC_PAGES = ['/', '/about', '/blog', '/contact'] as const

/**
 * One <url> per page per locale, each listing the full hreflang set
 * (including itself and x-default) — the shape Google documents for
 * localized sitemaps. Uses the same URLs as the pages' <link rel="alternate">.
 */
function entriesFor(href: string): MetadataRoute.Sitemap {
  const languages = buildLanguageUrls(href)
  return routing.locales.map((locale) => ({
    url: languages[locale],
    alternates: { languages },
  }))
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...STATIC_PAGES.flatMap(entriesFor),
    ...getAllPosts().flatMap((post) => entriesFor(`/blog/${post.slug}`)),
  ]
}

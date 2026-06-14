import type { MetadataRoute } from 'next'

import { getAllPosts } from '@/entities/post'
import { getPathname } from '@/shared/i18n/navigation'
import { routing } from '@/shared/i18n/routing'

const HOST = 'https://example.com'

// Demo/showcase routes (/demo/*) are intentionally excluded — they are
// scaffolding, not indexable content.
const STATIC_PAGES = ['/', '/about', '/blog', '/contact'] as const

function buildEntry(href: string): MetadataRoute.Sitemap[number] {
  return {
    // @ts-expect-error -- href intentionally widened beyond pathnames keys
    url: HOST + getPathname({ locale: routing.defaultLocale, href }),
    alternates: {
      languages: {
        // x-default — fallback variant for unmatched languages (default locale).
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

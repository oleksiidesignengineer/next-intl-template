import type { Metadata } from 'next'

import { getPathname } from '@/shared/i18n/navigation'
import { routing } from '@/shared/i18n/routing'

/**
 * Absolute host used in `<link rel="canonical">` and `<link rel="alternate">`.
 * In a real project, derive this from an env var (e.g. NEXT_PUBLIC_SITE_URL)
 * so it differs between staging and production.
 */
const HOST = 'https://example.com'

/**
 * Build `alternates` for Metadata, with canonical URL and per-locale hreflang.
 *
 * Google ranks pages better when each language variant declares its siblings
 * via `<link rel="alternate" hreflang>` in the page <head>. The sitemap is a
 * supporting signal; the page-level hreflang is the primary one.
 *
 * Pass the canonical internal href ('/about', '/blog/hello-world').
 * The helper resolves the localized URL for each locale via `getPathname`,
 * respecting `pathnames` mapping in routing.ts (so '/about' becomes
 * '/o-nas' on ru, '/pro-nas' on uk).
 */
export function buildLanguageAlternates(
  currentLocale: string,
  href: string
): NonNullable<Metadata['alternates']> {
  return {
    // @ts-expect-error -- href intentionally widened beyond pathnames keys
    canonical: HOST + getPathname({ locale: currentLocale, href }),
    languages: {
      // `x-default` tells Google which variant to show users whose language
      // matches none of the listed locales — point it at the default locale.
      // next-intl's proxy (src/proxy.ts) also emits an x-default entry in its
      // alternateLinks Link header; this mirrors it at the page level.
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

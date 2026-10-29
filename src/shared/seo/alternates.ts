import type { Locale } from 'next-intl'

import { absoluteUrl } from '@/shared/config/site'
import { localizePath } from '@/shared/i18n/navigation'
import { routing } from '@/shared/i18n/routing'

/**
 * Absolute URL of `href` in every locale, plus `x-default` (the variant for
 * users whose language matches none of the locales — the default locale).
 * Shared by page metadata and sitemap.xml so both emit identical hreflang sets.
 *
 * Pass the canonical internal href ('/about', '/blog/hello-world'); the
 * `pathnames` mapping is applied per locale ('/about' → '/ru/o-nas').
 */
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

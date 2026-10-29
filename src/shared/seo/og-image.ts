import type { Locale } from 'next-intl'

export const OG_IMAGE_SIZE = { width: 1200, height: 630 }

/**
 * Path of the localized OG image from src/app/[locale]/opengraph-image.tsx.
 *
 * Why buildPageMetadata references it explicitly: a page that sets its own
 * `openGraph` (for its own og:title) replaces the parent's openGraph object,
 * including the image Next.js would otherwise inherit from the file
 * convention — so nested pages would end up without og:image.
 *
 * Always prefixed, even for the default locale: the proxy matcher skips
 * `opengraph-image` paths (src/proxy.ts), so `as-needed` doesn't redirect
 * /en/opengraph-image to an unprefixed URL.
 */
export function ogImagePath(locale: Locale): string {
  return `/${locale}/opengraph-image`
}

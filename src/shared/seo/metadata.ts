import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'

import { routing } from '@/shared/i18n/routing'

import { buildAlternates } from './alternates'
import { OG_IMAGE_SIZE, ogImagePath } from './og-image'
import { OG_LOCALE } from './og-locale'

type PageMetadataInput = {
  /** Canonical internal href of the page: '/about', '/blog/hello-world'. */
  href: string
  title: string
  description: string
  /** Use `title` as-is instead of applying the layout's `%s | Site` template. */
  absoluteTitle?: boolean
  /** Keep the page out of search results (demo/utility pages). */
  noindex?: boolean
}

/**
 * Per-page Metadata with everything a localized page needs: title,
 * description, canonical + hreflang, and OpenGraph/Twitter tags.
 *
 * Without its own `openGraph` a page gets og:title from the templated <title>
 * ("About | Site") and no og:url, og:locale or og:site_name. With it, Next.js
 * replaces the parent's openGraph object entirely — including the image of
 * the opengraph-image.tsx file convention — so the image is set explicitly
 * (see ./og-image.ts). Hence one helper for every page.
 */
export async function buildPageMetadata({
  href,
  title,
  description,
  absoluteTitle = false,
  noindex = false,
}: PageMetadataInput): Promise<Metadata> {
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
}

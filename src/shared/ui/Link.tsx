import type { ComponentProps } from 'react'

import { Link as I18nLink } from '@/shared/i18n/navigation'
import { toLinkHref } from '@/shared/lib/href'

/**
 * Application-wide Link. Drop-in replacement for next-intl's typed Link.
 *
 * Why a wrapper:
 *   next-intl strictly types `href` against the keys of `pathnames` in
 *   src/shared/i18n/routing.ts. We intentionally keep `pathnames` minimal — it
 *   holds ONLY routes whose URL differs across locales (e.g. /about → /o-nas).
 *   For everything else the URL is identical, so listing it in `pathnames`
 *   would be pure boilerplate just to satisfy the type checker.
 *
 *   This wrapper accepts `href: string` and casts at the boundary. At runtime
 *   next-intl resolves the locale prefix and the localized pathname (if any)
 *   for internal paths — routes outside `pathnames` are passed through.
 *   Query and hash are supported ('/about?tab=1#team'), and anchors,
 *   external URLs and mailto:/tel: links are left as they are; a protocol-
 *   relative '//cdn…' gets https: (next-intl would prefix it with the locale).
 *
 * Trade-off: you lose compile-time protection against typos in href.
 * If you want that protection back for a route, add it to `pathnames`
 * and import the typed Link directly from `@/shared/i18n/navigation`.
 */
type LinkProps = Omit<ComponentProps<typeof I18nLink>, 'href'> & {
  href: string
}

export default function Link({ href, ...rest }: LinkProps) {
  // '/about?tab=1' → { pathname, query } so `pathnames` still applies;
  // anchors, external and mailto: links pass through untouched.
  return <I18nLink href={toLinkHref(href) as never} {...rest} />
}

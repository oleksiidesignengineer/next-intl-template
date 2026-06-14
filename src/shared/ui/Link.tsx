import { Link as I18nLink } from '@/shared/i18n/navigation'
import type { ComponentProps } from 'react'

/**
 * Application-wide Link. Drop-in replacement for next-intl's typed Link.
 *
 * Why a wrapper:
 *   next-intl strictly types `href` against the keys of `pathnames` in
 *   src/shared/i18n/routing.ts. We intentionally keep `pathnames` minimal — it holds
 *   ONLY routes whose URL differs across locales (e.g. /about → /o-nas).
 *   For everything else the URL is identical, so listing it in `pathnames`
 *   would be pure boilerplate just to satisfy the type checker.
 *
 *   This wrapper accepts `href: string` and casts at the boundary. The
 *   runtime behaviour is unchanged — next-intl resolves locale prefix and
 *   localized pathname (if any) for whatever href you pass.
 *
 * Trade-off: you lose compile-time protection against typos in href.
 * If you want that protection back for a route, add it to `pathnames`
 * and import the typed Link directly from `@/shared/i18n/navigation`.
 */
type LinkProps = Omit<ComponentProps<typeof I18nLink>, 'href'> & {
  href: string
}

export default function Link({ href, ...rest }: LinkProps) {
  return <I18nLink href={href as never} {...rest} />
}

import type { Locale } from 'next-intl'
import { createNavigation } from 'next-intl/navigation'

import { splitHref } from '@/shared/lib/href'

import { routing } from './routing'

export const {
  Link,
  redirect,
  permanentRedirect,
  usePathname,
  useRouter,
  getPathname,
} = createNavigation(routing)

/**
 * `getPathname` for any internal href — including routes that are not listed
 * in `pathnames` (see @/shared/ui/Link for why that map is kept minimal).
 * localizePath('ru', '/about') → '/ru/o-nas', localizePath('en', '/blog') → '/blog',
 * localizePath('ru', '/about?tab=1#team') → '/ru/o-nas?tab=1#team'.
 */
export function localizePath(locale: Locale, href: string): string {
  const split = splitHref(href)
  if (typeof split === 'string') {
    // Untyped href: the same deliberate trade-off as in @/shared/ui/Link.
    return getPathname({ locale, href: split as never })
  }
  // getPathname ignores the hash, so it is appended here.
  const { hash, ...rest } = split
  return getPathname({ locale, href: rest as never }) + (hash ? `#${hash}` : '')
}

import { searchParamsToObject } from './search-params'

export type HrefObject = {
  pathname: string
  query?: Record<string, string | string[]>
  hash?: string
}

/**
 * next-intl matches `pathnames` against the pathname only, so an internal
 * href like '/about?tab=1#team' must be split into the object form to get the
 * localized path ('/ru/o-nas?tab=1#team', not '/ru/about?tab=1#team').
 *
 * Only absolute internal paths are split. Everything else — '#anchor',
 * '?page=2', 'details', 'https://…', '//cdn…', 'mailto:…', 'tel:…' — is
 * returned untouched, so next-intl passes it through as it would without
 * this helper.
 */
export function splitHref(href: string): string | HrefObject {
  if (!href.startsWith('/') || href.startsWith('//') || !/[?#]/.test(href)) return href

  const url = new URL(href, 'http://localhost')
  return {
    pathname: url.pathname,
    ...(url.search && { query: searchParamsToObject(url.searchParams) }),
    ...(url.hash && { hash: url.hash.slice(1) }),
  }
}

/**
 * The href the @/shared/ui/Link wrapper passes to next-intl's Link.
 * Like splitHref, plus one guard: next-intl treats a protocol-relative URL
 * ('//cdn.example.com/a') as an internal path and would prefix the locale
 * ('/ru//cdn…'), so it gets an explicit https: scheme.
 */
export function toLinkHref(href: string): string | HrefObject {
  if (href.startsWith('//')) return `https:${href}`
  return splitHref(href)
}

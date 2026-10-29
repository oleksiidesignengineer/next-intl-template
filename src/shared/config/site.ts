/**
 * Canonical origin of the site — the single source for `metadataBase`,
 * canonical/hreflang URLs, sitemap.xml and robots.txt.
 *
 * Set `SITE_URL` (e.g. https://example.com) in every deployed environment.
 * On Vercel the production domain is used when it's unset; locally it falls
 * back to http://localhost:3000. Read at build time for static pages.
 */
function resolveSiteUrl(): URL {
  if (process.env.SITE_URL) return new URL(process.env.SITE_URL)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  }
  return new URL('http://localhost:3000')
}

export const SITE_URL = resolveSiteUrl()

/** Absolute URL for a path on this site: absoluteUrl('/ru/o-nas'). */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString()
}

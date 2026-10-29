import createMiddleware from 'next-intl/middleware'

import { routing } from './shared/i18n/routing'

export default createMiddleware(routing)

export const config = {
  // Run on every page path EXCEPT:
  // - the /api segment (/api, /api/… — but not /apiary), /_next…, /_vercel…;
  // - paths with a dot: /favicon.ico, /sitemap.xml, /robots.txt;
  // - an `opengraph-image` segment at any depth (/en/opengraph-image): served
  //   as-is, so `as-needed` doesn't redirect /en/… away (src/shared/seo/og-image.ts).
  // Excluded paths skip ALL proxy logic — keep that in mind when composing
  // auth or CSP into this file. tests/unit/proxy-matcher.test.ts pins it down.
  matcher: '/((?!api(?:/|$)|_next|_vercel|(?:.*/)?opengraph-image(?:/|$)|.*\\..*).*)',
}

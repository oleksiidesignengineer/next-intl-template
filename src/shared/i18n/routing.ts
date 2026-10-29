import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'ru', 'uk'],
  defaultLocale: 'en',
  // The default locale is served without a prefix (`/about`), the others
  // with one (`/ru/o-nas`). Trade-offs vs 'always': docs/08-pathnames.md.
  localePrefix: 'as-needed',
  // Every UNPREFIXED URL (`/`, `/about`) redirects by NEXT_LOCALE cookie, then
  // Accept-Language: a Russian browser opening /about lands on /ru/o-nas.
  localeDetection: true,
  // NEXT_LOCALE stays a session cookie (next-intl's default). The proxy sets
  // it on document requests whose locale differs from the cookie or from
  // Accept-Language — e.g. an English browser landing on /ru/… from search —
  // so also for visitors who never chose a language, and a long-lived cookie
  // becomes a consent question (GDPR/ePrivacy).
  // To persist the choice across browser restarts, opt in explicitly:
  //   localeCookie: { maxAge: 60 * 60 * 24 * 365 }
  // See docs/13-locale-persistence.md.
  //
  // hreflang is emitted by page metadata and sitemap.xml with the canonical
  // SITE_URL (src/shared/seo). The proxy's `Link` header would duplicate it
  // using the request host, which differs behind reverse proxies/previews.
  alternateLinks: false,
  // Only routes whose URL DIFFERS across locales belong here. Routes with
  // identical URLs work without an entry — next-intl just prefixes the locale.
  // For typed-Link DX with this minimal pathnames map, see @/shared/ui/Link.
  pathnames: {
    '/about': { en: '/about', ru: '/o-nas', uk: '/pro-nas' },
  },
})

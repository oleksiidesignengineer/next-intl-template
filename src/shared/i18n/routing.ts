import { defineRouting } from 'next-intl/routing'

/**
 * Name of the cookie next-intl reads to remember a user's locale choice
 * between visits. Centralized here so server-side code (e.g. Route Handlers
 * that set the cookie programmatically) cannot drift away from what the
 * middleware actually reads.
 */
export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE'

/** Locale cookie expiry (1 year). Shared with the Route Handler — see `LOCALE_COOKIE_NAME`. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Locales that read right-to-left. Empty by default — populate when adding
 * Arabic, Hebrew, Farsi, etc. The list is consulted by `isRtl()` below and
 * surfaces through `<html dir={...}>` in [locale]/layout.tsx, so adding a
 * code here is enough to flip text direction (Tailwind `rtl:` utilities
 * pick up the attribute automatically).
 */
const RTL_LOCALES: ReadonlySet<string> = new Set([])
export const isRtl = (locale: string): boolean => RTL_LOCALES.has(locale)

export const routing = defineRouting({
  locales: ['en', 'ru', 'uk'],
  defaultLocale: 'en',
  localePrefix: 'as-needed',
  localeDetection: true,
  // Cookie attributes used both by the middleware and by /api/locale below.
  // Defaults from next-intl are sensible — we set them explicitly so the
  // contract is visible and `LOCALE_COOKIE_NAME` stays the single source
  // of truth.
  localeCookie: {
    name: LOCALE_COOKIE_NAME,
    maxAge: LOCALE_COOKIE_MAX_AGE,
  },
  // Only routes whose URL DIFFERS across locales belong here. Routes with
  // identical URLs work without an entry — next-intl just prefixes the locale.
  // For typed-Link DX with this minimal pathnames map, see @/shared/ui/Link.
  pathnames: {
    '/about': { en: '/about', ru: '/o-nas', uk: '/pro-nas' },
  },
})

export type Locale = (typeof routing.locales)[number]

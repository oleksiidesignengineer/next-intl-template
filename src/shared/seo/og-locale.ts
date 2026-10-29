import type { Locale } from 'next-intl'

/**
 * Locale codes for OpenGraph metadata (`og:locale`).
 *
 * Facebook/LinkedIn expect `language_TERRITORY` (e.g. `en_US`, `uk_UA`).
 * When adding a locale to routing.ts, add its mapping here — the Record type
 * makes a missing entry a compile error.
 */
export const OG_LOCALE: Record<Locale, string> = {
  en: 'en_US',
  ru: 'ru_RU',
  uk: 'uk_UA',
}

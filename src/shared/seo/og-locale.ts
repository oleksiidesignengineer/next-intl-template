import { type Locale } from '@/shared/i18n/routing'

/**
 * BCP 47 locale codes for use in OpenGraph metadata.
 *
 * Facebook/LinkedIn use `language_TERRITORY` format (e.g. `en_US`, `ru_RU`).
 * When adding a new locale to `routing.ts`, add its BCP 47 mapping here.
 */
export const OG_LOCALE: Record<Locale, string> = {
  en: 'en_US',
  ru: 'ru_RU',
  uk: 'uk_UA',
}

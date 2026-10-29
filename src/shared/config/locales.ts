import type { Locale } from 'next-intl'

import { routing } from '@/shared/i18n/routing'

/**
 * Native language names for each locale, computed via Intl.DisplayNames.
 *
 * Each name is rendered in its OWN language — 'English', 'Русский',
 * 'Українська'. This is the conventional pattern for language switchers
 * (Google, Wikipedia, GitHub): users find their language by reading it in
 * itself, not in the currently-active locale.
 *
 * Replaces flag emojis which:
 *   - are ambiguous (flag ≠ language: 🇬🇧 ≠ English speakers worldwide)
 *   - don't render on parts of Windows (Segoe UI Emoji lacks flags)
 *
 * Computed on the server (SiteHeader passes the names to LangSwitcher as
 * props), so Node's and the browser's ICU data can't disagree at hydration.
 */
function nativeName(locale: string): string {
  const name = new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale
  // Many Cyrillic locales return lowercase ("русский", "українська").
  // Capitalize for selector UI conventions.
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
}

export const LOCALE_NATIVE_NAMES: Record<Locale, string> = Object.fromEntries(
  routing.locales.map((locale) => [locale, nativeName(locale)])
) as Record<Locale, string>

/**
 * Text direction per locale, surfaced as <html dir> in [locale]/layout.tsx —
 * Tailwind `rtl:` variants and logical utilities (`ms-4`, `pe-2`) follow it.
 * A Record, so adding a locale to routing.ts is a type error until its
 * direction is decided here (Arabic, Hebrew, Farsi → 'rtl').
 */
export const TEXT_DIRECTION: Record<Locale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  ru: 'ltr',
  uk: 'ltr',
}

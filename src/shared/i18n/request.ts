import { IntlErrorCode, hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'

import { routing } from './routing'
import type EnMessages from './messages/en.json'

/**
 * Global formats shared across the whole app. Exported so its type can augment
 * `AppConfig['Formats']` in src/global.d.ts — that makes named format strings
 * ('short', 'currency', …) type-checked and autocompleted at every
 * `format.dateTime(date, 'short')` / `t('price', { value })` call site.
 */
export const formats = {
  dateTime: {
    short: { day: 'numeric', month: 'short', year: 'numeric' },
    long: {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  },
  number: {
    currency: { style: 'currency', currency: 'EUR' },
    percent: { style: 'percent', maximumFractionDigits: 1 },
  },
} as const

type Messages = Record<string, unknown>

function isPlainObject(value: unknown): value is Messages {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Deep-merge translation dictionaries: values from `override` win, but any key
 * missing there falls back to `base`. Recurses into nested namespaces so the
 * fallback is PER-KEY, not per-namespace — a shallow `{ ...base, ...override }`
 * would drop sibling keys whenever a namespace is only partially translated.
 */
function deepMerge(base: Messages, override: Messages): Messages {
  const result: Messages = { ...base }
  for (const key of Object.keys(override)) {
    const baseValue = result[key]
    const overrideValue = override[key]
    result[key] =
      isPlainObject(baseValue) && isPlainObject(overrideValue)
        ? deepMerge(baseValue, overrideValue)
        : overrideValue
  }
  return result
}

/**
 * Load messages for `locale`, falling back to the default locale for any key
 * the target locale is missing. So a key present in en.json but absent from
 * ru.json renders its English text on /ru instead of the raw key path.
 *
 * next-intl does NOT perform cross-locale fallback on its own (it loads only
 * the active locale to keep the bundle lean). We opt in here by merging the
 * default-locale dictionary underneath the active one.
 */
async function loadMessages(locale: string): Promise<typeof EnMessages> {
  const localeMessages = (await import(`./messages/${locale}.json`))
    .default as Messages
  if (locale === routing.defaultLocale)
    return localeMessages as typeof EnMessages

  const defaultMessages = (
    await import(`./messages/${routing.defaultLocale}.json`)
  ).default as Messages
  return deepMerge(defaultMessages, localeMessages) as typeof EnMessages
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale

  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: 'Europe/Kyiv',
    now: new Date(),
    formats,
    // Real API misuse goes to console in dev and SHOULD be wired to your
    // error tracker (Sentry, etc.) in production. Missing-message errors
    // are expected during development — they get logged only in dev and
    // surface in the UI via `getMessageFallback` below.
    onError(error) {
      if (error.code !== IntlErrorCode.MISSING_MESSAGE) {
        console.error('[next-intl] API misuse:', error)
        return
      }
      if (process.env.NODE_ENV === 'development') {
        console.warn('[next-intl] Missing translation:', error.message)
      }
    },
    // Reached only when a key is missing in BOTH the active locale and the
    // default-locale fallback (see loadMessages). Dev returns a visible marker
    // so the gap stands out in the UI; prod returns the key path.
    getMessageFallback({ namespace, key }) {
      const path = [namespace, key].filter(Boolean).join('.')
      if (process.env.NODE_ENV === 'development') {
        return `[!${path}]`
      }
      return path
    },
  }
})

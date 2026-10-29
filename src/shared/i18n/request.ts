import { notFound } from 'next/navigation'
import * as rootParams from 'next/root-params'
import { type Formats, IntlErrorCode, hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'

import { routing } from './routing'

/**
 * Global formats shared across the whole app. Exported so its type can augment
 * `AppConfig['Formats']` in src/global.d.ts — that makes named format strings
 * ('short', 'currency', …) type-checked and autocompleted at every
 * `format.dateTime(date, 'short')` call site.
 *
 * A name that matches a built-in ICU style (`short`, `long`, `currency`,
 * `percent`, …) is also applied to that style inside messages (merged with it
 * field by field), e.g.
 * `{date, date, long}` in blog.publishedOn uses `long` below.
 */
export const formats = {
  dateTime: {
    short: { day: 'numeric', month: 'short', year: 'numeric' },
    long: { day: 'numeric', month: 'long', year: 'numeric' },
    withTime: {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      // 'numeric', not '2-digit': "8:30 PM" in en, "20:30" in ru/uk.
      hour: 'numeric',
      minute: '2-digit',
    },
  },
  number: {
    currency: { style: 'currency', currency: 'EUR' },
    percent: { style: 'percent', maximumFractionDigits: 1 },
  },
} satisfies Formats

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
async function loadMessages(locale: string) {
  const messages: Messages = (await import(`./messages/${locale}.json`)).default
  if (locale === routing.defaultLocale) return messages

  const fallback: Messages = (
    await import(`./messages/${routing.defaultLocale}.json`)
  ).default
  return deepMerge(fallback, messages)
}

export default getRequestConfig(async ({ locale }) => {
  // `locale` is an explicit override from the caller — e.g.
  // getTranslations({ locale, namespace }) in a Server Action or Route
  // Handler, where next/root-params is not available (Next.js plans support
  // for Route Handlers only).
  if (!locale) {
    // The value of the [locale] segment of the root layout. Works during
    // static rendering — no setRequestLocale needed in pages/layouts.
    const param = await rootParams.locale()
    if (!hasLocale(routing.locales, param)) notFound()
    locale = param
  }

  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: 'Europe/Kyiv',
    // A shared `now` keeps server-rendered relative times and the client's
    // useNow() consistent during hydration. On statically rendered pages it is
    // the time of the build — useNow({ updateInterval }) refreshes it.
    // Remove it when enabling `cacheComponents`: new Date() during prerender
    // fails the build there. The other steps of that switch are listed in
    // docs/02-app-router.md (Cache Components).
    now: new Date(),
    formats,
    onError(error) {
      if (error.code === IntlErrorCode.MISSING_MESSAGE) {
        // Missing keys are already backfilled from the default locale (see
        // loadMessages), so reaching this means the key is missing in en.json
        // too — a real bug, not an untranslated string.
        console.error('[next-intl] Missing message:', error.message)
        return
      }
      // Wire both branches to your error tracker (Sentry, etc.) in production.
      console.error('[next-intl]', error)
    },
    // Only applies to Server Components: functions can't cross to the client,
    // so Client Components use next-intl's default (`namespace.key`).
    getMessageFallback({ namespace, key }) {
      const path = [namespace, key].filter(Boolean).join('.')
      return process.env.NODE_ENV === 'development' ? `[!${path}]` : path
    },
  }
})

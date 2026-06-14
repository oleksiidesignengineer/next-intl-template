'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useParams, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { usePathname, useRouter } from '@/shared/i18n/navigation'
import { routing, type Locale } from '@/shared/i18n/routing'
import { LOCALE_NATIVE_NAMES } from '@/shared/config/locales'

/**
 * Preserve multi-valued search params (?tag=a&tag=b) by collecting unique
 * keys and reading getAll for each. Plain Object.fromEntries(entries())
 * collapses duplicates to the last value, which silently breaks filter
 * pages on locale switch.
 */
function searchParamsToObject(
  params: URLSearchParams
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    result[key] = values.length === 1 ? values[0] : values
  }
  return result
}

export default function LangSwitcher() {
  const router = useRouter()
  // usePathname from @/shared/i18n/navigation returns the canonical path without
  // the locale prefix and without the localized pathname segment — needed
  // for correct switching when `pathnames` mapping is enabled.
  const pathname = usePathname()
  const params = useParams()
  const current = useLocale()
  const t = useTranslations('common')
  const [pending, startTransition] = useTransition()
  // Preserve query string when switching locale so page state is not lost.
  const searchParams = useSearchParams()

  return (
    <select
      value={current}
      disabled={pending}
      aria-label={t('languageSwitcher')}
      onChange={(event) => {
        const next = event.target.value as Locale
        const query = searchParamsToObject(searchParams)
        startTransition(() => {
          router.replace(
            // @ts-expect-error -- TypeScript validates that only known params
            // are used with a given pathname. Since we're on the current route,
            // they always match at runtime.
            { pathname, params, query },
            { locale: next }
          )
        })
      }}
      className="px-2 py-1 border border-gray-300 rounded text-sm bg-white disabled:opacity-60"
    >
      {routing.locales.map((loc) => (
        <option key={loc} value={loc}>
          {LOCALE_NATIVE_NAMES[loc]}
        </option>
      ))}
    </select>
  )
}

'use client'

import type { Locale } from 'next-intl'
import { useLocale } from 'next-intl'
import { useParams } from 'next/navigation'
import { useTransition } from 'react'

import { usePathname, useRouter } from '@/shared/i18n/navigation'
import { searchParamsToObject } from '@/shared/lib/search-params'

type Props = {
  /** Accessible name of the <select>, translated on the server. */
  label: string
  /** Each language in its own language ('Русский', 'Українська'), computed on the server. */
  options: ReadonlyArray<{ locale: Locale; name: string }>
}

export default function LangSwitcher({ label, options }: Props) {
  const router = useRouter()
  // usePathname from @/shared/i18n/navigation returns the canonical path
  // without the locale prefix and without the localized pathname segment
  // ('/about' on /ru/o-nas) — needed for switching with `pathnames` mapping.
  const pathname = usePathname()
  const params = useParams()
  const current = useLocale()
  const [pending, startTransition] = useTransition()

  return (
    <select
      value={current}
      disabled={pending}
      aria-label={label}
      onChange={(event) => {
        const next = event.target.value as Locale
        // Read the query at the moment of switching instead of via
        // useSearchParams(): that hook would opt the switcher out of static
        // rendering (it'd render only on the client, inside a Suspense boundary).
        // The #hash is not kept: next-intl's router ignores it, and navigating
        // around it would mean re-implementing its cookie sync.
        const query = searchParamsToObject(new URLSearchParams(window.location.search))
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
      {options.map(({ locale, name }) => (
        <option key={locale} value={locale} lang={locale}>
          {name}
        </option>
      ))}
    </select>
  )
}

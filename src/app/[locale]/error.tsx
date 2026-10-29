'use client'

import type { ErrorInfo } from 'next/error'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

// Error boundaries must be Client Components. useTranslations works here
// because [locale]/layout.tsx wraps the tree in NextIntlClientProvider with
// the `error` namespace.
//
// `retry` (stable since Next.js 16.3, was `unstable_retry`) re-fetches AND
// re-renders the segment — the right default for transient errors. `reset`
// only clears the error state. `error` is `unknown`: a Client Component can
// throw any value, not just an Error.
export default function ErrorBoundary({ error, retry }: Pick<ErrorInfo, 'error' | 'retry'>) {
  const t = useTranslations('error')

  useEffect(() => {
    // Wire this to your error tracker (Sentry, etc.) in production.
    console.error(error)
  }, [error])

  return (
    <section
      role="alert"
      className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4"
    >
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-gray-500">{t('description')}</p>
      <button
        type="button"
        onClick={() => retry()}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        {t('tryAgain')}
      </button>
    </section>
  )
}

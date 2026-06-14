'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

type Props = {
  error: Error & { digest?: string }
  // Next.js 16.2+ recovery prop: re-fetches AND re-renders the segment (good
  // for transient errors). The older `reset` only clears error state without
  // re-fetching — Next.js now recommends `unstable_retry` in most cases.
  unstable_retry: () => void
}

export default function ErrorBoundary({ error, unstable_retry }: Props) {
  const t = useTranslations('error')

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <section className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-gray-500">{t('description')}</p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        {t('tryAgain')}
      </button>
    </section>
  )
}

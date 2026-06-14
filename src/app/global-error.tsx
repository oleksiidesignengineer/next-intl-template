'use client'

// Global error boundary. Catches errors thrown in the ROOT layout AND in the
// [locale] layout itself — which [locale]/error.tsx CANNOT catch, because an
// error boundary never wraps the layout of its own segment (e.g. a failed
// getMessages/loadMessages or a corrupt messages file).
//
// When active this file REPLACES the root layout, so it must render its own
// <html>/<body> and cannot use next-intl (NextIntlClientProvider lives below
// it) — hence the hardcoded English copy. Error boundaries must be Client
// Components, and `metadata` is unsupported here. See docs/09-error-pages.md.

import { useEffect } from 'react'

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  // Next.js 16.2+ recovery prop: re-fetches and re-renders the boundary.
  unstable_retry: () => void
}) {
  useEffect(() => {
    // Wire this to your error tracker (Sentry, etc.) in production.
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
        }}
      >
        <main style={{ textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '2rem', margin: 0 }}>Something went wrong</h1>
          <p style={{ color: '#4b5563' }}>
            An unexpected error occurred. Please try again.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              background: '#2563eb',
              color: '#fff',
              border: 0,
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}

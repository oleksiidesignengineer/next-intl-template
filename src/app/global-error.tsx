'use client'

// Global error boundary. Catches errors thrown while rendering the root
// layout — [locale]/layout.tsx, including SiteHeader and the client parts in
// it — which [locale]/error.tsx CANNOT catch, because an error boundary never
// wraps the layout of its own segment. (Pages are static: an error there at
// build time fails `next build` instead; this covers request-time renders and
// client-side errors in the layout.)
//
// When active this file REPLACES the root layout, so it must render its own
// <html>/<body> and cannot use next-intl (NextIntlClientProvider lives below
// it) — hence the hardcoded English copy. Error boundaries must be Client
// Components, and `metadata` is unsupported here. See docs/09-error-pages.md.

import type { ErrorInfo } from 'next/error'
import { useEffect } from 'react'

// `retry` is stable since Next.js 16.3 (was `unstable_retry`).
export default function GlobalError({ error, retry }: Pick<ErrorInfo, 'error' | 'retry'>) {
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
            onClick={() => retry()}
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

import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * 404 for requests that match no route at all — e.g. /unknown.txt, which the
 * proxy matcher skips (src/proxy.ts), so it never gets a locale.
 *
 * Why global-not-found (experimental.globalNotFound in next.config.ts): the
 * root layout is [locale]/layout.tsx (there's no src/app/layout.tsx, so that
 * next/root-params can read [locale]). Without a root layout above it, a
 * src/app/not-found.tsx that renders its own <html> ends up nested in Next's
 * default <html><body> and fails hydration in dev. global-not-found replaces
 * the layout instead, so it owns <html>/<body> — and `metadata` works here.
 *
 * No locale, no translations: the copy is plain English.
 */
export const metadata: Metadata = {
  title: 'Page not found',
  description: 'The page you are looking for does not exist.',
}

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
        }}
      >
        <main style={{ textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '4rem', margin: 0, color: '#6b7280' }}>404</h1>
          <p style={{ fontSize: '1.125rem', color: '#4b5563' }}>Page not found</p>
          <p>
            {/* next/link, not the i18n Link: there is no locale here, and the
                proxy redirects / to the visitor's preferred locale. */}
            <Link href="/" style={{ color: '#2563eb', textDecoration: 'underline' }}>
              Go home
            </Link>
          </p>
        </main>
      </body>
    </html>
  )
}

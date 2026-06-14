import Link from 'next/link'

/**
 * Standard root not-found (src/app/not-found.tsx) — the fallback for URLs that
 * don't match any route under [locale]. This is the built-in Next.js root
 * not-found convention, NOT the experimental `global-not-found.js` (which needs
 * `experimental.globalNotFound` and is only worth it for multiple root layouts
 * — not used here).
 *
 * Why this file exists alongside [locale]/not-found.tsx:
 *   - [locale]/not-found.tsx ONLY fires when `notFound()` is explicitly called
 *     from a page inside [locale] (e.g. blog/[slug]/page.tsx when the slug
 *     is unknown).
 *   - Routes that don't match any page at all (e.g. /ru/foobar) bypass the
 *     [locale] segment entirely and Next.js renders THIS file instead.
 *
 * This component renders OUTSIDE any locale context — `useTranslations`
 * is unavailable. We use plain English fallback text and a link to "/",
 * which the proxy will redirect to the user's preferred locale.
 *
 * Provides its own <html>/<body> because the root layout (src/app/layout.tsx)
 * intentionally returns only `{children}` to delegate <html> to the locale
 * layout.
 */
export default function RootNotFound() {
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
        <main
          style={{
            textAlign: 'center',
            padding: '2rem',
          }}
        >
          <h1 style={{ fontSize: '4rem', margin: 0, color: '#9ca3af' }}>404</h1>
          <p style={{ fontSize: '1.125rem', color: '#4b5563' }}>
            Page not found
          </p>
          <p>
            <Link
              href="/"
              style={{ color: '#2563eb', textDecoration: 'underline' }}
            >
              Go home
            </Link>
          </p>
        </main>
      </body>
    </html>
  )
}

import Link from 'next/link'

/**
 * 404 when request.ts calls notFound() for an unknown [locale] value outside
 * the proxy — e.g. /api/foo: the matcher skips /api, so `api` reaches the
 * [locale] segment. (Unknown URLs inside a locale get the localized
 * [locale]/not-found.tsx; URLs matching no route get global-not-found.tsx.)
 *
 * Next.js renders this inside its default <html><body> (there is no root
 * layout above it), so it must NOT render <html>/<body> itself — a nested
 * <html> fails hydration. The default <html> has no `lang`, and a `metadata`
 * export isn't applied here; React hoists the <title> below into <head>.
 */
export default function RootNotFound() {
  return (
    <main
      style={{
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        textAlign: 'center',
        padding: '4rem 2rem',
      }}
    >
      <title>Page not found</title>
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
  )
}

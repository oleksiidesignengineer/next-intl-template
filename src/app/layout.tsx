// Root layout intentionally returns only `{children}` (no <html>/<body>).
// Per-locale <html lang={locale}> lives in `[locale]/layout.tsx` so that
// the document language matches the active locale. Next.js requires a root
// layout to exist — this one delegates everything to the locale layout.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}

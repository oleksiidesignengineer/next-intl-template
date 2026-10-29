import { notFound } from 'next/navigation'

// Next.js renders [locale]/not-found.tsx only when a route calls notFound().
// This catch-all turns every unknown URL inside a locale (/ru/foo) into such a
// call, so it gets the localized 404 with header and <html lang> instead of
// the English root fallback.
export default function CatchAllPage() {
  notFound()
}

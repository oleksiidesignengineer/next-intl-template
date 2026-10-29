import { useTranslations } from 'next-intl'

import Link from '@/shared/ui/Link'

/**
 * Localized 404 inside [locale]: rendered for notFound() from pages of this
 * segment and, via [...rest]/page.tsx, for every unknown URL inside a locale:
 * /ru/foo, and also /ru/blog/unknown-slug — dynamicParams = false in the layout
 * closes the blog/[slug] route, so such a URL falls through to [...rest].
 *
 * A Server Component: next-intl's useTranslations works in non-async Server
 * Components too, so the `notFound` namespace never ships to the client.
 *
 * The tab title stays the site name from the layout: a segment not-found
 * can't export metadata (only the root one can), and a <title> rendered here
 * would be a second <title> in <head>. The page is noindex anyway.
 */
export default function NotFound() {
  const t = useTranslations('notFound')
  return (
    <section className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="text-8xl font-bold text-gray-500">404</div>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-gray-500">{t('description')}</p>
      <Link href="/" className="text-blue-600 hover:underline">
        {t('home')}
      </Link>
    </section>
  )
}

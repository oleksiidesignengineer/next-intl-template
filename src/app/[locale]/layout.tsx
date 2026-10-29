import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { getLocale, getTranslations } from 'next-intl/server'
import { Toaster } from 'sonner'

import { TEXT_DIRECTION } from '@/shared/config/locales'
import { SITE_URL } from '@/shared/config/site'
import { ClientMessages } from '@/shared/i18n/ClientMessages'
import { routing } from '@/shared/i18n/routing'
import { SiteHeader } from '@/widgets/site-header'

import '@/shared/styles/globals.css'

const geist = Geist({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-geist-sans',
})

// Pre-render every locale at build time. With next/root-params this is all
// static rendering needs — no setRequestLocale in layouts or pages.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

// The set of locales — and, inherited, of blog slugs — is closed: unknown
// values are a 404 instead of an on-demand render cached per URL.
// `false` in ANY segment closes the whole route, so a project with params from
// a CMS removes this line (a nested `dynamicParams = true` doesn't reopen it);
// notFound() in request.ts and the pages then keeps unknown values out. Also
// remove it when enabling cacheComponents (not supported there).
export const dynamicParams = false

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site')
  return {
    // Resolves relative URLs in metadata (e.g. og:image, see
    // src/shared/seo/og-image.ts) against the canonical origin, not the request host.
    metadataBase: SITE_URL,
    title: { default: t('name'), template: `%s | ${t('name')}` },
    description: t('description'),
  }
}

export default async function LocaleLayout({ children }: LayoutProps<'/[locale]'>) {
  // This is the ROOT layout (there is no src/app/layout.tsx), so [locale] is a
  // root param: the locale comes from next/root-params via request.ts. An
  // unknown value only gets here for paths the proxy skips (/api/x →
  // src/app/not-found.tsx) — the proxy treats /xx/about as an unprefixed path.
  const locale = await getLocale()
  const t = await getTranslations('common')

  return (
    <html lang={locale} dir={TEXT_DIRECTION[locale]} className={geist.variable}>
      <body className="min-h-screen flex flex-col antialiased">
        {/* Client Components of the whole tree get ONLY `error` (for
            [locale]/error.tsx). Page islands get their namespaces from a
            <ClientMessages> on their page (see contact/page.tsx). */}
        <ClientMessages namespaces={['error']}>
          <SiteHeader />
          <main className="flex-1 container mx-auto px-4 py-8">{children}</main>
          {/* Text direction is read from <html dir> by sonner itself. */}
          <Toaster position="top-right" richColors containerAriaLabel={t('notifications')} />
        </ClientMessages>
      </body>
    </html>
  )
}

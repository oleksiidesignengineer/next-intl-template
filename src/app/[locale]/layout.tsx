import { NextIntlClientProvider, hasLocale } from 'next-intl'
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server'
import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { notFound } from 'next/navigation'
import { Toaster } from 'sonner'

import { type Locale, isRtl, routing } from '@/shared/i18n/routing'
import { OG_LOCALE } from '@/shared/seo/og-locale'
import { SiteHeader } from '@/widgets/site-header'

import '@/shared/styles/globals.css'

const geist = Geist({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-geist-sans',
})

type Props = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

// Pre-render all locales at build time
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  const t = await getTranslations({ locale, namespace: 'home' })
  const ogLocale = OG_LOCALE[locale as Locale]
  return {
    title: {
      default: t('seo.title'),
      template: `%s | ${t('seo.title')}`,
    },
    description: t('seo.description'),
    openGraph: {
      type: 'website',
      locale: ogLocale,
      alternateLocale: Object.entries(OG_LOCALE)
        .filter(([code]) => code !== locale)
        .map(([, og]) => og),
      title: t('seo.title'),
      description: t('seo.description'),
    },
    twitter: {
      card: 'summary_large_image',
      title: t('seo.title'),
      description: t('seo.description'),
    },
  }
}

/**
 * Namespaces that any Client Component in the app might reference. Without
 * this filter, the FULL messages bundle ships to the client on every page
 * — fine for a small template, but rapidly becomes a real performance cost
 * (50-200KB extra JS) as the dictionary grows. See docs/03-translations.md.
 *
 * When adding a new Client Component that uses translations, add its
 * namespace here.
 */
const CLIENT_NAMESPACES = [
  'common',
  'notFound',
  'error',
  'plurals',
  'formats',
  'contact',
] as const

type Messages = Record<string, unknown>

function pickNamespaces(messages: Messages, keys: readonly string[]): Messages {
  const result: Messages = {}
  for (const key of keys) {
    if (key in messages) result[key] = messages[key]
  }
  return result
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params

  // 1. Validate locale — unknown locales return 404
  if (!hasLocale(routing.locales, locale)) notFound()

  // 2. Enable static rendering. setRequestLocale puts the locale into
  // next-intl's request-scoped store (React cache()) and is REQUIRED in every
  // server page/layout under [locale]. Next.js 16 ships next/root-params, but
  // it solves a different problem and does NOT replace this call.
  setRequestLocale(locale)

  const allMessages = (await getMessages()) as Messages
  const clientMessages = pickNamespaces(allMessages, CLIENT_NAMESPACES)

  return (
    <html
      lang={locale}
      dir={isRtl(locale) ? 'rtl' : 'ltr'}
      className={geist.variable}
    >
      <body className="min-h-screen flex flex-col antialiased">
        <NextIntlClientProvider messages={clientMessages}>
          <SiteHeader />
          <main className="flex-1 container mx-auto px-4 py-8">{children}</main>
          <Toaster position="top-right" richColors />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}

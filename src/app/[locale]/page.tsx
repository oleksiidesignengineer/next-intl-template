import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Metadata } from 'next'

import { type Locale } from '@/shared/i18n/routing'
import { buildLanguageAlternates } from '@/shared/seo/alternates'
import Link from '@/shared/ui/Link'

type Props = { params: Promise<{ locale: Locale }> }

// Only `alternates` here — title/description are inherited from the locale
// layout's generateMetadata (its title.default/template). This adds the
// self-referencing canonical + hreflang the home page would otherwise lack.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  return {
    alternates: buildLanguageAlternates(locale, '/'),
  }
}

export default async function Home({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('home')

  return (
    <section className="space-y-6">
      <h1 className="text-4xl font-bold">{t('title')}</h1>
      <p className="text-lg text-gray-600">{t('description')}</p>
      <ul className="space-y-2">
        <li>
          <Link href="/about" className="text-blue-600 hover:underline">
            {t('links.about')}
          </Link>
        </li>
        <li>
          <Link href="/demo/plurals" className="text-blue-600 hover:underline">
            {t('links.plurals')}
          </Link>
        </li>
        <li>
          <Link href="/demo/formats" className="text-blue-600 hover:underline">
            {t('links.formats')}
          </Link>
        </li>
      </ul>
    </section>
  )
}

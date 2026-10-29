import { getTranslations } from 'next-intl/server'

import { buildPageMetadata } from '@/shared/seo/metadata'
import Link from '@/shared/ui/Link'

export async function generateMetadata() {
  const t = await getTranslations('site')
  return buildPageMetadata({
    href: '/',
    title: t('name'),
    description: t('description'),
    absoluteTitle: true,
  })
}

export default async function Home() {
  // No params and no setRequestLocale: getTranslations reads the locale from
  // next/root-params (src/shared/i18n/request.ts), and the page stays static.
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
        <li>
          <Link href="/demo/errors" className="text-blue-600 hover:underline">
            {t('links.errors')}
          </Link>
        </li>
      </ul>
    </section>
  )
}

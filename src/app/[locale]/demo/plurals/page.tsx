import { getTranslations } from 'next-intl/server'

import { ClientMessages } from '@/shared/i18n/ClientMessages'
import { buildPageMetadata } from '@/shared/seo/metadata'

import { PluralsPlayground } from './_components/PluralsPlayground'

export async function generateMetadata() {
  const t = await getTranslations('plurals')
  return buildPageMetadata({
    href: '/demo/plurals',
    title: t('title'),
    description: t('intro'),
    noindex: true,
  })
}

export default async function PluralsDemoPage() {
  const t = await getTranslations('plurals')

  return (
    <section className="space-y-8 max-w-2xl">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-gray-600">{t('intro')}</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t('interactive')}</h2>
        <ClientMessages namespaces={['plurals']}>
          <PluralsPlayground />
        </ClientMessages>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('server')}</h2>
        <ul className="space-y-3 text-lg">
          <li>
            <span className="text-xs text-gray-500 block">selectordinal</span>
            {[1, 2, 3, 4, 11, 22].map((step) => t('step', { step })).join(' · ')}
          </li>
          <li>
            <span className="text-xs text-gray-500 block">number skeleton + plural</span>
            {[1, 1500, 1_200_000].map((count) => t('downloads', { count })).join(' · ')}
          </li>
        </ul>
      </section>
    </section>
  )
}

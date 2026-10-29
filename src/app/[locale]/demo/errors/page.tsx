import { getTranslations } from 'next-intl/server'

import { buildPageMetadata } from '@/shared/seo/metadata'

import { ErrorTrigger } from './_components/ErrorTrigger'

export async function generateMetadata() {
  const t = await getTranslations('errorsDemo')
  return buildPageMetadata({
    href: '/demo/errors',
    title: t('title'),
    description: t('intro'),
    noindex: true,
  })
}

export default async function ErrorsDemoPage() {
  const t = await getTranslations('errorsDemo')

  return (
    <section className="space-y-6 max-w-2xl">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-gray-600">{t('intro')}</p>
      </header>
      {/* The label is translated here, so the island needs no client messages. */}
      <ErrorTrigger label={t('trigger')} />
    </section>
  )
}

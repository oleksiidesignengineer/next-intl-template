import { getLocale, getTranslations } from 'next-intl/server'

import { buildPageMetadata } from '@/shared/seo/metadata'

export async function generateMetadata() {
  const t = await getTranslations('about')
  return buildPageMetadata({
    href: '/about',
    title: t('seo.title'),
    description: t('seo.description'),
  })
}

export default async function AboutPage() {
  const locale = await getLocale()
  const t = await getTranslations('about')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: t('title'),
    description: t('body'),
    inLanguage: locale,
  }

  return (
    <article className="max-w-2xl">
      {/* JSON-LD: tells search engines this is an AboutPage in the active locale. */}
      <script
        type="application/ld+json"
        // Escape `<` so a `</script>` inside any string value (e.g. a future
        // CMS-sourced translation) can't break out of the JSON-LD block.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
      <p className="text-gray-700">{t('body')}</p>
    </article>
  )
}

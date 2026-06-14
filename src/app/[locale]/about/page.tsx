import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Metadata } from 'next'

import { type Locale } from '@/shared/i18n/routing'
import { buildLanguageAlternates } from '@/shared/seo/alternates'

type Props = { params: Promise<{ locale: Locale }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'about' })
  return {
    title: t('seo.title'),
    description: t('seo.description'),
    alternates: buildLanguageAlternates(locale, '/about'),
  }
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params
  // setRequestLocale is required in every server page/layout under [locale]
  // for SSG. Not needed in generateMetadata above — there the locale is
  // already passed explicitly to getTranslations({ locale, namespace }).
  setRequestLocale(locale)
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
        // Escape `</` to prevent `</script>` in any string value from breaking out
        // of the JSON-LD block. Defense in depth — current translations are safe,
        // but a future CMS-sourced string could contain it.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
      <p className="text-gray-700">{t('body')}</p>
    </article>
  )
}

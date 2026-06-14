import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Metadata } from 'next'

import { type Locale } from '@/shared/i18n/routing'
import { buildLanguageAlternates } from '@/shared/seo/alternates'
import { ContactForm } from '@/features/contact'

type Props = { params: Promise<{ locale: Locale }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'contact' })
  return { title: t('title'), description: t('intro'), alternates: buildLanguageAlternates(locale, '/contact') }
}

export default async function ContactPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('contact')

  return (
    <section className="space-y-6 max-w-xl">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-gray-600">{t('intro')}</p>
      </header>

      <ContactForm />
    </section>
  )
}

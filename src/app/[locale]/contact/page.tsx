import { getLocale, getTranslations } from 'next-intl/server'

import { ContactForm, submitContact } from '@/features/contact'
import { ClientMessages } from '@/shared/i18n/ClientMessages'
import { buildPageMetadata } from '@/shared/seo/metadata'

export async function generateMetadata() {
  const t = await getTranslations('contact')
  return buildPageMetadata({ href: '/contact', title: t('title'), description: t('intro') })
}

export default async function ContactPage() {
  const locale = await getLocale()
  const t = await getTranslations('contact')

  return (
    <section className="space-y-6 max-w-xl">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-gray-600">{t('intro')}</p>
      </header>

      {/* Only this page ships `contactForm` — the form's own namespace — to
          the client. `contact` (title, intro, errors) stays on the server:
          the action returns already translated error strings. */}
      <ClientMessages namespaces={['contactForm']}>
        {/* Server Actions can't read next/root-params, so the locale is bound
            here, on the server, and the action translates its errors with it. */}
        <ContactForm action={submitContact.bind(null, locale)} />
      </ClientMessages>
    </section>
  )
}

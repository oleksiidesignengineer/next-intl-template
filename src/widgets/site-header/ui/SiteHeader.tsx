import { getTranslations } from 'next-intl/server'

import { LangSwitcher } from '@/features/locale-switch'
import { LOCALE_NATIVE_NAMES } from '@/shared/config/locales'
import { routing } from '@/shared/i18n/routing'
import Link from '@/shared/ui/Link'

const NAV_ITEMS = [
  { href: '/', key: 'home' },
  { href: '/about', key: 'about' },
  { href: '/blog', key: 'blog' },
  { href: '/contact', key: 'contact' },
  { href: '/demo/plurals', key: 'plurals' },
  { href: '/demo/formats', key: 'formats' },
] as const

export default async function SiteHeader() {
  const t = await getTranslations('header')
  const tCommon = await getTranslations('common')

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <nav aria-label={t('navLabel')} className="flex flex-wrap items-center gap-4 text-sm">
          {NAV_ITEMS.map(({ href, key }) => (
            <Link key={href} href={href} className="hover:underline">
              {t(key)}
            </Link>
          ))}
        </nav>
        {/* Labels are passed from the server: the switcher needs no messages on
            the client, and native names are computed once, by the server's ICU. */}
        <LangSwitcher
          label={tCommon('languageSwitcher')}
          options={routing.locales.map((locale) => ({
            locale,
            name: LOCALE_NATIVE_NAMES[locale],
          }))}
        />
      </div>
    </header>
  )
}

import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'

import Link from '@/shared/ui/Link'

import { LangSwitcher } from '@/features/locale-switch'

export default async function SiteHeader() {
  const t = await getTranslations('header')

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <nav aria-label={t('navLabel')} className="flex items-center gap-4 text-sm">
          <Link href="/" className="hover:underline">
            {t('home')}
          </Link>
          <Link href="/about" className="hover:underline">
            {t('about')}
          </Link>
          <Link href="/blog" className="hover:underline">
            {t('blog')}
          </Link>
          <Link href="/contact" className="hover:underline">
            {t('contact')}
          </Link>
          <Link href="/demo/plurals" className="hover:underline">
            {t('plurals')}
          </Link>
          <Link href="/demo/formats" className="hover:underline">
            {t('formats')}
          </Link>
        </nav>
        {/* LangSwitcher uses useSearchParams — must be inside Suspense for SSG */}
        <Suspense fallback={null}>
          <LangSwitcher />
        </Suspense>
      </div>
    </header>
  )
}

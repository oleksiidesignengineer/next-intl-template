'use client'

// 'use client' is required: useTranslations is a client-only hook,
// and not-found.tsx cannot remain a Server Component when it uses it.

import { useTranslations } from 'next-intl'

import Link from '@/shared/ui/Link'

export default function NotFound() {
  const t = useTranslations('notFound')
  return (
    <section className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="text-8xl font-bold text-gray-200">404</div>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-gray-500">{t('description')}</p>
      <Link href="/" className="text-blue-600 hover:underline">
        {t('home')}
      </Link>
    </section>
  )
}

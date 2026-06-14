import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Metadata } from 'next'

import { type Locale } from '@/shared/i18n/routing'
import { getAllPosts } from '@/entities/post'
import { buildLanguageAlternates } from '@/shared/seo/alternates'
import Link from '@/shared/ui/Link'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale: locale as Locale, namespace: 'blog' })
  return {
    title: t('title'),
    description: t('intro'),
    alternates: buildLanguageAlternates(locale, '/blog'),
  }
}

export default async function BlogIndexPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale as Locale)

  const t = await getTranslations('blog')
  const posts = getAllPosts()

  if (posts.length === 0) {
    return <p className="text-gray-500">{t('noResults')}</p>
  }

  return (
    <section className="space-y-6 max-w-2xl">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-gray-600">{t('intro')}</p>
      </header>

      <ul className="space-y-6">
        {posts.map((post) => {
          const translation = post.translations[locale as Locale]
          return (
            <li key={post.slug} className="border-b border-gray-200 pb-6">
              <p className="text-xs text-gray-500 mb-1">
                {t('publishedOn', { date: new Date(post.publishedAt) })}
              </p>
              <h2 className="text-xl font-semibold">
                <Link
                  href={`/blog/${post.slug}`}
                  className="text-blue-600 hover:underline"
                >
                  {translation.title}
                </Link>
              </h2>
              <p className="text-gray-700 mt-1">{translation.excerpt}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

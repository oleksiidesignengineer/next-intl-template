import { getLocale, getTranslations } from 'next-intl/server'

import { getAllPosts } from '@/entities/post'
import { buildPageMetadata } from '@/shared/seo/metadata'
import Link from '@/shared/ui/Link'

export async function generateMetadata() {
  const t = await getTranslations('blog')
  return buildPageMetadata({ href: '/blog', title: t('title'), description: t('intro') })
}

export default async function BlogIndexPage() {
  const locale = await getLocale()
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
          const translation = post.translations[locale]
          return (
            <li key={post.slug} className="border-b border-gray-200 pb-6">
              <p className="text-xs text-gray-500 mb-1">
                {t('publishedOn', { date: new Date(post.publishedAt) })}
              </p>
              <h2 className="text-xl font-semibold">
                <Link href={`/blog/${post.slug}`} className="text-blue-600 hover:underline">
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

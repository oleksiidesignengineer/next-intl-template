import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getAllPosts, getPostBySlug } from '@/entities/post'
import { type Locale, routing } from '@/shared/i18n/routing'
import { buildLanguageAlternates } from '@/shared/seo/alternates'
import Link from '@/shared/ui/Link'

type Props = {
  params: Promise<{ locale: string; slug: string }>
}

// Pre-render every (locale × slug) at build time.
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    getAllPosts().map((post) => ({ locale, slug: post.slug }))
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return {}

  const translation = post.translations[locale as Locale]
  return {
    title: translation.title,
    description: translation.excerpt,
    alternates: buildLanguageAlternates(locale, `/blog/${slug}`),
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { locale, slug } = await params
  setRequestLocale(locale as Locale)

  const post = getPostBySlug(slug)
  if (!post) notFound()

  const t = await getTranslations('blog')
  const translation = post.translations[locale as Locale]

  return (
    <article className="max-w-2xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs text-gray-500">
          {t('publishedOn', { date: new Date(post.publishedAt) })}
        </p>
        <h1 className="text-3xl font-bold">{translation.title}</h1>
        <p className="text-lg text-gray-600">{translation.excerpt}</p>
      </header>

      {translation.body.split('\n\n').map((paragraph, idx) => (
        <p key={idx} className="text-gray-800 whitespace-pre-line">
          {paragraph}
        </p>
      ))}

      <p>
        <Link href="/blog" className="text-blue-600 hover:underline">
          ← {t('title')}
        </Link>
      </p>
    </article>
  )
}

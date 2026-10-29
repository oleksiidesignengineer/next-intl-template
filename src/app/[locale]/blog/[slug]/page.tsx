import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'

import { getAllPosts, getPostBySlug } from '@/entities/post'
import { buildPageMetadata } from '@/shared/seo/metadata'
import Link from '@/shared/ui/Link'

type Props = PageProps<'/[locale]/blog/[slug]'>

// Every (locale × slug) pair is pre-rendered: the locale values come from
// [locale]/layout.tsx's generateStaticParams, the slugs from here.
export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return {}

  const translation = post.translations[await getLocale()]
  return buildPageMetadata({
    href: `/blog/${slug}`,
    title: translation.title,
    description: translation.excerpt,
  })
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  const locale = await getLocale()
  const t = await getTranslations('blog')
  const translation = post.translations[locale]

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
          {/* Decorative arrow: mirrored in RTL, kept out of the link's name. */}
          <span aria-hidden className="inline-block rtl:-scale-x-100">
            ←
          </span>{' '}
          {t('title')}
        </Link>
      </p>
    </article>
  )
}

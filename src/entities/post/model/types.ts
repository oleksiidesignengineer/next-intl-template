import type { Locale } from 'next-intl'

export type BlogPostTranslation = {
  title: string
  excerpt: string
  body: string
}

export type BlogPost = {
  slug: string
  publishedAt: string // ISO date string
  translations: Record<Locale, BlogPostTranslation>
}

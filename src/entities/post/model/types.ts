import { type Locale } from '@/shared/i18n/routing'

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

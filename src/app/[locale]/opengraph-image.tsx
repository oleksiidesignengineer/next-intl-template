import { notFound } from 'next/navigation'
import { ImageResponse } from 'next/og'
import { hasLocale } from 'next-intl'
import { getTranslations } from 'next-intl/server'

import { routing } from '@/shared/i18n/routing'
import { OG_IMAGE_SIZE } from '@/shared/seo/og-image'

/**
 * One localized OpenGraph image per locale — /en/opengraph-image, … —
 * pre-rendered at build time (the font is fetched then, not per request).
 * buildPageMetadata points every page's og:image (with a translated alt) at
 * the image of its locale; see src/shared/seo/og-image.ts for why.
 *
 * Metadata image routes behave like Route Handlers: next/root-params is not
 * available here, so the locale comes from `params` and is passed explicitly.
 */
export const size = OG_IMAGE_SIZE
export const contentType = 'image/png'

// Only the known locales; anything else is a 404 without rendering or caching.
// (Remove `dynamicParams` if you enable cacheComponents — it isn't supported
// there; the notFound() below keeps unknown locales out.)
export const dynamicParams = false
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()

  const t = await getTranslations({ locale, namespace: 'site' })
  const title = t('name')
  const description = t('description')

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: '#0f172a',
          color: '#f8fafc',
          fontFamily: 'Geist',
        }}
      >
        <div style={{ fontSize: 72, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 36, marginTop: 24, color: '#cbd5e1' }}>{description}</div>
      </div>
    ),
    {
      ...OG_IMAGE_SIZE,
      // next/og's built-in font is Geist Regular (400). A 600 weight needs the
      // font file; so does a script Geist lacks (Arabic, Hebrew, CJK) — use a
      // family that has it, e.g. 'Noto+Sans+Arabic', or the build fails here.
      fonts: [
        {
          name: 'Geist',
          data: await loadGoogleFont('Geist:wght@600', title + description),
          weight: 600,
        },
      ],
    }
  )
}

/**
 * TTF subset with just the glyphs of `text` (Vercel's documented pattern).
 * Runs at build time, like next/font/google — the build needs network access.
 * Google Fonts answers 400 when the family lacks glyphs of `text`.
 * Alternatively, commit a .ttf and read it with fs.readFile.
 * With cacheComponents enabled, mark this function 'use cache'.
 */
async function loadGoogleFont(family: string, text: string): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`
  const css = await fetch(url).then((res) => (res.ok ? res.text() : ''))
  const source = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1]
  const font = source ? await fetch(source) : undefined
  if (!font?.ok) throw new Error(`Failed to load font ${family} for the OpenGraph image`)
  return font.arrayBuffer()
}

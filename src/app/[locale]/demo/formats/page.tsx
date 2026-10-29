import { getFormatter, getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { buildPageMetadata } from '@/shared/seo/metadata'

import { LiveRelativeTime } from './_components/LiveRelativeTime'

const SAMPLE_DATE = new Date('2026-03-15T18:30:00Z')
const SAMPLE_RANGE_END = new Date('2026-03-22T18:30:00Z')

export async function generateMetadata() {
  const t = await getTranslations('formats')
  return buildPageMetadata({
    href: '/demo/formats',
    title: t('title'),
    description: t('intro'),
    noindex: true,
  })
}

export default async function FormatsDemoPage() {
  const t = await getTranslations('formats')
  // Server-side formatter: same named formats as useFormatter() on the client.
  const format = await getFormatter()

  const rows = [
    [t('date'), format.dateTime(SAMPLE_DATE, 'short')],
    [t('dateLong'), format.dateTime(SAMPLE_DATE, 'long')],
    [t('dateWithTime'), format.dateTime(SAMPLE_DATE, 'withTime')],
    [t('dateRange'), format.dateTimeRange(SAMPLE_DATE, SAMPLE_RANGE_END, 'short')],
    // An explicit reference date keeps static output stable. Against `now`
    // it would be frozen at build time on this statically rendered page.
    [t('relative'), format.relativeTime(SAMPLE_DATE, SAMPLE_RANGE_END)],
    [t('number'), format.number(1234567.89)],
    [t('compact'), format.number(1234567.89, { notation: 'compact' })],
    [t('currency'), format.number(99.95, 'currency')],
    [t('percent'), format.number(0.872, 'percent')],
    [t('list'), format.list(['Apple', 'Pear', 'Orange'], { type: 'conjunction' })],
  ] as const

  return (
    <section className="space-y-6 max-w-2xl">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-gray-600">{t('intro')}</p>
      </header>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-gray-500">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <dt className="text-gray-500">{t('live')}</dt>
        <dd>
          {/* Reads the current time: with cacheComponents it must be inside
              <Suspense>, so it streams instead of being frozen at build time. */}
          <Suspense fallback={null}>
            <LiveRelativeTime date={SAMPLE_DATE} />
          </Suspense>
        </dd>
      </dl>
    </section>
  )
}

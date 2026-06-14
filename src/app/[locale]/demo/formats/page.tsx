'use client'

import { useFormatter, useNow, useTranslations } from 'next-intl'

const SAMPLE_DATE = new Date('2026-03-15T18:30:00Z')

export default function FormatsDemoPage() {
  const t = useTranslations('formats')
  const format = useFormatter()
  const now = useNow({ updateInterval: 1000 })

  return (
    <section className="space-y-6 max-w-2xl">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-gray-600">{t('intro')}</p>
      </header>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3">
        <dt className="text-gray-500">{t('date')}</dt>
        <dd>{format.dateTime(SAMPLE_DATE, 'short')}</dd>

        <dt className="text-gray-500">{t('dateLong')}</dt>
        <dd>{format.dateTime(SAMPLE_DATE, 'long')}</dd>

        <dt className="text-gray-500">{t('relative')}</dt>
        <dd>{format.relativeTime(SAMPLE_DATE, now)}</dd>

        <dt className="text-gray-500">{t('number')}</dt>
        <dd>{format.number(1234567.89)}</dd>

        <dt className="text-gray-500">{t('currency')}</dt>
        <dd>{format.number(99.95, 'currency')}</dd>

        <dt className="text-gray-500">{t('percent')}</dt>
        <dd>{format.number(0.872, 'percent')}</dd>

        <dt className="text-gray-500">{t('list')}</dt>
        <dd>
          {format.list(['Apple', 'Pear', 'Orange'], { type: 'conjunction' })}
        </dd>
      </dl>
    </section>
  )
}

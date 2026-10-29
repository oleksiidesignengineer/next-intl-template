'use client'

import { useFormatter, useNow } from 'next-intl'

/**
 * Relative time to a fixed date that stays current on the client — the
 * pattern from next-intl's useNow docs. No messages needed: formatting only
 * uses locale, timeZone, now and formats, which NextIntlClientProvider
 * inherits from src/shared/i18n/request.ts.
 *
 * Hydration matches because the server and the first client render both use
 * the shared `now` of the request config (the build time on a static page);
 * useNow({ updateInterval }) then switches to the real current time.
 */
export function LiveRelativeTime({ date }: { date: Date }) {
  const format = useFormatter()
  const now = useNow({ updateInterval: 1000 })

  return <time dateTime={date.toISOString()}>{format.relativeTime(date, now)}</time>
}

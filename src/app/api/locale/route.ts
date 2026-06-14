import { hasLocale } from 'next-intl'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { LOCALE_COOKIE_MAX_AGE, LOCALE_COOKIE_NAME, routing } from '@/shared/i18n/routing'

/**
 * POST /api/locale  { locale: 'ru' }
 *
 * Programmatically sets the locale cookie. Used when the locale needs
 * to be set OUTSIDE of a normal navigation event — e.g. after login, load
 * user's preferred locale from DB and call this endpoint to persist it.
 *
 * Note: the next-intl proxy (src/proxy.ts) ALREADY sets this cookie when
 * the user navigates between locales via Link/router. For UI-driven locale
 * switching there's no need to call this endpoint — see
 * src/features/locale-switch/ui/LangSwitcher.tsx.
 */
export async function POST(request: Request) {
  // Same-origin guard. State-changing endpoints should reject cross-origin
  // requests by default — even when the impact is "just" a locale flip,
  // showing the pattern correctly matters because users copy this for more
  // sensitive endpoints. Absence of Origin header is treated as suspicious.
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  // Parse defensively: a malformed Origin must yield 403, not a 500 from new URL().
  let originHost: string | null = null
  try {
    originHost = origin ? new URL(origin).host : null
  } catch {
    originHost = null
  }
  if (!originHost || !host || originHost !== host) {
    return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const locale = (payload as { locale?: unknown })?.locale

  if (!hasLocale(routing.locales, locale)) {
    return NextResponse.json(
      { error: 'Invalid locale', allowed: routing.locales },
      { status: 400 }
    )
  }

  const store = await cookies()
  store.set(LOCALE_COOKIE_NAME, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })

  return NextResponse.json({ ok: true, locale })
}

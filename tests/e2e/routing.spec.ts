import { TEXT_DIRECTION } from '../../src/shared/config/locales'

import { LOCALES, expect, test } from './fixtures'

test.describe('locale detection and prefixes', () => {
  test('`/` redirects by Accept-Language', async ({ request }) => {
    const res = await request.get('/', {
      headers: { 'Accept-Language': 'uk-UA,uk;q=0.9' },
      maxRedirects: 0,
    })
    expect([307, 308]).toContain(res.status())
    expect(new URL(res.headers().location, 'http://x').pathname).toBe('/uk')
  })

  test('`/` serves the default locale without a prefix', async ({ page }) => {
    const res = await page.goto('/')
    expect(res?.status()).toBe(200)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('ANY unprefixed URL follows the visitor\'s language, not only `/`', async ({ request }) => {
    // localeDetection + `as-needed`: /about is the English URL, but a Russian
    // browser (or a NEXT_LOCALE cookie) is redirected to its own locale.
    const byHeader = await request.get('/about', {
      headers: { 'Accept-Language': 'ru-RU,ru;q=0.9' },
      maxRedirects: 0,
    })
    expect(byHeader.status()).toBe(307)
    expect(byHeader.headers().location).toBe('/ru/o-nas')

    const byCookie = await request.get('/about', {
      headers: { 'Accept-Language': 'en-US', Cookie: 'NEXT_LOCALE=uk' },
      maxRedirects: 0,
    })
    expect(byCookie.headers().location).toBe('/uk/pro-nas')
  })

  test('the NEXT_LOCALE cookie wins over Accept-Language', async ({ request }) => {
    const res = await request.get('/blog', {
      headers: { 'Accept-Language': 'ru-RU,ru;q=0.9', Cookie: 'NEXT_LOCALE=en' },
      maxRedirects: 0,
    })
    expect(res.status()).toBe(200)
  })

  test('the proxy sets a SESSION cookie, only on document requests', async ({ request }) => {
    // A visit to /ru/… from an English browser stores ru (no Max-Age/Expires).
    const doc = await request.get('/ru/o-nas', {
      headers: { 'Accept-Language': 'en-US', 'Sec-Fetch-Dest': 'document' },
      maxRedirects: 0,
    })
    const cookie = doc.headers()['set-cookie'] ?? ''
    expect(cookie).toContain('NEXT_LOCALE=ru')
    expect(cookie).toContain('Path=/')
    expect(cookie.toLowerCase()).toContain('samesite=lax')
    expect(cookie).not.toMatch(/Max-Age|Expires/i)

    // Prefetches and other background requests never touch it.
    const background = await request.get('/ru/o-nas', {
      headers: { 'Accept-Language': 'en-US', 'Sec-Fetch-Dest': 'empty' },
      maxRedirects: 0,
    })
    expect(background.headers()['set-cookie']).toBeUndefined()
  })

  test('the default locale prefix is removed (`as-needed`)', async ({ request }) => {
    const res = await request.get('/en/blog', { maxRedirects: 0 })
    expect([307, 308]).toContain(res.status())
    expect(new URL(res.headers().location, 'http://x').pathname).toBe('/blog')
  })

  for (const locale of LOCALES) {
    test(`<html lang dir> on /${locale}`, async ({ page }) => {
      await page.goto(locale === 'en' ? '/' : `/${locale}`)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.locator('html')).toHaveAttribute('dir', TEXT_DIRECTION[locale])
    })
  }
})

test.describe('localized pathnames', () => {
  const cases = [
    ['/about', 'About'],
    ['/ru/o-nas', 'О шаблоне'],
    ['/uk/pro-nas', 'Про шаблон'],
  ] as const

  for (const [path, heading] of cases) {
    test(`${path} renders`, async ({ page }) => {
      const res = await page.goto(path)
      expect(res?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
    })
  }

  test('the canonical path redirects to the localized one', async ({ request }) => {
    const res = await request.get('/ru/about', { maxRedirects: 0 })
    expect([307, 308]).toContain(res.status())
    expect(new URL(res.headers().location, 'http://x').pathname).toBe('/ru/o-nas')
  })

  test('the shared Link localizes pathnames, also with a query string', async ({ page }) => {
    await page.goto('/ru/demo/plurals')
    await expect(page.locator('header nav a[href="/ru/o-nas"]')).toBeVisible()
    // PluralsPlayground: <Link href="/about?ref=terms"> inside t.rich().
    await expect(page.locator('main a[href="/ru/o-nas?ref=terms"]')).toBeVisible()
  })
})

test.describe('404s', () => {
  test('unknown URL inside a locale gets the localized 404 with header', async ({ page }) => {
    const res = await page.goto('/ru/this-route-does-not-exist')
    expect(res?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Страница не найдена')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible()
  })

  test('unknown blog slug (route closed by dynamicParams = false) → localized 404', async ({ page }) => {
    const res = await page.goto('/uk/blog/does-not-exist')
    expect(res?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Сторінку не знайдено')
  })

  test('unknown first segment is an unprefixed path → localized 404', async ({ page }) => {
    // The proxy can't tell /xx from a page path, so it serves /xx/about in the
    // default locale; [...rest] turns it into the localized 404.
    const res = await page.goto('/xx/about')
    expect(res?.status()).toBe(404)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  })

  test('unknown API path (skipped by the proxy) → plain root 404', async ({ page }) => {
    const res = await page.goto('/api/does-not-exist')
    expect(res?.status()).toBe(404)
    await expect(page.getByText('Page not found')).toBeVisible()
    await expect(page).toHaveTitle('Page not found')
  })

  test('request without a locale (skipped by the proxy) → English root 404', async ({ page }) => {
    const res = await page.goto('/unknown.txt')
    expect(res?.status()).toBe(404)
    await expect(page.getByText('Page not found')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page).toHaveTitle('Page not found')
  })
})

import { SITE_URL, expect, test } from './fixtures'

const url = (path: string) => new URL(path, SITE_URL).toString()

test.describe('page metadata', () => {
  test('canonical + hreflang for every locale and x-default', async ({ page }) => {
    await page.goto('/ru/o-nas')
    const head = page.locator('head')
    await expect(head.locator('link[rel="canonical"]')).toHaveAttribute('href', url('/ru/o-nas'))
    const expected = {
      en: url('/about'),
      ru: url('/ru/o-nas'),
      uk: url('/uk/pro-nas'),
      'x-default': url('/about'),
    }
    for (const [hreflang, href] of Object.entries(expected)) {
      await expect(head.locator(`link[rel="alternate"][hreflang="${hreflang}"]`)).toHaveAttribute('href', href)
    }
  })

  test('each page has its own localized OpenGraph tags and image', async ({ page, request }) => {
    await page.goto('/uk/blog/hello-world')
    const og = (property: string) => page.locator(`meta[property="${property}"]`)
    await expect(og('og:title')).toHaveAttribute('content', 'Привіт, світ!')
    await expect(og('og:locale')).toHaveAttribute('content', 'uk_UA')
    await expect(og('og:url')).toHaveAttribute('content', url('/uk/blog/hello-world'))
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')

    const image = await og('og:image').first().getAttribute('content')
    expect(new URL(image!).pathname).toBe('/uk/opengraph-image')
    const res = await request.get(new URL(image!).pathname, { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe('image/png')
  })

  test('the default locale OG image is served without a redirect', async ({ request }) => {
    const res = await request.get('/en/opengraph-image', { maxRedirects: 0 })
    expect(res.status()).toBe(200)
  })

  test('OG images exist only for known locales', async ({ request }) => {
    expect((await request.get('/xx/opengraph-image', { maxRedirects: 0 })).status()).toBe(404)
  })

  test('title uses the layout template', async ({ page }) => {
    await page.goto('/ru/contact')
    await expect(page).toHaveTitle('Связаться с нами | Шаблон next-intl')
  })

  test('JSON-LD carries the active locale', async ({ page }) => {
    await page.goto('/uk/pro-nas')
    const json = await page.locator('script[type="application/ld+json"]').textContent()
    expect(JSON.parse(json!)).toMatchObject({ '@type': 'AboutPage', inLanguage: 'uk' })
  })

  test('demo pages are noindex, content pages are not', async ({ page }) => {
    await page.goto('/demo/formats')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    // Let the header links' prefetches finish: WebKit logs fetches aborted by
    // the next navigation as "…due to access control checks".
    await page.waitForLoadState('networkidle')
    await page.goto('/about')
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
  })
})

test.describe('sitemap.xml and robots.txt', () => {
  test('one <url> per page per locale, each with the full hreflang set', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text()
    for (const path of ['/', '/about', '/ru/o-nas', '/uk/pro-nas', '/ru/contact', '/uk/blog/hello-world']) {
      expect(xml).toContain(`<loc>${url(path)}</loc>`)
    }
    expect(xml).toContain(`hreflang="x-default" href="${url('/about')}"`)
    expect(xml).not.toContain('/demo/')
  })

  test('robots.txt points at the sitemap', async ({ request }) => {
    const text = await (await request.get('/robots.txt')).text()
    expect(text).toContain(`Sitemap: ${url('/sitemap.xml')}`)
  })
})

test('defensive headers, no X-Powered-By', async ({ request }) => {
  const headers = (await request.get('/about')).headers()
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options']).toBe('SAMEORIGIN')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['x-powered-by']).toBeUndefined()
  // hreflang comes from metadata + sitemap, not from the proxy's Link header.
  expect(headers['link'] ?? '').not.toContain('hreflang')
})

import messages from '../../src/shared/i18n/messages/en.json'

import { LOCALES, expect, test } from './fixtures'

const PAGES = ['/', '/about', '/blog', '/blog/hello-world', '/contact', '/demo/plurals', '/demo/formats', '/demo/errors']

// The fixture fails a test on any console error — this sweep renders every
// page in every locale, so a Client Component reading a namespace that its
// <ClientMessages> doesn't provide, or a hydration mismatch, fails here.
for (const locale of LOCALES) {
  for (const path of PAGES) {
    test(`renders /${locale}${path} without errors`, async ({ page }) => {
      const res = await page.goto(locale === 'en' ? path : `/${locale}${path === '/' ? '' : path}`)
      expect(res?.status()).toBe(200)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await page.waitForLoadState('networkidle')
    })
  }
}

test.describe('messages sent to the client', () => {
  // A namespace object in the RSC payload of NextIntlClientProvider starts
  // with its first key, e.g. `\"error\":{\"title\"`. The first key keeps
  // a namespace apart from config of the same name (`formats` is also the
  // formats config the provider inherits from request.ts).
  const shipped = (html: string, ns: keyof typeof messages) =>
    html.includes(`\\"${ns}\\":{\\"${Object.keys(messages[ns])[0]}\\"`)

  test('the layout ships only `error`', async ({ request }) => {
    const html = await (await request.get('/ru')).text()
    expect(shipped(html, 'error')).toBe(true)
    for (const ns of ['contactForm', 'contact', 'plurals', 'formats', 'home', 'header', 'notFound', 'common'] as const) {
      expect(shipped(html, ns), ns).toBe(false)
    }
  })

  test('a page ships its own island namespaces', async ({ request }) => {
    const html = await (await request.get('/ru/contact')).text()
    expect(shipped(html, 'contactForm')).toBe(true)
    // Server-only strings of the page stay on the server.
    expect(shipped(html, 'contact')).toBe(false)
    expect(shipped(html, 'plurals')).toBe(false)
  })
})

test.describe('language switcher', () => {
  test('is server-rendered with native language names', async ({ request }) => {
    const html = await (await request.get('/uk')).text()
    expect(html).toMatch(/<select[^>]*aria-label="Мова"/)
    for (const name of ['English', 'Русский', 'Українська']) expect(html).toContain(`>${name}</option>`)
  })

  test('keeps the localized pathname, multi-valued query and sets the cookie', async ({ page, context }) => {
    await page.goto('/about?tag=a&tag=b')
    await page.getByRole('combobox', { name: 'Language' }).selectOption('ru')
    await expect(page).toHaveURL(/\/ru\/o-nas\?tag=a&tag=b$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('О шаблоне')
    const cookie = (await context.cookies()).find((c) => c.name === 'NEXT_LOCALE')
    expect(cookie?.value).toBe('ru')
  })

  test('switching to the default locale drops the prefix without errors', async ({ page }) => {
    await page.goto('/ru/o-nas')
    await page.getByRole('combobox', { name: 'Язык' }).selectOption('en')
    await expect(page).toHaveURL(/\/about$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('About')
    // Let the router's prefetches of the header links settle — their errors
    // would fail the test through the console fixture.
    await page.waitForLoadState('networkidle')
  })

  test('keeps dynamic params', async ({ page }) => {
    await page.goto('/blog/hello-world')
    await page.getByRole('combobox', { name: 'Language' }).selectOption('uk')
    await expect(page).toHaveURL(/\/uk\/blog\/hello-world$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Привіт, світ!')
  })
})

test.describe('ICU demos', () => {
  test('plural forms follow CLDR rules of the locale', async ({ page }) => {
    await page.goto('/ru/demo/plurals')
    const count = page.getByRole('spinbutton', { name: 'Количество' })
    const items = page.getByTestId('items')
    for (const [value, text] of [['1', '1 элемент'], ['3', '3 элемента'], ['5', '5 элементов'], ['0', 'нет элементов']]) {
      await count.fill(value)
      await expect(items).toHaveText(text)
    }
    await expect(page.getByText('1-й шаг · 2-й шаг')).toBeVisible()
  })

  test('formats render on the server, live relative time hydrates', async ({ page }) => {
    await page.goto('/uk/demo/formats')
    await expect(page.getByText('99,95 EUR')).toBeVisible()
    // Independent of how long ago the build ran: a fixed past date, "… тому".
    await expect(page.locator('time[datetime="2026-03-15T18:30:00.000Z"]')).toHaveText(/тому$/)
  })
})

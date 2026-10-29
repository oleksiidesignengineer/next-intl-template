import { expect, test } from './fixtures'

test.describe('contact form (Server Action)', () => {
  test('shows translated errors and keeps what the user typed', async ({ page }) => {
    await page.goto('/ru/contact')
    await page.getByLabel('Email').fill('not-an-email')
    await page.getByLabel('Сообщение').fill('short')
    await page.getByRole('button', { name: 'Отправить' }).click()

    await expect(page.getByText('Введи корректный email')).toBeVisible()
    await expect(page.getByText('Минимум 10 символов')).toBeVisible()
    // React resets <form action> after every submission; the values survive.
    await expect(page.getByLabel('Email')).toHaveValue('not-an-email')
    await expect(page.getByLabel('Сообщение')).toHaveValue('short')
  })

  test('success shows a localized toast and clears the form', async ({ page }) => {
    await page.goto('/uk/contact')
    await page.getByLabel('Email').fill('user@example.com')
    await page.getByLabel('Повідомлення').fill('Long enough message')
    await page.getByRole('button', { name: 'Надіслати' }).click()

    // Inline status in the form (works without JS) + the client-only toast.
    await expect(page.locator('form [role="status"]')).toHaveText('Дякуємо! Повідомлення отримане.')
    await expect(page.locator('[data-sonner-toast]')).toContainText('Дякуємо! Повідомлення отримане.')
    await expect(page.getByLabel('Email')).toHaveValue('')
    await expect(page.getByRole('region', { name: /Сповіщення/ })).toBeAttached()
  })

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false })

    test('the form still works and errors are in the page locale', async ({ page }) => {
      await page.goto('/uk/contact')
      await page.getByLabel('Email').fill('bad')
      await page.getByLabel('Повідомлення').fill('Long enough message')
      await page.getByRole('button', { name: 'Надіслати' }).click()
      await expect(page.getByText('Введи коректний email')).toBeVisible()
      // The server echoes the values back, so nothing is lost without JS either.
      await expect(page.getByLabel('Email')).toHaveValue('bad')
      await expect(page.getByLabel('Повідомлення')).toHaveValue('Long enough message')
    })

    test('success is confirmed inline (no toast without JS)', async ({ page }) => {
      await page.goto('/uk/contact')
      await page.getByLabel('Email').fill('user@example.com')
      await page.getByLabel('Повідомлення').fill('Long enough message')
      await page.getByRole('button', { name: 'Надіслати' }).click()
      await expect(page.locator('form [role="status"]')).toHaveText('Дякуємо! Повідомлення отримане.')
    })
  })
})

test('error boundary is localized and `retry` recovers', async ({ page, consoleErrors }) => {
  await page.goto('/uk/demo/errors')
  await page.getByRole('button', { name: 'Кинути помилку' }).click()

  const alert = page.getByRole('alert')
  await expect(alert.getByRole('heading')).toHaveText('Щось пішло не так')
  await alert.getByRole('button', { name: 'Спробувати знову' }).click()
  await expect(page.getByRole('button', { name: 'Кинути помилку' })).toBeVisible()

  // Drop only the intentional demo error (Firefox prints it as just "Error");
  // anything else — e.g. "TypeError: retry is not a function" or a
  // MISSING_MESSAGE from error.tsx — stays and fails the test via the fixture.
  const unexpected = consoleErrors.filter(
    (message) => !message.includes('Demo error thrown on purpose') && message.trim() !== 'Error'
  )
  consoleErrors.splice(0, consoleErrors.length, ...unexpected)
})

import { test as base, expect } from '@playwright/test'

import { routing } from '../../src/shared/i18n/routing'

/**
 * Origin the app was BUILT with (src/shared/config/site.ts). playwright.config.ts
 * loads .env* the way `next build` does, so both see the same SITE_URL.
 */
export const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3000'

/** Every locale of the app — a new locale is covered without touching tests. */
export const LOCALES = routing.locales

/**
 * Every test fails on console errors and uncaught page errors. That covers
 * hydration mismatches and next-intl's client-side MISSING_MESSAGE errors
 * (a Client Component using a namespace its <ClientMessages> doesn't pass).
 * Tests that provoke errors on purpose empty `consoleErrors` after checking.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (message) => {
        if (message.type() !== 'error') return
        // 404s are judged by the network listener below: the console text and
        // its location differ between Chromium, Firefox and WebKit.
        if (message.text().includes('status of 404')) return
        errors.push(message.text())
      })
      // The 404 of the document itself is expected on 404 pages; a 404 of any
      // other request (prefetch, script, image) is a real error.
      page.on('response', (response) => {
        if (response.status() === 404 && response.request().resourceType() !== 'document') {
          errors.push(`404 ${response.url()}`)
        }
      })
      page.on('pageerror', (error) => errors.push(error.message))
      await use(errors)
      expect(errors, 'console errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

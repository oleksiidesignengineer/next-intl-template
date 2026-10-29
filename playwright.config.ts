import { loadEnvConfig } from '@next/env'
import { defineConfig, devices } from '@playwright/test'

// Load .env* like `next build` does, so the tests expect the same SITE_URL
// the static pages were built with (tests/e2e/fixtures.ts).
loadEnvConfig(process.cwd())

const PORT = Number(process.env.PORT ?? 3100)

/**
 * End-to-end tests against the PRODUCTION build (static pages, proxy, real
 * hydration) — run `npm run build` first. Unit tests (tests/unit) run on
 * node:test without a build: `npm run test:unit`.
 *
 * The server is started by Playwright. To reuse an already running
 * `next start -p 3100`, set PW_REUSE_SERVER=1 — and restart it after every
 * build, or the tests run against the old one.
 */
export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  fullyParallel: true,
  use: {
    baseURL: `http://localhost:${PORT}`,
    // A neutral browser: no Accept-Language preference for ru/uk, so `/`
    // serves the default locale unless a test sets the header itself.
    locale: 'en-US',
    trace: 'on-first-retry',
  },
  testDir: './tests/e2e',
  // All three engines: WebKit and Firefox differ from Chromium in ICU data,
  // console output and fetch-abort behaviour — Safari users are real users.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/about`,
    reuseExistingServer: process.env.PW_REUSE_SERVER === '1',
  },
})

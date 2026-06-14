/**
 * HTTP smoke tests for the running app.
 *
 * Verifies critical invariants of the next-intl template:
 *   - locale routing (home redirect, pathname mapping, prefix behavior)
 *   - SEO output (hreflang, canonical, JSON-LD, sitemap entries)
 *   - HTTP security (CSRF Origin check, defensive headers, no X-Powered-By)
 *   - Client payload optimization (pickNamespaces ships only needed namespaces)
 *   - not-found behavior (root vs [locale] fallback)
 *
 * Usage:
 *   npm run dev                # in one terminal
 *   npm run smoke              # in another
 *
 * Override host via env:
 *   SMOKE_URL=http://localhost:3010 npm run smoke
 *
 * Exits 0 if all checks pass, 1 on any failure.
 */
import { strict as assert } from 'node:assert'

const BASE = process.env.SMOKE_URL ?? 'http://localhost:3000'

type Check = { name: string; run: () => Promise<void> }

async function getText(path: string, init?: RequestInit): Promise<{ status: number; body: string; headers: Headers }> {
  const res = await fetch(BASE + path, init)
  return { status: res.status, body: await res.text(), headers: res.headers }
}

async function head(path: string, init?: RequestInit): Promise<{ status: number; headers: Headers }> {
  // Use GET with manual redirect since some dev servers don't handle HEAD well
  const res = await fetch(BASE + path, { ...init, redirect: 'manual' })
  // Drain body so the connection can be reused
  await res.text()
  return { status: res.status, headers: res.headers }
}

const checks: Check[] = [
  {
    name: 'Home / honors Accept-Language for locale detection',
    async run() {
      // With Accept-Language: ru, middleware redirects to /ru.
      // (With en, no redirect — default locale serves at / per `localePrefix: as-needed`.)
      const { status, headers } = await head('/', {
        headers: { 'Accept-Language': 'ru' },
      })
      assert(status === 307 || status === 308, `expected redirect, got ${status}`)
      const loc = headers.get('location') ?? ''
      assert(loc.endsWith('/ru'), `unexpected redirect target: ${loc}`)
    },
  },
  {
    name: '/ru home renders with Russian header',
    async run() {
      const { status, body } = await getText('/ru')
      assert.equal(status, 200)
      assert(body.includes('Шаблон next-intl'), 'missing RU title')
      assert(body.includes('lang="ru"'), 'missing lang attribute')
      assert(body.includes('dir="ltr"'), 'missing dir attribute')
    },
  },
  {
    name: '/uk home renders with Ukrainian header',
    async run() {
      const { status, body } = await getText('/uk')
      assert.equal(status, 200)
      assert(body.includes('Шаблон next-intl'), 'missing UK title')
      assert(body.includes('Головна'), 'missing UK nav label')
    },
  },
  {
    name: '/about (en, default locale, no prefix)',
    async run() {
      const { status, body } = await getText('/about')
      assert.equal(status, 200)
      assert(body.includes('<h1 class="text-3xl font-bold mb-4">About</h1>'), 'missing About heading')
    },
  },
  {
    name: 'Localized pathname /ru/o-nas works',
    async run() {
      const { status, body } = await getText('/ru/o-nas')
      assert.equal(status, 200)
      assert(body.includes('О шаблоне'), 'missing О шаблоне heading')
    },
  },
  {
    name: 'Localized pathname /uk/pro-nas works',
    async run() {
      const { status, body } = await getText('/uk/pro-nas')
      assert.equal(status, 200)
      assert(body.includes('Про шаблон'), 'missing Про шаблон heading')
    },
  },
  {
    name: '/about head contains hreflang for all locales + canonical',
    async run() {
      const { body } = await getText('/about')
      const hreflangs = body.match(/<link rel="alternate" hrefLang="(en|ru|uk)"/g) ?? []
      assert.equal(hreflangs.length, 3, `expected 3 hreflang links, got ${hreflangs.length}`)
      assert(body.includes('<link rel="canonical"'), 'missing canonical link')
    },
  },
  {
    name: '/about renders valid JSON-LD with inLanguage',
    async run() {
      const { body } = await getText('/about')
      const match = body.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)
      assert(match, 'JSON-LD script not found')
      const parsed = JSON.parse(match[1])
      assert.equal(parsed['@type'], 'AboutPage')
      assert.equal(parsed.inLanguage, 'en')
    },
  },
  {
    name: 'Security headers present, no X-Powered-By',
    async run() {
      const { headers } = await head('/about')
      assert.equal(headers.get('x-content-type-options'), 'nosniff')
      assert.equal(headers.get('x-frame-options'), 'SAMEORIGIN')
      assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
      assert.equal(headers.get('x-powered-by'), null, 'X-Powered-By should be removed')
    },
  },
  {
    name: '/sitemap.xml includes all static + blog pages with hreflang',
    async run() {
      const { status, body } = await getText('/sitemap.xml')
      assert.equal(status, 200)
      assert(body.includes('<?xml'), 'not XML')
      for (const path of ['/', '/about', '/blog', '/contact', '/demo/plurals', '/demo/formats']) {
        const expected = path === '/' ? 'https://example.com/<' : `https://example.com${path}<`
        assert(body.includes(expected), `sitemap missing entry for ${path}`)
      }
      // hreflang alternates
      for (const locale of ['en', 'ru', 'uk']) {
        assert(
          body.includes(`hreflang="${locale}"`),
          `sitemap missing hreflang="${locale}"`
        )
      }
      // blog posts
      for (const slug of ['hello-world', 'next-intl-tips', 'i18n-best-practices']) {
        assert(body.includes(`/blog/${slug}`), `sitemap missing post ${slug}`)
      }
    },
  },
  {
    name: '/blog/hello-world renders post on each locale',
    async run() {
      for (const [locale, expected] of [
        ['/blog/hello-world', 'Hello, world!'],
        ['/ru/blog/hello-world', 'Привет, мир!'],
        ['/uk/blog/hello-world', 'Привіт, світ!'],
      ] as const) {
        const { status, body } = await getText(locale)
        assert.equal(status, 200, `${locale} → ${status}`)
        assert(body.includes(expected), `${locale} missing "${expected}"`)
      }
    },
  },
  {
    name: 'Unknown post → [locale]/not-found.tsx with translation',
    async run() {
      const { status, body } = await getText('/ru/blog/does-not-exist')
      assert.equal(status, 404)
      assert(body.includes('Страница не найдена'), 'missing translated not-found text')
      // Header still renders (provider available)
      assert(body.includes('Главная'), 'header missing — provider issue?')
    },
  },
  {
    name: 'Unknown route → root app/not-found.tsx (English fallback)',
    async run() {
      const { status, body } = await getText('/ru/this-route-does-not-exist')
      assert.equal(status, 404)
      assert(body.includes('Page not found'), 'root not-found missing')
      // No localized header — root not-found renders outside [locale]
      assert(!body.includes('Главная'), 'root not-found should not have [locale] header')
    },
  },
  {
    name: 'POST /api/locale rejects cross-origin with 403',
    async run() {
      const { status, body } = await getText('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://evil.com' },
        body: JSON.stringify({ locale: 'uk' }),
      })
      assert.equal(status, 403)
      assert(body.includes('Cross-origin'), 'error message missing')
    },
  },
  {
    name: 'POST /api/locale rejects no-Origin with 403',
    async run() {
      const { status } = await getText('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: 'uk' }),
      })
      assert.equal(status, 403)
    },
  },
  {
    name: 'POST /api/locale rejects invalid locale with 400',
    async run() {
      const { status, body } = await getText('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: BASE },
        body: JSON.stringify({ locale: 'zh' }),
      })
      assert.equal(status, 400)
      assert(body.includes('Invalid locale'), 'expected error body')
    },
  },
  {
    name: 'POST /api/locale accepts valid locale, sets NEXT_LOCALE cookie',
    async run() {
      const res = await fetch(BASE + '/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: BASE },
        body: JSON.stringify({ locale: 'uk' }),
      })
      await res.text()
      assert.equal(res.status, 200)
      const setCookie = res.headers.get('set-cookie') ?? ''
      assert(setCookie.includes('NEXT_LOCALE=uk'), `cookie not set: ${setCookie}`)
      assert(setCookie.includes('Max-Age=31536000'), 'wrong maxAge')
      assert(setCookie.includes('SameSite=lax'), 'wrong sameSite')
    },
  },
  {
    name: 'Client payload contains ONLY pickNamespaces (no header/home/about/blog)',
    async run() {
      const { body } = await getText('/ru')
      // `\"namespace\":{` only appears inside the flight payload JSON, not in
      // rendered HTML text. So presence/absence of these escaped markers tells
      // us exactly which namespaces were serialized to the client.
      const inClientPayload = (ns: string) => body.includes(`\\"${ns}\\":{`)
      for (const ns of ['common', 'notFound', 'error', 'plurals', 'formats', 'contact']) {
        assert(inClientPayload(ns), `expected namespace "${ns}" missing from client payload`)
      }
      for (const ns of ['header', 'home', 'about', 'blog']) {
        assert(!inClientPayload(ns), `unexpected namespace "${ns}" in client payload (pick broken?)`)
      }
    },
  },
  {
    name: 'Multi-value query preserved at the router level (URL fetch)',
    async run() {
      // Note: this only validates that the server accepts and renders such URLs.
      // The LangSwitcher behavior (preserving the array on switch) is a client
      // interaction not covered by HTTP smoke. See manual test in docs/06.
      const { status } = await getText('/ru/o-nas?tag=js&tag=react&sort=date')
      assert.equal(status, 200)
    },
  },
]

async function main() {
  const args = process.argv.slice(2)
  const filter = args.find((a) => !a.startsWith('--'))

  let passed = 0
  let failed = 0
  const failures: { name: string; message: string }[] = []

  for (const check of checks) {
    if (filter && !check.name.toLowerCase().includes(filter.toLowerCase())) continue
    try {
      await check.run()
      console.log(`\x1b[32m✓\x1b[0m ${check.name}`)
      passed++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`\x1b[31m✗\x1b[0m ${check.name}\n  ${message.split('\n')[0]}`)
      failed++
      failures.push({ name: check.name, message })
    }
  }

  console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m`)
  if (failed > 0) {
    console.log('\nFailure details:')
    for (const f of failures) {
      console.log(`\n  ${f.name}:`)
      console.log('  ' + f.message.split('\n').join('\n  '))
    }
  }
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('Smoke runner crashed:', err)
  process.exit(1)
})

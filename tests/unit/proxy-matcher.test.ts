import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'

// Next.js reads `config.matcher` statically, so it must stay a literal in
// src/proxy.ts. Importing that file would also load next-intl's middleware
// outside of Next.js — so the literal is read as text.
const source = readFileSync(join(process.cwd(), 'src/proxy.ts'), 'utf-8')
const literal = source.match(/matcher:\s*'((?:[^'\\]|\\.)*)'/)?.[1]
const matcher = literal?.replace(/\\\\/g, '\\')

const runsProxy = (url: string) => unstable_doesMiddlewareMatch({ config: { matcher }, url })

// The matcher decides which requests get locale handling at all; an
// over-broad exclusion silently breaks pages of the default locale.
describe('proxy matcher', () => {
  test('is found in src/proxy.ts', () => {
    assert.ok(matcher)
  })

  test('runs on page paths', () => {
    for (const url of ['/', '/about', '/ru/o-nas', '/blog/designing-opengraph-images', '/apiary', '/api-docs']) {
      assert.equal(runsProxy(url), true, url)
    }
  })

  test('skips API routes, Next internals, files and OG image routes', () => {
    for (const url of [
      '/api',
      '/api/health',
      '/_next/static/chunk.js',
      '/favicon.ico',
      '/sitemap.xml',
      '/en/opengraph-image',
      '/ru/blog/hello-world/opengraph-image',
      '/_vercel/insights/script.js',
    ]) {
      assert.equal(runsProxy(url), false, url)
    }
  })

  test('skips ANY path with a dot — a slug like v1.2 bypasses locale handling', () => {
    // Known trade-off of the standard next-intl matcher: keep dots out of page URLs.
    assert.equal(runsProxy('/blog/v1.2'), false)
  })
})

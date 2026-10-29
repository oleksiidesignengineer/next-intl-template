import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { splitHref, toLinkHref } from '../../src/shared/lib/href'

// The @/shared/ui/Link wrapper and localizePath rely on this split to apply
// `pathnames` to hrefs with a query or hash.
describe('splitHref', () => {
  test('splits internal paths with a query or hash', () => {
    assert.deepEqual(splitHref('/about?tag=a&tag=b#team'), {
      pathname: '/about',
      query: { tag: ['a', 'b'] },
      hash: 'team',
    })
    assert.deepEqual(splitHref('/about#team'), { pathname: '/about', hash: 'team' })
  })

  test('Link gives protocol-relative URLs an explicit scheme', () => {
    // next-intl would otherwise treat '//cdn…' as a path: '/ru//cdn…'.
    assert.equal(toLinkHref('//cdn.example.com/a?b=1'), 'https://cdn.example.com/a?b=1')
    assert.deepEqual(toLinkHref('/about#team'), { pathname: '/about', hash: 'team' })
    assert.equal(toLinkHref('https://example.com/x?y=1'), 'https://example.com/x?y=1')
  })

  test('leaves everything else untouched', () => {
    for (const href of [
      '/about',
      '#faq',
      '?page=2',
      'details?x=1',
      'https://example.com/path?utm=1',
      '//cdn.example.com/a?b=1',
      'mailto:hi@example.com?subject=Hello',
      'tel:+123?x=1',
    ]) {
      assert.equal(splitHref(href), href, href)
    }
  })
})

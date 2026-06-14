/**
 * Localization integrity checks. Run with: npm run check:translations
 *
 * 1. Key parity — every locale has exactly the keys of the source locale.
 * 2. Value-type parity — each leaf has the same JS type (string/array/number/…)
 *    as the source locale (catches e.g. a string where en.json has an array).
 * 3. CLIENT_NAMESPACES coverage — every namespace a Client Component reads via
 *    useTranslations(...) is present in the layout's CLIENT_NAMESPACES allowlist
 *    (otherwise it fails at runtime, not at build/type time).
 *
 * Exits with code 1 on any mismatch.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { routing } from '../src/shared/i18n/routing'

const ROOT = process.cwd()
const MESSAGES_DIR = join(ROOT, 'src/shared/i18n/messages')
const SRC_DIR = join(ROOT, 'src')
const LAYOUT_FILE = join(SRC_DIR, 'app/[locale]/layout.tsx')
const SOURCE_LOCALE = routing.defaultLocale

type Json = Record<string, unknown>

function valueType(value: unknown): string {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}

/** Flatten to a map of dotted leaf path -> value type (objects recurse, arrays are leaves). */
function collectLeaves(obj: Json, prefix = '', out = new Map<string, string>()): Map<string, string> {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      collectLeaves(value as Json, path, out)
    } else {
      out.set(path, valueType(value))
    }
  }
  return out
}

function loadLocale(locale: string): Json {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf-8'))
}

let hasErrors = false

// 1 + 2: key parity and value-type parity against the source locale.
const source = collectLeaves(loadLocale(SOURCE_LOCALE))

for (const locale of routing.locales) {
  if (locale === SOURCE_LOCALE) continue

  const target = collectLeaves(loadLocale(locale))

  const missing = [...source.keys()].filter((k) => !target.has(k)).sort()
  const extra = [...target.keys()].filter((k) => !source.has(k)).sort()
  const typeMismatch = [...source.keys()]
    .filter((k) => target.has(k) && target.get(k) !== source.get(k))
    .sort()

  if (missing.length === 0 && extra.length === 0 && typeMismatch.length === 0) {
    console.log(`✓ ${locale}: in sync with ${SOURCE_LOCALE}`)
    continue
  }

  hasErrors = true
  console.error(`✗ ${locale}: out of sync with ${SOURCE_LOCALE}`)
  if (missing.length > 0) {
    console.error(`  Missing ${missing.length} key(s):`)
    missing.forEach((k) => console.error(`    - ${k}`))
  }
  if (extra.length > 0) {
    console.error(`  Extra ${extra.length} key(s) (not in ${SOURCE_LOCALE}):`)
    extra.forEach((k) => console.error(`    + ${k}`))
  }
  if (typeMismatch.length > 0) {
    console.error(`  Type mismatch ${typeMismatch.length} key(s):`)
    typeMismatch.forEach((k) =>
      console.error(`    ~ ${k}: ${SOURCE_LOCALE}=${source.get(k)} ${locale}=${target.get(k)}`)
    )
  }
}

// 3: CLIENT_NAMESPACES coverage.
function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return listFiles(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

const layoutSource = readFileSync(LAYOUT_FILE, 'utf-8')
const nsBlock = layoutSource.match(/CLIENT_NAMESPACES\s*=\s*\[([\s\S]*?)\]/)
const clientNamespaces = new Set(
  nsBlock ? [...nsBlock[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]) : []
)

if (clientNamespaces.size === 0) {
  hasErrors = true
  console.error('✗ Could not parse CLIENT_NAMESPACES from app/[locale]/layout.tsx')
} else {
  const misses: string[] = []
  for (const file of listFiles(SRC_DIR)) {
    const code = readFileSync(file, 'utf-8')
    if (!code.includes("'use client'") && !code.includes('"use client"')) continue
    for (const match of code.matchAll(/useTranslations\(\s*['"]([^'"]+)['"]/g)) {
      const root = match[1].split('.')[0]
      if (!clientNamespaces.has(root)) {
        misses.push(`${file.replace(`${ROOT}/`, '')}: useTranslations('${match[1]}') → '${root}' not in CLIENT_NAMESPACES`)
      }
    }
  }

  if (misses.length > 0) {
    hasErrors = true
    console.error('✗ Client useTranslations namespaces missing from CLIENT_NAMESPACES:')
    misses.forEach((m) => console.error(`    - ${m}`))
  } else {
    console.log('✓ CLIENT_NAMESPACES covers all client useTranslations namespaces')
  }
}

process.exit(hasErrors ? 1 : 0)

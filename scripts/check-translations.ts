/**
 * Localization integrity checks. Run with: npm run check:translations
 *
 * Against the source locale (routing.defaultLocale), for every other locale:
 *   1. Key parity — exactly the same keys.
 *   2. Value-type parity — each leaf has the same JS type (string/array/…).
 *   3. ICU parity — every message uses the same arguments ({name}, {count, …})
 *      with the same kind of value (text / number / date), declines by number
 *      where the source does ({n, plural, …} — unless the locale has a single
 *      plural form), the same select
 *      keys ({role, select, admin {…} …} — keys are values from code, never
 *      translated) and the same rich-text tags (<link>…</link>).
 *
 * For every locale, including the source:
 *   4. No empty strings — '' is a value, so the default-locale fallback in
 *      request.ts would not kick in and the UI would show nothing.
 *   5. ICU syntax — each message parses (unbalanced braces, select/plural
 *      without an `other` branch, unclosed tags).
 *   6. Plural categories — `plural`/`selectordinal` branches use only the
 *      categories CLDR defines for that locale, and if a message spells out
 *      any of them besides `other`, it spells out all of them (e.g. ru needs
 *      one/few/many/other: "Минимум 2 символов" is the classic bug).
 *
 * Missing client-side messages are not checked here — they depend on which
 * namespaces each <ClientMessages> passes; the e2e suite fails on any console
 * error, including next-intl's MISSING_MESSAGE.
 *
 * Exits with code 1 on any problem.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  type MessageFormatElement,
  TYPE,
  parse,
} from '@formatjs/icu-messageformat-parser'

import { routing } from '../src/shared/i18n/routing'

const MESSAGES_DIR = join(process.cwd(), 'src/shared/i18n/messages')
const SOURCE_LOCALE = routing.defaultLocale

type Json = Record<string, unknown>

function valueType(value: unknown): string {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}

/** Flatten to dotted leaf path -> value (objects recurse, arrays are leaves). */
function collectLeaves(obj: Json, prefix = '', out = new Map<string, unknown>()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      collectLeaves(value as Json, path, out)
    } else {
      out.set(path, value)
    }
  }
  return out
}

function loadLocale(locale: string): Map<string, unknown> {
  return collectLeaves(JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf-8')))
}

/** What a caller passes: `{name}` and select take text, plural takes a number… */
type ValueKind = 'text' | 'number' | 'date'

type IcuInfo = {
  args: Map<string, ValueKind>
  /** Arguments that pick a plural/selectordinal branch somewhere in the message. */
  pluralArgs: Set<string>
  selectKeys: Map<string, Set<string>>
  tags: Set<string>
  plurals: { arg: string; ordinal: boolean; categories: string[] }[]
}

function analyze(
  elements: MessageFormatElement[],
  info: IcuInfo = { args: new Map(), pluralArgs: new Set(), selectKeys: new Map(), tags: new Set(), plurals: [] }
) {
  for (const el of elements) {
    switch (el.type) {
      case TYPE.argument:
        // A plain {x} accepts anything; keep a more specific kind if seen.
        if (!info.args.has(el.value)) info.args.set(el.value, 'text')
        break
      case TYPE.number:
        info.args.set(el.value, 'number')
        break
      case TYPE.date:
      case TYPE.time:
        info.args.set(el.value, 'date')
        break
      case TYPE.select: {
        info.args.set(el.value, 'text')
        const keys = info.selectKeys.get(el.value) ?? new Set<string>()
        for (const key of Object.keys(el.options)) if (key !== 'other') keys.add(key)
        info.selectKeys.set(el.value, keys)
        for (const option of Object.values(el.options)) analyze(option.value, info)
        break
      }
      case TYPE.plural:
        info.args.set(el.value, 'number')
        info.pluralArgs.add(el.value)
        info.plurals.push({
          arg: el.value,
          ordinal: el.pluralType === 'ordinal',
          // `=0`, `=1` are exact matches, not CLDR categories.
          categories: Object.keys(el.options).filter((key) => !key.startsWith('=')),
        })
        for (const option of Object.values(el.options)) analyze(option.value, info)
        break
      case TYPE.tag:
        info.tags.add(el.value)
        analyze(el.children, info)
        break
    }
  }
  return info
}

const problems: string[] = []
const report = (locale: string, key: string, message: string) =>
  problems.push(`${locale}: ${key} — ${message}`)

/** Parse every string message of a locale; returns key -> ICU info. */
function checkIcu(locale: string, leaves: Map<string, unknown>): Map<string, IcuInfo> {
  const result = new Map<string, IcuInfo>()
  for (const [key, value] of leaves) {
    if (typeof value !== 'string') continue
    if (value.trim() === '') {
      report(locale, key, 'empty string (the default-locale fallback does not apply to it)')
      continue
    }
    let ast: MessageFormatElement[]
    try {
      ast = parse(value, { requiresOtherClause: true })
    } catch (error) {
      report(locale, key, `invalid ICU: ${(error as Error).message}`)
      continue
    }
    const info = analyze(ast)
    result.set(key, info)

    for (const { arg, ordinal, categories } of info.plurals) {
      const rules = new Intl.PluralRules(locale, { type: ordinal ? 'ordinal' : 'cardinal' })
      const allowed = rules.resolvedOptions().pluralCategories as string[]
      const kind = ordinal ? 'selectordinal' : 'plural'
      const unknown = categories.filter((c) => !allowed.includes(c))
      if (unknown.length > 0) {
        report(locale, key, `{${arg}, ${kind}} has categories ${unknown.join(', ')} that ${locale} doesn't use (CLDR: ${allowed.join(', ')})`)
      }
      const specific = categories.filter((c) => c !== 'other')
      const missing = allowed.filter((c) => !categories.includes(c))
      if (specific.length > 0 && missing.length > 0) {
        report(locale, key, `{${arg}, ${kind}} is missing ${missing.join(', ')} (CLDR for ${locale}: ${allowed.join(', ')})`)
      }
    }
  }
  return result
}

const diff = (a: Iterable<string>, b: { has(x: string): boolean }) => [...a].filter((x) => !b.has(x))

const source = loadLocale(SOURCE_LOCALE)
const sourceIcu = checkIcu(SOURCE_LOCALE, source)

for (const locale of routing.locales) {
  if (locale === SOURCE_LOCALE) continue
  const target = loadLocale(locale)

  for (const key of source.keys()) {
    if (!target.has(key)) report(locale, key, `missing (present in ${SOURCE_LOCALE})`)
  }
  for (const key of target.keys()) {
    if (!source.has(key)) report(locale, key, `extra (absent from ${SOURCE_LOCALE})`)
  }
  for (const [key, value] of source) {
    if (target.has(key) && valueType(target.get(key)) !== valueType(value)) {
      report(locale, key, `type ${valueType(target.get(key))}, ${SOURCE_LOCALE} has ${valueType(value)}`)
    }
  }

  const targetIcu = checkIcu(locale, target)
  for (const [key, expected] of sourceIcu) {
    const actual = targetIcu.get(key)
    if (!actual) continue
    for (const arg of diff(expected.args.keys(), actual.args)) report(locale, key, `missing argument {${arg}}`)
    for (const arg of diff(actual.args.keys(), expected.args)) report(locale, key, `unknown argument {${arg}}`)
    for (const [arg, kind] of expected.args) {
      const actualKind = actual.args.get(arg)
      // A plain {x} in the translation is fine for text and numbers (it's
      // printed as is); a date must stay {x, date}/{x, time}.
      if (actualKind && actualKind !== kind && !(actualKind === 'text' && kind !== 'date')) {
        report(locale, key, `{${arg}} takes a ${actualKind}, ${SOURCE_LOCALE} passes a ${kind}`)
      }
    }
    // A plain {min} where en declines by number silently loses the plural
    // forms — unless the language has a single form anyway (ja, zh, …).
    const cardinalForms = new Intl.PluralRules(locale).resolvedOptions().pluralCategories.length
    for (const arg of expected.pluralArgs) {
      if (actual.args.has(arg) && !actual.pluralArgs.has(arg) && cardinalForms > 1) {
        report(locale, key, `{${arg}} is not declined: ${SOURCE_LOCALE} uses {${arg}, plural, …} and ${locale} has ${cardinalForms} plural forms`)
      }
    }
    for (const [arg, keys] of expected.selectKeys) {
      const actualKeys = actual.selectKeys.get(arg)
      if (!actualKeys) continue
      for (const k of diff(keys, actualKeys)) report(locale, key, `{${arg}, select} is missing the "${k}" branch`)
    }
    for (const tag of diff(expected.tags, actual.tags)) report(locale, key, `missing tag <${tag}>`)
    for (const tag of diff(actual.tags, expected.tags)) report(locale, key, `unknown tag <${tag}>`)
  }
}

if (problems.length > 0) {
  console.error(`✗ ${problems.length} translation problem(s):`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`✓ ${routing.locales.join(', ')}: keys, ICU syntax, arguments, tags and plural categories in sync with ${SOURCE_LOCALE}`)

'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import Link from '@/shared/ui/Link'

const ROLES = ['admin', 'editor', 'guest'] as const
type Role = (typeof ROLES)[number]

// Client island: needs the `plurals` namespace, provided by <ClientMessages>
// in the page. Everything static stays in the Server Component (page.tsx).
export function PluralsPlayground() {
  const t = useTranslations('plurals')
  const [count, setCount] = useState(1)
  const [name, setName] = useState('Alex')
  const [role, setRole] = useState<Role>('admin')

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          {t('labels.count')}
          <input
            type="number"
            min={0}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            className="border border-gray-300 rounded px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('labels.name')}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="border border-gray-300 rounded px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('labels.role')}
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            className="border border-gray-300 rounded px-2 py-1"
          >
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="space-y-3 text-lg">
        <li>
          <span className="text-xs text-gray-500 block">plural</span>
          <span data-testid="items">{t('items', { count })}</span>
        </li>
        <li>
          <span className="text-xs text-gray-500 block">interpolation</span>
          {t('greeting', { name })}
        </li>
        <li>
          <span className="text-xs text-gray-500 block">rich text</span>
          {t.rich('terms', {
            // A query string still gets the localized pathname: /ru/o-nas?ref=terms.
            link: (chunks) => (
              <Link href="/about?ref=terms" className="text-blue-600 underline">
                {chunks}
              </Link>
            ),
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </li>
        <li>
          <span className="text-xs text-gray-500 block">select</span>
          {t('role', { role })}
        </li>
      </ul>
    </div>
  )
}

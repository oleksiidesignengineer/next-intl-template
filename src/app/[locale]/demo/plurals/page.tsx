'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import Link from '@/shared/ui/Link'

export default function PluralsDemoPage() {
  const t = useTranslations('plurals')
  const [count, setCount] = useState(1)
  const [name, setName] = useState('Alex')
  const [role, setRole] = useState<'admin' | 'editor' | 'guest'>('admin')

  return (
    <section className="space-y-8 max-w-2xl">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-gray-600">{t('intro')}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          {t('labels.count')}
          <input
            type="number"
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
            onChange={(event) =>
              setRole(event.target.value as 'admin' | 'editor' | 'guest')
            }
            className="border border-gray-300 rounded px-2 py-1"
          >
            <option value="admin">admin</option>
            <option value="editor">editor</option>
            <option value="guest">guest</option>
          </select>
        </label>
      </div>

      <ul className="space-y-3 text-lg">
        <li>
          <span className="text-xs text-gray-500 block">plural</span>
          {t('items', { count })}
        </li>
        <li>
          <span className="text-xs text-gray-500 block">interpolation</span>
          {t('greeting', { name })}
        </li>
        <li>
          <span className="text-xs text-gray-500 block">rich text</span>
          {t.rich('terms', {
            link: (chunks) => (
              <Link href="/about" className="text-blue-600 underline">
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
    </section>
  )
}

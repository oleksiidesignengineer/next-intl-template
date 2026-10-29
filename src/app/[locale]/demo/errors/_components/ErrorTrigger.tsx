'use client'

import { useState } from 'react'

/**
 * Throws during rendering after a click, so the nearest error boundary —
 * the localized [locale]/error.tsx — takes over. Its "Try again" calls
 * `retry()`, which re-renders the segment and remounts this button.
 */
export function ErrorTrigger({ label }: { label: string }) {
  const [shouldThrow, setShouldThrow] = useState(false)
  if (shouldThrow) throw new Error('Demo error thrown on purpose')

  return (
    <button
      type="button"
      onClick={() => setShouldThrow(true)}
      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
    >
      {label}
    </button>
  )
}

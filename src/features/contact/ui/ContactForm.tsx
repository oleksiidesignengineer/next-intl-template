'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'

import type { ContactFormState } from '../api/actions'

const INITIAL_STATE: ContactFormState = { status: 'idle' }

type Props = {
  /**
   * submitContact with the locale already bound — bind it in a Server
   * Component (contact/page.tsx). Binding inside this Client Component makes
   * the no-JS form submission hang on Next.js 16.4.
   */
  action: (state: ContactFormState, formData: FormData) => Promise<ContactFormState>
}

export function ContactForm({ action }: Props) {
  const t = useTranslations('contactForm')
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE)

  useEffect(() => {
    if (state.status === 'success') toast.success(t('successToast'))
  }, [state, t])

  const fieldErrors = state.status === 'error' ? state.fieldErrors : undefined
  const formError = state.status === 'error' ? state.formError : undefined
  // React resets the form after every action; defaultValue restores the
  // submitted values on error, and an empty form after success.
  const values = state.status === 'error' ? state.values : undefined

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">
          {t('labels.email')}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={values?.email}
          placeholder={t('placeholders.email')}
          aria-invalid={Boolean(fieldErrors?.email) || undefined}
          aria-describedby={fieldErrors?.email ? 'email-error' : undefined}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />
        {fieldErrors?.email && (
          <p id="email-error" role="alert" className="text-sm text-red-600">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="message" className="block text-sm font-medium">
          {t('labels.message')}
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          defaultValue={values?.message}
          placeholder={t('placeholders.message')}
          aria-invalid={Boolean(fieldErrors?.message) || undefined}
          aria-describedby={fieldErrors?.message ? 'message-error' : undefined}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />
        {fieldErrors?.message && (
          <p id="message-error" role="alert" className="text-sm text-red-600">
            {fieldErrors.message}
          </p>
        )}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      )}

      {/* Rendered on the server too, so the confirmation also shows without
          JavaScript (the toast above is client-only); role="status" makes
          screen readers announce it. */}
      {state.status === 'success' && (
        <p role="status" className="text-sm text-green-700">
          {t('successToast')}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? t('submitting') : t('submit')}
      </button>
    </form>
  )
}

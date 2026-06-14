'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { submitContact, type ContactFormState } from '../api/actions'

const INITIAL_STATE: ContactFormState = { status: 'idle' }

export function ContactForm() {
  const t = useTranslations('contact')
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = useActionState(submitContact, INITIAL_STATE)

  useEffect(() => {
    if (state.status === 'success') {
      toast.success(t('successToast'))
      formRef.current?.reset()
    }
  }, [state, t])

  const fieldErrors = state.status === 'error' ? state.fieldErrors : undefined
  const formError = state.status === 'error' ? state.formError : undefined

  return (
    <form ref={formRef} action={formAction} className="space-y-4" noValidate>
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">
          {t('labels.email')}
        </label>
        <input
          id="email"
          name="email"
          type="email"
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

'use server'

import { hasLocale } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'

import { routing } from '@/shared/i18n/routing'

import { buildContactSchema } from '../model/schema'

type ContactValues = z.input<ReturnType<typeof buildContactSchema>>

export type ContactFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error'
      fieldErrors?: Partial<Record<keyof ContactValues, string>>
      formError?: string
      // Echoed back so the form can keep what the user typed: React resets a
      // <form action> after EVERY submission, including failed ones.
      values: ContactValues
    }

/**
 * The locale is the first, bound argument: next/root-params is not available
 * in Server Actions, so the page binds it — submitContact.bind(null, locale)
 * in contact/page.tsx. Bound arguments travel through the client, so validate.
 */
export async function submitContact(
  requestedLocale: string,
  _prevState: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale
  const t = await getTranslations({ locale, namespace: 'contact.errors' })

  const values: ContactValues = {
    email: String(formData.get('email') ?? ''),
    message: String(formData.get('message') ?? ''),
  }
  const parsed = buildContactSchema(t).safeParse(values)

  if (!parsed.success) {
    // First message per field; the messages are already translated.
    const { fieldErrors } = z.flattenError(parsed.error)
    return {
      status: 'error',
      fieldErrors: { email: fieldErrors.email?.[0], message: fieldErrors.message?.[0] },
      values,
    }
  }

  try {
    // Replace this with your real side effect: send email, write to DB,
    // enqueue a job, etc. The action runs on the server, so secrets stay
    // on the server.
    await new Promise((resolve) => setTimeout(resolve, 500))
    return { status: 'success' }
  } catch {
    return { status: 'error', formError: t('unknown'), values }
  }
}

'use server'

import { getTranslations } from 'next-intl/server'

import { buildContactSchema } from '../model/schema'

export type ContactFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error'
      fieldErrors?: { email?: string; message?: string }
      formError?: string
    }

export async function submitContact(
  _prevState: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  // Server Actions run in request context, so `getTranslations` resolves
  // the active locale automatically — no need to call `getLocale()` first.
  const t = await getTranslations('contact.errors')

  const schema = buildContactSchema(t)

  const parsed = schema.safeParse({
    email: formData.get('email'),
    message: formData.get('message'),
  })

  if (!parsed.success) {
    const fieldErrors: { email?: string; message?: string } = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (field === 'email' || field === 'message') {
        fieldErrors[field] = issue.message
      }
    }
    return { status: 'error', fieldErrors }
  }

  try {
    // Replace this with your real side effect: send email, write to DB,
    // enqueue a job, etc. The action runs on the server, so secrets stay
    // on the server.
    await new Promise((resolve) => setTimeout(resolve, 500))

    return { status: 'success' }
  } catch {
    return { status: 'error', formError: t('unknown') }
  }
}

import { getTranslations } from 'next-intl/server'
import { z } from 'zod'

const MESSAGE_MIN = 10
const MESSAGE_MAX = 1000

type ContactErrorsT = Awaited<ReturnType<typeof getTranslations<'contact.errors'>>>

/**
 * Builds the contact-form validation schema with translated error messages.
 *
 * It's a factory (not a static export) because the messages come from
 * `getTranslations`, which is async and only available inside the request —
 * there's no `t` at module-load time.
 *
 * @param t - the `contact.errors` translation function
 */
export function buildContactSchema(t: ContactErrorsT) {
  return z.object({
    email: z
      .string()
      .min(1, t('emailRequired'))
      .pipe(z.email(t('emailInvalid'))),
    message: z
      .string()
      .min(MESSAGE_MIN, t('messageTooShort', { min: MESSAGE_MIN }))
      .max(MESSAGE_MAX, t('messageTooLong', { max: MESSAGE_MAX })),
  })
}

import { type Messages, NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import type { ReactNode } from 'react'

type Namespace = keyof Messages

/**
 * Ships ONLY the given message namespaces to the Client Components below it.
 *
 * Server Components never need this — their translations stay on the server.
 * Wrap a client island with it at the page level, so each page sends just
 * what its islands use (give an island its own namespace, so server-only
 * strings of the page don't travel along):
 *
 *   <ClientMessages namespaces={['contactForm']}>
 *     <ContactForm action={submitContact.bind(null, locale)} />
 *   </ClientMessages>
 *
 * Rendered from a Server Component, NextIntlClientProvider still inherits
 * locale, timeZone, now and formats from src/shared/i18n/request.ts. Only
 * `messages` is replaced: nested providers do NOT merge messages with the
 * parent, so list every namespace the subtree needs.
 */
export async function ClientMessages({
  namespaces,
  children,
}: {
  namespaces: readonly Namespace[]
  children: ReactNode
}) {
  const messages = await getMessages()
  return (
    <NextIntlClientProvider messages={pickNamespaces(messages, namespaces)}>
      {children}
    </NextIntlClientProvider>
  )
}

function pickNamespaces(
  messages: Messages,
  namespaces: readonly Namespace[]
): Partial<Messages> {
  return Object.fromEntries(namespaces.map((ns) => [ns, messages[ns]]))
}

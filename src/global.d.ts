import type messages from './shared/i18n/messages/en.json'
import type { formats } from './shared/i18n/request'
import type { routing } from './shared/i18n/routing'

declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof messages
    Locale: (typeof routing.locales)[number]
    // Makes named format strings ('short', 'currency', …) type-checked and
    // autocompleted. `formats` is the single source of truth in request.ts.
    Formats: typeof formats
  }
}

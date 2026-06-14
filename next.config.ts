import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/shared/i18n/request.ts')

const nextConfig: NextConfig = {
  // Don't advertise the framework in HTTP responses.
  poweredByHeader: false,

  // Minimal defensive headers. CSP is NOT included here — a strict CSP
  // is project-specific (third-party scripts, inline styles, etc.) and
  // wrong defaults break the app. Add one in your real project tailored
  // to your scripts/images/connect sources.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent MIME-type sniffing — browser uses declared Content-Type.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Clickjacking protection — site can be framed only by itself.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // Restrict Referer leakage to other origins.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)

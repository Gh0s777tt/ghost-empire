// Sentry edge-runtime init (middleware / edge routes). No-ops without SENTRY_DSN.
// AUDIT [6]: DSN is split — browser uses build-time NEXT_PUBLIC_SENTRY_DSN, not
// this runtime var; set both. Full rationale in sentry.server.config.ts.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});

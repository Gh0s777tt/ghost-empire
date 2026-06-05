// Sentry server-side init. No-ops unless SENTRY_DSN is set (so dev / self-host /
// missing-DSN deployments are unaffected). Set SENTRY_DSN in Vercel env to activate.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});

// Sentry browser-side init (Next instrumentation-client hook). No-ops unless
// NEXT_PUBLIC_SENTRY_DSN is set at BUILD time (NEXT_PUBLIC_* is inlined), so
// dev / missing-DSN deployments ship zero telemetry. Errors-only on purpose:
// tracing/replay stay off to keep the client bundle and traffic lean — server
// and edge already sample traces in sentry.server/edge.config.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

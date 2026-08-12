// Sentry server-side init. No-ops unless SENTRY_DSN is set (so dev / self-host /
// missing-DSN deployments are unaffected). Set SENTRY_DSN in Vercel env to activate.
//
// AUDIT [6] — two gotchas of the current (deliberately minimal) wiring:
// 1. The DSN is SPLIT: server+edge read runtime `SENTRY_DSN` (here), the browser
//    reads BUILD-time `NEXT_PUBLIC_SENTRY_DSN` (src/instrumentation-client.ts).
//    Setting only SENTRY_DSN silently leaves client-side errors invisible —
//    configure BOTH in Vercel env (and note NEXT_PUBLIC_* needs a redeploy to
//    take effect, it is inlined at build).
// 2. next.config.ts intentionally does NOT use `withSentryConfig` (CHANGELOG
//    #~1289: verified `next build` unchanged without it; source-map upload was
//    logged as an optional next step). Cost of the deferral: unsymbolicated
//    client stacks, no release/suspect-commit association, and no `tunnelRoute`
//    (ad blockers drop direct *.ingest.de.sentry.io events, biasing browser
//    error volume down). Adopting the wrapper needs a SENTRY_AUTH_TOKEN and a
//    build-pipeline decision — owner's call, tracked by the audit, not smuggled
//    in here.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});

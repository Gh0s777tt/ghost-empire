// src/lib/logger.ts
// Tiny structured logger — JSON lines in production (filterable in Vercel / any
// log viewer by the `level` field), human-readable in dev. Zero deps.
// Replaces ad-hoc `console.*` in server event paths (webhooks/cron/award) so
// logs carry a consistent shape: level · scope · msg · time · context.
//
// Level threshold: env `LOG_LEVEL` (debug|info|warn|error) overrides the
// default (info in production, debug elsewhere). Read per-call so it stays
// testable and respects runtime env changes.

type Level = "debug" | "info" | "warn" | "error";
type Context = Record<string, unknown>;

const WEIGHT: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const env = process.env.LOG_LEVEL as Level | undefined;
  if (env && env in WEIGHT) return WEIGHT[env];
  return process.env.NODE_ENV === "production" ? WEIGHT.info : WEIGHT.debug;
}

/** Normalize an unknown thrown value into loggable context (drops stack in prod). */
export function errContext(e: unknown): Context {
  if (e instanceof Error) {
    return process.env.NODE_ENV === "production"
      ? { err: e.message }
      : { err: e.message, stack: e.stack };
  }
  return { err: String(e) };
}

function emit(level: Level, scope: string, msg: string, ctx?: Context): void {
  if (WEIGHT[level] < threshold()) return;
  const hasCtx = !!ctx && Object.keys(ctx).length > 0;
  let line: string;
  if (process.env.NODE_ENV === "production") {
    line = JSON.stringify({ level, scope, msg, time: new Date().toISOString(), ...(hasCtx ? ctx : {}) });
  } else {
    line = `[${level.toUpperCase()}] ${scope}: ${msg}${hasCtx ? " " + JSON.stringify(ctx) : ""}`;
  }
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

/** Create a scoped logger. `scope` replaces the old `"[scope]"` console prefixes. */
export function createLogger(scope: string) {
  return {
    debug: (msg: string, ctx?: Context) => emit("debug", scope, msg, ctx),
    info: (msg: string, ctx?: Context) => emit("info", scope, msg, ctx),
    warn: (msg: string, ctx?: Context) => emit("warn", scope, msg, ctx),
    /** `error(msg, err?, ctx?)` — `err` (any thrown value) is folded into context. */
    error: (msg: string, err?: unknown, ctx?: Context) =>
      emit("error", scope, msg, { ...(err !== undefined ? errContext(err) : {}), ...(ctx ?? {}) }),
  };
}

export type Logger = ReturnType<typeof createLogger>;

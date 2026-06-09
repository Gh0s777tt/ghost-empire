// src/app/api/health/route.ts
// Public health check for uptime monitors (UptimeRobot / cron-job.org / Vercel).
// Returns 200 when the app + DB are reachable, 503 if the DB ping fails.
// No auth and no sensitive data — safe to expose.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  let db: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "error";
  }
  const healthy = db === "ok";
  // Config presence (booleans + lengths only — NO secret values) so ops can see if the shared
  // Redis (Upstash) is wired without exposing credentials. `redis: false` → falls back to in-memory.
  const redis = {
    url: Boolean(process.env.UPSTASH_REDIS_REST_URL),
    token: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
    urlLen: (process.env.UPSTASH_REDIS_REST_URL ?? "").length,
    tokenLen: (process.env.UPSTASH_REDIS_REST_TOKEN ?? "").length,
  };
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", db, redis, time: new Date().toISOString() },
    { status: healthy ? 200 : 503 },
  );
}

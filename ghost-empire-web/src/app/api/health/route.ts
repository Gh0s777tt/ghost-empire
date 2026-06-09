// src/app/api/health/route.ts
// Public health check for uptime monitors (UptimeRobot / cron-job.org / Vercel).
// Returns 200 when the app + DB are reachable, 503 if the DB ping fails.
// No auth and no sensitive data — safe to expose.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  let db: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "error";
  }
  const healthy = db === "ok";
  // `redis` = is the shared Upstash store wired? (boolean only — no values). false → in-memory fallback.
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", db, redis: hasRedis, time: new Date().toISOString() },
    { status: healthy ? 200 : 503 },
  );
}

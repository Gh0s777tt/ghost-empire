// src/app/api/telemetry/client-error/route.ts
// Minimal client-error sink (Sentry-lite, zero deps/secrets): the browser reports
// uncaught errors here and we log them at error level — which lands in Vercel's
// function logs. Hard rate-limit per IP; payload truncated; no auth (errors happen
// for guests too); nothing is stored in the DB.
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("client-error");

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const rl = await rateLimit(`cerr:${ip}`, 10, 60_000);
  if (!rl.allowed) return new NextResponse(null, { status: 429 });

  let body: { message?: unknown; stack?: unknown; url?: unknown; ua?: unknown } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const message = String(body.message ?? "").slice(0, 500);
  if (!message) return new NextResponse(null, { status: 400 });

  log.error("client error", undefined, {
    message,
    stack: String(body.stack ?? "").slice(0, 2000),
    url: String(body.url ?? "").slice(0, 300),
    ua: String(body.ua ?? "").slice(0, 200),
  });
  return new NextResponse(null, { status: 204 });
}

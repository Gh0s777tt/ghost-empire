// src/app/api/webhooks/custom/[id]/route.ts
// GENERIC inbound donation webhook, one URL per portal (#donation-layer).
//
// This is the answer to "no matter which donation tool a streamer uses". Providers with no API at
// all (buycoffee.to, Patronite, suppi) or ones we have not written an adapter for can still reach us
// through whatever the streamer already has: the provider's own webhook, an automation (Zapier /
// Make / n8n / IFTTT), or a small script. They POST a tiny JSON body and we ingest it.
//
// TRUST — the important part. A shared secret proves the SENDER knows our secret; it does NOT prove
// a payment happened, because the streamer (or their automation) composes the body. So these events
// are ALWAYS `unverified`: they are recorded and surface in the existing admin reconciliation queue,
// where the streamer credits them deliberately — the same queue that already handles codeless
// donations. That keeps "anyone can wire anything" from becoming "anyone can mint currency".
//
// Body: { amount, currency?, donorName?, message?, eventId?, donatedAt? }
//   amount     — major units ("25", "25.00", "25,00") unless amountMinor is used
//   amountMinor — integer grosze/cents (takes precedence)
//   eventId    — provider's id; when absent we synthesize a deterministic one so retries dedupe
import { NextResponse, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { ingestDonation } from "@/lib/donations/ingest";
import { clampText, normalizeCurrency, syntheticExternalId } from "@/lib/donations/types";
import { minorFromMajor, MAX_AMOUNT_MINOR } from "@/lib/donations/fx";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpOrNull } from "@/lib/http";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("webhook.custom");

function secretsMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const ip = clientIpOrNull(req) ?? "unknown";
  const limit = await rateLimit(`custom-webhook:${ip}`, 120, 60_000, { failClosed: true });
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const integration = await prisma.donationIntegration
    .findUnique({ where: { id }, select: { id: true, tenantId: true, provider: true, enabled: true, secretEnc: true } })
    .catch(() => null);
  if (!integration || !integration.enabled || integration.provider !== "custom") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const expected = decryptSecret(integration.secretEnc);
  if (!expected) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  // Secret may come as a bearer token or an explicit header — whichever the streamer's tool can send.
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : (req.headers.get("x-donation-secret") ?? "").trim();
  if (!provided || !secretsMatch(provided, expected)) {
    log.warn("custom webhook rejected: secret mismatch", { id });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch {
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }

  const currency = normalizeCurrency(body.currency);
  const rawMinor = body.amountMinor !== undefined ? Number(body.amountMinor) : NaN;
  const amountMinor = Number.isFinite(rawMinor) && rawMinor > 0
    ? Math.round(rawMinor)
    : minorFromMajor(body.amount, currency);
  // Bound here too: an oversized amount must be a 400, never a Postgres int4 error (a 5xx makes
  // senders retry in a loop).
  if (amountMinor <= 0 || amountMinor > MAX_AMOUNT_MINOR) return NextResponse.json({ error: "bad_amount" }, { status: 400 });
  const donorName = clampText(body.donorName ?? body.name, 200) ?? "Anon";
  const message = clampText(body.message, 2000);
  const when = typeof body.donatedAt === "string" ? new Date(body.donatedAt) : new Date();
  const donatedAt = Number.isNaN(when.getTime()) ? new Date() : when;
  // Namespaced BY INTEGRATION: the sender chooses eventId freely, so without this one portal could
  // squat ids in the shared "custom:" namespace and make another portal's genuine donations look
  // like duplicates (silently dropped).
  const senderId = clampText(body.eventId ?? body.id, 140);
  const providerEventId = `${integration.id}:${senderId ?? syntheticExternalId("custom", { donorName, amountMinor, currency, donatedAt })}`;

  const result = await ingestDonation(
    {
      provider: "custom",
      providerEventId,
      donorName,
      message,
      amountMinor,
      currency,
      donatedAt,
      // NEVER "verified" here: the body is composed by the sender, so it proves knowledge of the
      // secret, not that money moved. Crediting stays a deliberate human action in the admin queue.
      trust: "unverified",
      raw: body,
    },
    integration.tenantId,
  );

  after(() => prisma.donationIntegration
    .update({ where: { id }, data: { lastEventAt: new Date(), lastError: null } })
    .catch(() => {}));

  // Tell the caller plainly that this awaits review, so an integrator isn't surprised by no credit.
  return NextResponse.json({ ok: true, status: result.status, note: "queued for streamer review (unverified source)" });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "custom-donation-webhook" });
}

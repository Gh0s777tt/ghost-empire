// src/app/api/webhooks/kofi/[id]/route.ts
// Inbound Ko-fi webhook, one URL per portal (#donation-layer).
//
// FLOW: the streamer opens their own Ko-fi dashboard (ko-fi.com/manage/webhooks), pastes THIS url —
// which carries their DonationIntegration id — and copies Ko-fi's `verification_token` into our
// admin panel. Ko-fi then POSTs every donation here, including that token, which we compare against
// the stored secret. That comparison is the entire trust boundary: it is what lets a Ko-fi event
// MINT currency, so it happens here and nowhere else (the adapter deliberately cannot bypass it).
//
// Fully self-serve per tenant: no OAuth app, no partner approval, nothing shared between portals.
//
// Ko-fi posts application/x-www-form-urlencoded with a single `data` field holding the JSON.
import { NextResponse, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { parseKofi } from "@/lib/donations/kofi";
import { ingestDonation } from "@/lib/donations/ingest";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpOrNull } from "@/lib/http";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("webhook.kofi");

/** Constant-time string compare that tolerates differing lengths without leaking them. */
function secretsMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false; // length differs → not equal; nothing secret revealed
  return timingSafeEqual(ba, bb);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // Unauthenticated endpoint → throttle per source before touching the DB. failClosed: this path
  // can mint currency, so a limiter outage must not turn it into an open firehose.
  // Keyed on the INTEGRATION, not the IP: every portal's Ko-fi deliveries come from Ko-fi's small
  // egress range, so an IP key would let one busy portal 429 everyone else. A wider per-IP
  // backstop guards the unknown-id case.
  const ip = clientIpOrNull(req) ?? "unknown";
  const perIp = await rateLimit(`kofi-webhook-ip:${ip}`, 600, 60_000, { failClosed: true });
  if (!perIp.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const limit = await rateLimit(`kofi-webhook:${id}`, 120, 60_000, { failClosed: true });
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const integration = await prisma.donationIntegration
    .findUnique({ where: { id }, select: { id: true, tenantId: true, provider: true, enabled: true, secretEnc: true, trust: true } })
    .catch(() => null);
  // Uniform 404 for missing/disabled/wrong-provider — never confirm which case it was.
  if (!integration || !integration.enabled || integration.provider !== "kofi") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const expected = decryptSecret(integration.secretEnc);
  if (!expected) {
    log.warn("kofi integration has no verification token stored", { id });
    return NextResponse.json({ error: "not_configured" }, { status: 409 });
  }

  // Ko-fi sends form-encoded `data=<json>`; accept a raw JSON body too (their docs have varied).
  let payload: Record<string, unknown>;
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      payload = (await req.json()) as Record<string, unknown>;
    } else {
      const form = await req.formData();
      const raw = form.get("data");
      payload = JSON.parse(typeof raw === "string" ? raw : "{}") as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }

  const token = typeof payload.verification_token === "string" ? payload.verification_token : "";
  if (!token || !secretsMatch(token, expected)) {
    log.warn("kofi webhook rejected: token mismatch", { id });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = parseKofi(payload);
  if (!parsed.ok) {
    // Not an error on Ko-fi's side (e.g. a shop order) — ack so they stop retrying.
    return NextResponse.json({ ok: true, ignored: parsed.reason });
  }

  // Token verified above → the ONE place a Ko-fi event gains the right to mint. The owner can
  // still DOWNGRADE a provider to review-everything via DonationIntegration.trust; it can never
  // upgrade trust, so a misconfigured row cannot grant minting rights.
  const trust = integration.trust === "verified" ? "verified" as const : "unverified" as const;
  const result = await ingestDonation({ ...parsed.donation, trust }, integration.tenantId);
  after(() => prisma.donationIntegration
    .update({ where: { id }, data: { lastEventAt: new Date(), lastError: null } })
    .catch(() => {})); // bookkeeping only — must never fail an ingested donation

  return NextResponse.json({ ok: true, status: result.status });
}

/** Ko-fi (and humans) may GET the URL to check it is alive. */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "kofi-webhook" });
}

// src/app/api/webhooks/paymedia/route.ts
// PayMedia donation webhook.
//
// Configuration:
//   PayMedia panel → Webhooks → POST URL: https://ghost-empire-web.vercel.app/api/webhooks/paymedia
//   Copy "webhook secret" / "signing key" → set as PAYMEDIA_WEBHOOK_SECRET env var
//
// Expected payload (PayMedia standard):
//   {
//     "event": "payment.completed",
//     "payment_id": "pm_xyz123",
//     "amount": 50.00,                 // in PLN (or paymedia.gross_amount)
//     "currency": "PLN",
//     "status": "completed",
//     "metadata": { "username": "gh0s77tt" }  // or "discord_id" — set on donation form
//   }
//
// Signature header: X-PayMedia-Signature (HMAC-SHA256 of body using webhook secret)
//
// Mapping: 1 PLN = 100 Ghost Tokens — via the SHARED rate (lib/donation-rate), same on every rail.
import { NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { extractIp } from "@/lib/audit";
import { createLogger } from "@/lib/logger";
import { matchDonationToUser } from "@/lib/streamlabs";
import { gtFromPln } from "@/lib/donation-rate";
import { sendDonationReceipt } from "@/lib/email-receipts";

const log = createLogger("paymedia");

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  try {
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const secret = process.env.PAYMEDIA_WEBHOOK_SECRET;
  if (!secret) {
    log.error("PAYMEDIA_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get("x-paymedia-signature");

  if (!verifySignature(body, signature, secret)) {
    log.warn("invalid signature", { ip: extractIp(req) });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: {
    event?: string;
    payment_id?: string;
    amount?: number;
    gross_amount?: number;
    currency?: string;
    status?: string;
    metadata?: { username?: string; discord_id?: string; message?: string };
    created_at?: string;
  };
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only process completed payments (ignore created/pending/refunded for now)
  const isCompleted =
    payload.event === "payment.completed" ||
    payload.status === "completed" ||
    payload.status === "success";
  if (!isCompleted) {
    return NextResponse.json({ ok: true, ignored: "not completed" });
  }

  // Extract amount (PayMedia może używać amount lub gross_amount)
  const amountPLN = Number(payload.amount ?? payload.gross_amount ?? 0);
  if (!Number.isFinite(amountPLN) || amountPLN <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  if (payload.currency && payload.currency !== "PLN") {
    return NextResponse.json({ ok: true, ignored: "non-PLN currency", currency: payload.currency });
  }

  // VERIFIED-ONLY matching (#audit4 — same policy as Streamlabs #612): auto-credit ONLY when
  // the donor put their personal donation code (GE-XXXXXX) in the metadata. The username /
  // discord_id fields are attacker-controllable (set on the donation form), so matching on them
  // could aim GT + Donator status at ANY account. Codeless donations → manual admin queue.
  const searchText = [payload.metadata?.message, payload.metadata?.username, payload.metadata?.discord_id]
    .filter(Boolean)
    .join(" ");
  const match = await matchDonationToUser(searchText, null); // donationCode is globally unique = the verification
  if (!match) {
    // Persist the codeless donation to the admin reconciliation queue (like Streamlabs) instead of
    // dropping it — real PLN was received; the streamer can credit the donor later. Idempotent via
    // the unique externalId (a webhook retry loses with P2002, which we swallow). Best-effort: never
    // fail the webhook on a persistence hiccup. tenantId=null → founder queue (per-tenant PayMedia
    // config is a separate follow-up; PayMedia is founder-scoped today).
    if (payload.payment_id) {
      await prisma.donation
        .create({
          data: {
            tenantId: null,
            externalId: `paymedia:${payload.payment_id}`,
            source: "paymedia",
            donorName: String(payload.metadata?.username ?? "Anon").slice(0, 200),
            message: typeof payload.metadata?.message === "string" ? payload.metadata.message.slice(0, 2000) : null,
            amountGrosze: Math.round(amountPLN * 100),
            currency: "PLN",
            donatedAt: new Date(),
            userId: null,
            matchedAt: null,
            matchType: null,
            tokensGranted: 0,
          },
        })
        .catch((e: unknown) => {
          const code = typeof e === "object" && e !== null && "code" in e ? (e as { code: string }).code : "";
          if (code !== "P2002") log.error("failed to persist unmatched paymedia donation", { paymentId: payload.payment_id, error: e instanceof Error ? e.message : String(e) });
        });
    }
    log.warn("payment — no valid donation code (queued for manual reconciliation)", { paymentId: payload.payment_id, amountPLN });
    return NextResponse.json({
      ok: true,
      warning: "user_not_matched",
      paymentId: payload.payment_id,
      amount: amountPLN,
    });
  }
  const userId = match.userId;

  // Idempotency, soft pre-check — catches retries of payments credited before
  // `externalId` existed (legacy rows carry the payment_id only in `reason`).
  if (payload.payment_id) {
    const existing = await prisma.transaction.findFirst({
      // ANCHORED to the paymedia prefix. This used to be an unanchored `contains`, which now that the
      // donation layer writes provider-controlled text into `reason` could match an unrelated row —
      // and a false positive here silently DROPS a real payment (neither credited nor queued).
      where: { OR: [{ externalId: `paymedia:${payload.payment_id}` }, { reason: `paymedia:${payload.payment_id}` }] },
    });
    if (existing) {
      return NextResponse.json({ ok: true, ignored: "already processed", paymentId: payload.payment_id });
    }
  }

  // Mint tokens — shared rate + cap so a malformed upstream amount can't mint absurd GT (was uncapped).
  const tokensGranted = gtFromPln(amountPLN);
  const donationGrosze = Math.round(amountPLN * 100); // store in grosze for precision

  // Idempotency LOCK — the unique `externalId` makes a concurrent retry of the
  // same payment lose with P2002, rolling back the whole transaction (the
  // pre-check above can't stop two parallel deliveries on its own).
  try {
    await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId: userId,
          type: "earn",
          amount: tokensGranted,
          reason: `paymedia:${payload.payment_id ?? "unknown"}`,
          externalId: payload.payment_id ? `paymedia:${payload.payment_id}` : null,
          status: "completed",
          note: payload.metadata?.message?.slice(0, 500) ?? null,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          isDonator: true,
          totalDonated: { increment: donationGrosze },
          tokens: { increment: tokensGranted },
          totalEarned: { increment: tokensGranted },
        },
      }),
      prisma.notification.create({
        data: {
          userId: userId,
          type: "system",
          title: `Dzięki za donację ${amountPLN.toFixed(2)} PLN!`,
          message: `Otrzymałeś ${tokensGranted.toLocaleString("pl-PL")} GT. Jesteś teraz oficjalnie Donatorem.`,
          icon: "❤️",
          link: "/profile",
        },
      }),
      // Ledger row (parity with Streamlabs) — makes PayMedia income visible in the reconciliation
      // queue, top-supporters and economy views. Only when a payment_id exists (Donation.externalId
      // is required + unique → idempotent; P2002 rolls back alongside the Transaction). No id → skip
      // just the ledger row; the mint above still happens.
      ...(payload.payment_id
        ? [
            prisma.donation.create({
              data: {
                tenantId: null,
                externalId: `paymedia:${payload.payment_id}`,
                source: "paymedia",
                donorName: (payload.metadata?.username ?? "Anon").slice(0, 200),
                message: payload.metadata?.message?.slice(0, 2000) ?? null,
                amountGrosze: donationGrosze,
                currency: "PLN",
                donatedAt: new Date(),
                userId,
                matchedAt: new Date(),
                matchType: match.matchType,
                tokensGranted,
              },
            }),
          ]
        : []),
    ]);
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ ok: true, ignored: "already processed", paymentId: payload.payment_id });
    }
    throw e;
  }

  // Receipt / thank-you — AFTER the mint committed, off the response path (the provider gets its
  // ack immediately) and best-effort: sendDonationReceipt never throws and no-ops while email is
  // unconfigured. Repeat-giving driver + the supporter's proof of payment.
  // (route rejects non-PLN above, so PLN is the truly-charged currency here)
  after(() => sendDonationReceipt({ userId, tenantId: null, amount: amountPLN, currency: "PLN", tokensGranted }));

  return NextResponse.json({
    ok: true,
    userId,
    amountPLN,
    tokensGranted,
    paymentId: payload.payment_id,
  });
}

// Some webhook providers send a GET ping to verify endpoint is reachable
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "paymedia-webhook" });
}

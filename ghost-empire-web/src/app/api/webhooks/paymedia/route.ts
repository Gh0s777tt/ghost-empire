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
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { extractIp } from "@/lib/audit";
import { createLogger } from "@/lib/logger";
import { matchDonationToUser } from "@/lib/streamlabs";
import { gtFromPln } from "@/lib/donation-rate";

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
    log.warn("payment — no valid donation code (manual queue)", { paymentId: payload.payment_id, amountPLN });
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
      where: { reason: { contains: payload.payment_id } },
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
    ]);
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ ok: true, ignored: "already processed", paymentId: payload.payment_id });
    }
    throw e;
  }

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

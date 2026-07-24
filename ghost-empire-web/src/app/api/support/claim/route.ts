// src/app/api/support/claim/route.ts
// Viewer self-claim: "I tipped without the GE-code and got nothing."
//
// A codeless tip credits nothing and sits in the admin reconciliation queue until the streamer digs
// it out. This lets the supporter describe their payment so the streamer can match it. It DOES NOT
// CREDIT and it DOES NOT MATCH here — the assertion is stored as-is and matched SERVER-SIDE in the
// admin queue (lib/donation-claim.ts), where the streamer approves via the existing assign action.
//
// WHY NO MATCHING AT SUBMIT: the public /support wall prints exact donation amounts, so
// "amount + currency + date" is not a secret. An endpoint that replied "found / not found" would be
// an existence oracle for other people's payments — and a first-come claim could quietly occupy the
// only slot the admin sees. So every well-formed submission gets the SAME response, always.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { isValidAssertion, CLAIM_MAX_PENDING } from "@/lib/donation-claim";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("support-claim");

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  const userId = session.user.id;

  // failClosed: this is a pure abuse surface, so a limiter outage must not open it up.
  const limit = await rateLimit(`support-claim:${userId}`, 5, 60 * 60 * 1000, { failClosed: true });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Zbyt wiele zgłoszeń — spróbuj później" }, { status: 429, headers: rateLimitHeaders(limit) });
  }

  let body: { amount?: unknown; currency?: unknown; donatedOn?: unknown; evidence?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const assertion = {
    amount: typeof body.amount === "number" ? body.amount : Number(body.amount),
    currency: String(body.currency ?? "PLN").toUpperCase(),
    donatedOn: new Date(String(body.donatedOn ?? "")),
  };
  if (!isValidAssertion(assertion)) {
    // Shape-only rejection — depends solely on the request body, never on stored data.
    return NextResponse.json({ error: "Podaj poprawną kwotę, walutę i datę wpłaty (do 90 dni wstecz)" }, { status: 400 });
  }
  const evidence = typeof body.evidence === "string" ? body.evidence.trim().slice(0, 500) : null;

  // Fail CLOSED on an unresolved tenant: currentTenantId() swallows DB errors and returns null,
  // and a null here would file the claim outside any portal scope.
  const tid = await currentTenantId();
  if (!tid) return NextResponse.json({ error: "Portal niedostępny — spróbuj później" }, { status: 503 });

  const pending = await prisma.donationClaim.count({ where: { userId, status: "pending" } });
  if (pending >= CLAIM_MAX_PENDING) {
    return NextResponse.json({ error: `Masz już ${CLAIM_MAX_PENDING} otwarte zgłoszenia — poczekaj na ich rozpatrzenie` }, { status: 429 });
  }

  await prisma.donationClaim.create({
    data: {
      tenantId: tid,
      userId,
      amountGrosze: Math.round(assertion.amount * 100),
      currency: assertion.currency,
      donatedOn: assertion.donatedOn,
      evidence,
      status: "pending",
    },
  });

  log.info("donation claim filed", { userId, tenantId: tid });
  // Deliberately identical for every well-formed submission — reveals nothing about what exists.
  return NextResponse.json({ ok: true, status: "pending" });
}

// src/app/api/billing/portal/route.ts
// Stripe Customer Portal for the caller's OWN tenant — self-serve invoices,
// payment-method changes and cancellation, so a subscribed streamer never has
// to email the platform owner. Mirrors checkout's dry-wiring: 503 until the
// Stripe env lands, 409 without a portal, 400 before the first checkout (no
// Stripe customer exists yet — there is nothing to manage).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getStripe } from "@/lib/billing";
import { SITE } from "@/lib/site";
import { createLogger } from "@/lib/logger";

const log = createLogger("billing");

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "billing-not-configured" }, { status: 503 });
  }

  const rl = await rateLimit(`billing-portal:${session.user.id}`, 10, 10 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Za dużo prób — odczekaj chwilę" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const tenant = await prisma.tenant.findFirst({
    where: { ownerUserId: session.user.id },
    select: { stripeCustomerId: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Najpierw załóż portal w /onboarding" }, { status: 409 });
  }
  if (!tenant.stripeCustomerId) {
    return NextResponse.json({ error: "Brak subskrypcji do zarządzania — najpierw aktywuj plan" }, { status: 400 });
  }

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${SITE.url}/onboarding`,
    });
    return NextResponse.json({ ok: true, url: portal.url });
  } catch (e) {
    log.error("billing portal failed", e);
    return NextResponse.json({ error: "Nie udało się otworzyć panelu subskrypcji" }, { status: 502 });
  }
}

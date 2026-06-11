// src/app/api/billing/checkout/route.ts
// Start a Stripe Checkout (subscription) for the caller's OWN tenant.
// Dry-wired: 503 "billing-not-configured" until the Stripe env lands —
// the UI then keeps the trial flow. GET reports configuration status so
// clients can decide whether to show the "activate subscription" button.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getStripe, billingConfigured, priceIdFor, isBillingMonths } from "@/lib/billing";
import { normalizePlan } from "@/lib/entitlements";
import { SITE } from "@/lib/site";
import { createLogger } from "@/lib/logger";

const log = createLogger("billing");

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ configured: billingConfigured() });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "billing-not-configured" }, { status: 503 });
  }

  const rl = await rateLimit(`billing-checkout:${session.user.id}`, 10, 10 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Za dużo prób — odczekaj chwilę" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  let body: { plan?: string; months?: number };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }
  const plan = normalizePlan(body.plan);
  if (plan === "basic") {
    return NextResponse.json({ error: "Plan basic nie wymaga subskrypcji" }, { status: 400 });
  }
  if (!isBillingMonths(body.months)) {
    return NextResponse.json({ error: "Okres: 1, 3, 6 albo 12 miesięcy" }, { status: 400 });
  }
  const price = priceIdFor(plan, body.months);
  if (!price) {
    return NextResponse.json({ error: "Ten wariant planu nie jest jeszcze dostępny" }, { status: 400 });
  }

  // The subscription is for the caller's own portal (onboarding created it).
  const tenant = await prisma.tenant.findFirst({
    where: { ownerUserId: session.user.id },
    select: { id: true, slug: true, name: true, ownerEmail: true, stripeCustomerId: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Najpierw załóż portal w /onboarding" }, { status: 409 });
  }

  try {
    // One Stripe customer per tenant, created on first checkout.
    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: tenant.ownerEmail ?? undefined,
        name: tenant.name,
        metadata: { tenantId: tenant.id, slug: tenant.slug },
      });
      customerId = customer.id;
      await prisma.tenant.update({ where: { id: tenant.id }, data: { stripeCustomerId: customerId } });
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${SITE.url}/onboarding?billing=success`,
      cancel_url: `${SITE.url}/onboarding?billing=cancelled`,
      // The webhook reads these to know WHICH tenant/plan to activate.
      metadata: { tenantId: tenant.id, plan },
      subscription_data: { metadata: { tenantId: tenant.id, plan } },
    });

    return NextResponse.json({ ok: true, url: checkout.url });
  } catch (e) {
    log.error("checkout failed", e);
    return NextResponse.json({ error: "Nie udało się rozpocząć płatności" }, { status: 502 });
  }
}

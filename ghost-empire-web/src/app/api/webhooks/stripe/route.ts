// src/app/api/webhooks/stripe/route.ts
// Stripe webhook → tenant plan state. Dry-wired: 503 until STRIPE_WEBHOOK_SECRET
// is set. Signature-verified raw body (constructEvent). Handlers are idempotent
// by construction (absolute SET of plan/expiry/ids — replays converge), so no
// event-dedup table is needed.
//
// Vercel endpoint to register in the Stripe dashboard:
//   POST https://<prod-domain>/api/webhooks/stripe
// Events: checkout.session.completed, customer.subscription.updated,
//         customer.subscription.deleted
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, periodEndToExpiry } from "@/lib/billing";
import { normalizePlan } from "@/lib/entitlements";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("stripe-webhook");

/** current_period_end lives on the subscription's items in current API versions. */
function subPeriodEnd(sub: Stripe.Subscription): number | null {
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined;
  if (typeof item?.current_period_end === "number") return item.current_period_end;
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof legacy === "number" ? legacy : null;
}

async function tenantIdForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  if (sub.metadata?.tenantId) return sub.metadata.tenantId;
  const row = await prisma.tenant.findUnique({ where: { stripeSubscriptionId: sub.id }, select: { id: true } });
  if (row) return row.id;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const byCustomer = await prisma.tenant.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } });
  return byCustomer?.id ?? null;
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "billing-not-configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (e) {
    log.warn("invalid signature", { err: String(e) });
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        const tenantId = s.metadata?.tenantId;
        const plan = normalizePlan(s.metadata?.plan);
        if (!tenantId || plan === "basic") break;
        const subscriptionId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id ?? null;
        const customerId = typeof s.customer === "string" ? s.customer : s.customer?.id ?? null;
        // Activate immediately; the subscription.updated event that follows
        // stamps the precise period end.
        await prisma.tenant.updateMany({
          where: { id: tenantId },
          data: {
            plan,
            ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
            ...(customerId ? { stripeCustomerId: customerId } : {}),
          },
        });
        log.info("checkout completed", { tenantId, plan, subscriptionId });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const tenantId = await tenantIdForSubscription(sub);
        if (!tenantId) { log.warn("subscription without tenant", { sub: sub.id }); break; }
        const periodEnd = subPeriodEnd(sub);
        const active = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
        const plan = normalizePlan(sub.metadata?.plan);
        await prisma.tenant.updateMany({
          where: { id: tenantId },
          data: {
            stripeSubscriptionId: sub.id,
            ...(active && plan !== "basic" ? { plan } : {}),
            ...(periodEnd ? { planExpiresAt: periodEndToExpiry(periodEnd) } : {}),
          },
        });
        log.info("subscription updated", { tenantId, status: sub.status, periodEnd });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const tenantId = await tenantIdForSubscription(sub);
        if (!tenantId) break;
        // Expire now → effectivePlan() degrades the portal to basic (#423).
        await prisma.tenant.updateMany({
          where: { id: tenantId },
          data: { planExpiresAt: new Date() },
        });
        log.info("subscription deleted → basic", { tenantId });
        break;
      }

      default:
        // Unhandled event types are fine — Stripe retries only on non-2xx.
        break;
    }
  } catch (e) {
    log.error("handler failed", e, { type: event.type });
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// src/lib/billing.ts
// Stripe billing for tenant plans (SaaS Phase 6, final piece). DRY-WIRED:
// everything here degrades gracefully until the user pastes the secrets —
// `billingConfigured()` is false, the checkout route answers 503 and the UI
// keeps the no-card trial flow. The day STRIPE_SECRET_KEY (+ webhook secret
// + price ids) land in Vercel env, billing turns on with NO code change.
//
// Required env (see PR #427 for the exact checklist):
//   STRIPE_SECRET_KEY        — sk_live_… / sk_test_…
//   STRIPE_WEBHOOK_SECRET    — whsec_… (endpoint: POST /api/webhooks/stripe)
//   STRIPE_PRICE_<PLAN>_<MONTHS>M — 12 price ids (PRO|ELITE|BASIC × 1|3|6|12),
//     e.g. STRIPE_PRICE_PRO_3M=price_123. Unset combos are simply not offered.
import Stripe from "stripe";
import type { Plan } from "@/lib/entitlements";

let client: Stripe | null | undefined;

/** Lazily-constructed Stripe client; null until STRIPE_SECRET_KEY is set. */
export function getStripe(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  client = key ? new Stripe(key) : null;
  return client;
}

export function billingConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export const BILLING_MONTHS = [1, 3, 6, 12] as const;
export type BillingMonths = (typeof BILLING_MONTHS)[number];

export function isBillingMonths(n: unknown): n is BillingMonths {
  return n === 1 || n === 3 || n === 6 || n === 12;
}

/** Env-mapped Stripe price id for a plan+duration; null when not offered. */
export function priceIdFor(plan: Plan, months: BillingMonths): string | null {
  return process.env[`STRIPE_PRICE_${plan.toUpperCase()}_${months}M`] || null;
}

// Premium-offer constants (currencies, trial, display prices) live in the Stripe-free
// `lib/premium.ts` so the client bundle never pulls in the Stripe SDK. See #744.

/**
 * Stripe gives `current_period_end` in unix SECONDS; we stamp planExpiresAt
 * with a 24h grace so a renewal webhook that arrives late never flickers the
 * tenant down to basic between periods.
 */
export function periodEndToExpiry(unixSeconds: number, graceHours = 24): Date {
  return new Date(unixSeconds * 1000 + graceHours * 60 * 60 * 1000);
}

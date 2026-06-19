// scripts/check-stripe.ts
// Preflight for "Stripe day": verifies the billing env is fully and correctly
// configured BEFORE you flip Stripe on, so you never ship half-wired billing.
// READ-ONLY — it only lists/retrieves; it never creates or changes anything in
// Stripe. Run it locally (with .env) or anywhere your Vercel env is present:
//   npx tsx scripts/check-stripe.ts        (or: npm run stripe:check)
//
// Exit code: 0 when billing is either intentionally OFF (no secret key → the
// no-card trial mode) or fully valid; 1 when it's configured-but-broken.

// Load env BEFORE importing anything that reads it.
for (const f of [".env.local", ".env"]) {
  try { process.loadEnvFile(f); } catch { /* file absent — env already injected */ }
}

const PLANS = ["basic", "pro", "elite"] as const;
const MONTHS = [1, 3, 6, 12] as const;

/** Approx. months a recurring interval represents, for matching against the slot. */
function intervalMonths(interval: string, count: number): number {
  const per = interval === "year" ? 12 : interval === "month" ? 1 : interval === "week" ? 0.25 : 0;
  return per * count;
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;

  if (!key) {
    console.log("ℹ️  STRIPE_SECRET_KEY not set → billing is OFF (no-card trial mode).");
    console.log("    This is the safe default. To turn billing on, set STRIPE_SECRET_KEY,");
    console.log("    STRIPE_WEBHOOK_SECRET and the STRIPE_PRICE_* ids, then re-run this.");
    return;
  }

  const mode = key.startsWith("sk_live_") ? "LIVE" : key.startsWith("sk_test_") ? "TEST" : "UNKNOWN";
  console.log(`🔑 STRIPE_SECRET_KEY: present (${mode}${mode === "UNKNOWN" ? " — not sk_live_/sk_test_, double-check" : ""})`);
  console.log(
    whsec
      ? `🪝 STRIPE_WEBHOOK_SECRET: present${whsec.startsWith("whsec_") ? "" : " (⚠ doesn't start with whsec_)"}`
      : "❌ STRIPE_WEBHOOK_SECRET: MISSING — /api/webhooks/stripe will reject every event",
  );
  const domain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  console.log(domain ? `🌐 NEXT_PUBLIC_ROOT_DOMAIN: ${domain}` : "ℹ️  NEXT_PUBLIC_ROOT_DOMAIN not set (per-tenant subdomains off — separate from billing)");

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(key);

  // 1) The key actually authenticates.
  try {
    await stripe.prices.list({ limit: 1 });
    console.log("✅ Secret key authenticates with Stripe");
  } catch (e) {
    console.log(`❌ Secret key rejected by Stripe: ${(e as Error).message}`);
    process.exit(1);
  }

  // 2) Every configured plan × duration resolves to an active recurring price.
  let configured = 0;
  let broken = 0;
  console.log("\nPrices (plan × duration):");
  for (const plan of PLANS) {
    for (const m of MONTHS) {
      const id = process.env[`STRIPE_PRICE_${plan.toUpperCase()}_${m}M`];
      const label = `  ${plan.toUpperCase().padEnd(5)} ${String(m).padStart(2)}M`;
      if (!id) { console.log(`${label}  —   (not offered)`); continue; }
      configured++;
      try {
        const price = await stripe.prices.retrieve(id);
        const notes: string[] = [];
        if (!price.active) notes.push("INACTIVE");
        if (!price.recurring) notes.push("not recurring (one-time price?)");
        else if (intervalMonths(price.recurring.interval, price.recurring.interval_count) !== m) {
          notes.push(`billed ${price.recurring.interval_count}×${price.recurring.interval}, expected ~${m} months`);
        }
        if (notes.length) { broken++; console.log(`${label}  ⚠   ${id}  — ${notes.join(", ")}`); }
        else console.log(`${label}  ✅  ${id}  (${((price.unit_amount ?? 0) / 100).toFixed(2)} ${price.currency.toUpperCase()})`);
      } catch (e) {
        broken++;
        console.log(`${label}  ❌  ${id}  — ${(e as Error).message}`);
      }
    }
  }

  console.log(`\nSummary: ${configured} price(s) configured, ${broken} with problems.`);
  if (configured === 0) {
    console.log("⚠️  Secret key is set but NO prices are configured — checkout has nothing to sell.");
    process.exit(1);
  }
  if (broken > 0 || !whsec) {
    console.log("⚠️  Billing is configured but NOT fully ready — fix the items above before going live.");
    process.exit(1);
  }
  console.log("✅ Stripe billing looks ready to go live.");
}

main().catch((e) => { console.error(e); process.exit(1); });

// Module scope so the top-level `main` doesn't collide with the other scripts.
export {};

// src/lib/email-receipts.ts
// Viewer-facing transactional emails (#emails) — today: the donation receipt / thank-you, the
// single strongest driver of repeat giving and the artifact a supporter needs as proof of payment.
// Built on the dormant Resend sender (lib/email.ts): with no RESEND_API_KEY/EMAIL_FROM every call
// is a silent no-op, so this ships safe and activates the moment the env is set.
//
// WHITE-LABEL: the copy carries the TENANT's brand + currency name (never the founder's) — see the
// platform rule in CLAUDE.md. Tenant-set strings are owner-controlled, so they are HTML-ESCAPED
// before they reach the markup (an apostrophe or `<` in a portal name must not break/inject the mail).
//
// RECEIPT INTEGRITY: the amount is rendered in the currency the donor was ACTUALLY charged. Never
// substitute a converted value — `economy.plnFromCurrency` is a flat synthetic rate (no live FX),
// so printing it as "N PLN" would state a number the donor never paid on a proof-of-payment doc.
//
// The template builder is PURE (no I/O) → unit-tested; sendDonationReceipt does the lookups and is
// strictly best-effort: it must never throw into, or delay, a money transaction.
import { prisma } from "@/lib/prisma";
import { sendEmail, emailConfigured } from "@/lib/email";
import { escapeHtml } from "@/lib/digest";
import { DEFAULT_TENANT_SLUG, FALLBACK_TENANT } from "@/lib/tenant";
import { createLogger } from "@/lib/logger";

const log = createLogger("email-receipts");

export type DonationReceiptInput = {
  /** Portal brand (tenant.name) — never the founder's. */
  brandName: string;
  /** Portal currency name (tenant.tokenName), e.g. "Ghost Tokens" or "Neo Coins". */
  tokenName: string;
  /** Amount the donor was actually charged (major units), in `currency`. */
  amount: number;
  /** ISO code the donor was charged in (e.g. "PLN", "USD") — rendered verbatim, never converted. */
  currency: string;
  /** Portal currency granted for it. */
  tokensGranted: number;
  /** UI language — only "pl" and "en" are written; anything else falls back to EN. */
  locale?: string;
};

/**
 * Build the donation receipt/thank-you email. Pure — returns the subject + HTML body.
 * Bilingual inline (PL/EN) like the other new surfaces, so it needs no locale-file changes.
 * @remarks unit-tested in `__tests__/email-receipts.test.ts` (escaping, currency, both locales).
 */
export function donationReceiptEmail(input: DonationReceiptInput): { subject: string; html: string } {
  const pl = (input.locale ?? "pl").startsWith("pl");
  const brand = escapeHtml(input.brandName);
  const token = escapeHtml(input.tokenName);
  const currency = escapeHtml(String(input.currency || "PLN").toUpperCase().slice(0, 8));
  const amount = input.amount.toFixed(2);
  const granted = Math.max(0, Math.round(input.tokensGranted)).toLocaleString(pl ? "pl-PL" : "en-US");

  const subject = pl
    ? `Dziękujemy za wsparcie ${headerSafe(input.brandName)}!`
    : `Thank you for supporting ${headerSafe(input.brandName)}!`;
  const t = pl
    ? {
        title: "Dziękujemy za wsparcie! ❤️",
        intro: `Twoja wpłata dla <strong>${brand}</strong> została potwierdzona.`,
        amountLabel: "Kwota",
        grantedLabel: "Otrzymujesz",
        footer: `To potwierdzenie Twojej wpłaty. ${brand} dziękuje!`,
      }
    : {
        title: "Thank you for your support! ❤️",
        intro: `Your donation to <strong>${brand}</strong> has been confirmed.`,
        amountLabel: "Amount",
        grantedLabel: "You received",
        footer: `This is your donation receipt. ${brand} says thanks!`,
      };

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#0a0a0a;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e4e4e7">
  <div style="max-width:520px;margin:0 auto;border:1px solid #27272a;border-radius:12px;padding:28px;background:#111113">
    <h1 style="margin:0 0 12px;font-size:20px;color:#fff">${t.title}</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#a1a1aa">${t.intro}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:8px 0;color:#a1a1aa">${t.amountLabel}</td><td style="padding:8px 0;text-align:right;color:#fff;font-weight:700">${amount} ${currency}</td></tr>
      <tr><td style="padding:8px 0;color:#a1a1aa">${t.grantedLabel}</td><td style="padding:8px 0;text-align:right;color:#fff;font-weight:700">${granted} ${token}</td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:12px;color:#71717a">${t.footer}</p>
  </div></body></html>`;

  return { subject, html };
}

/** Brand for a header context — strip anything markup-ish/CRLF and cap the length. */
function headerSafe(s: string): string {
  return s.replace(/[<>\r\n]/g, "").slice(0, 80);
}

/**
 * Send a donation receipt to the crediting user — STRICTLY best-effort.
 *
 * Never throws and never blocks money: call it AFTER the mint transaction commits (ideally inside
 * `after()`), and it silently no-ops when email is unconfigured or the user has no address (common
 * with OAuth logins). Resolves the portal's own brand/currency so a white-label supporter gets
 * their streamer's naming — including for `tenantId: null` rows (legacy/founder-scoped rails like
 * PayMedia), which resolve to the DEFAULT portal, never to a different tenant's brand.
 */
export async function sendDonationReceipt(args: {
  userId: string;
  tenantId: string | null;
  /** Amount actually charged, in `currency` (NOT converted). */
  amount: number;
  currency: string;
  tokensGranted: number;
  /** UI language for the copy; defaults to the app default (pl). There is no per-user locale column. */
  locale?: string;
}): Promise<void> {
  if (!emailConfigured()) return; // dormant without env — skip the lookups entirely
  try {
    const [user, tenant] = await Promise.all([
      prisma.user.findUnique({ where: { id: args.userId }, select: { email: true } }),
      // null tenantId = legacy/founder row → resolve the DEFAULT portal's brand (works outside a
      // request scope, unlike getCurrentTenant, so it is safe in the donation-poll cron).
      args.tenantId
        ? prisma.tenant.findUnique({ where: { id: args.tenantId }, select: { name: true, tokenName: true } })
        : prisma.tenant.findUnique({ where: { slug: DEFAULT_TENANT_SLUG }, select: { name: true, tokenName: true } }),
    ]);
    if (!user?.email) return; // OAuth accounts often have no email — nothing to send to

    const { subject, html } = donationReceiptEmail({
      brandName: tenant?.name ?? FALLBACK_TENANT.name,
      tokenName: tenant?.tokenName ?? FALLBACK_TENANT.tokenName,
      amount: args.amount,
      currency: args.currency,
      tokensGranted: args.tokensGranted,
      locale: args.locale ?? "pl",
    });
    await sendEmail({ to: user.email, subject, html });
  } catch (e) {
    // Best-effort: a receipt must never surface as an error on a successful donation.
    log.warn("donation receipt failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

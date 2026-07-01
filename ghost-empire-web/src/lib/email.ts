// src/lib/email.ts
// Minimal transactional email sender (#773) — Resend REST API via fetch, zero SDK deps.
// DORMANT without env: set RESEND_API_KEY (+ EMAIL_FROM, a sender on a domain verified in
// Resend) and sends start working; without them emailConfigured() is false and callers
// no-op. Never throws — callers treat email as best-effort.
import { createLogger } from "@/lib/logger";

const log = createLogger("email");

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export type SendEmailInput = { to: string; subject: string; html: string };

/**
 * Send one email through Resend. Returns true on acceptance (2xx), false otherwise
 * (missing config, network error, provider rejection) — logged, never thrown.
 */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      log.warn("resend rejected an email", { status: res.status, to: to.replace(/(.{2}).*(@.*)/, "$1***$2") });
      return false;
    }
    return true;
  } catch (e) {
    log.warn("email send failed", { error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

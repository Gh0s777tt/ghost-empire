// src/app/api/admin/2fa/route.ts
// Opt-in TOTP enrollment for the CURRENT admin (step-up for sensitive actions
// is enforced separately). The secret is stored encrypted at rest and only
// returned to the client once, during setup, so the authenticator can capture it.
//   GET                       → { enabled }
//   POST { action: "setup" }  → { secret, otpauthUri }  (generate + persist pending)
//   POST { action: "enable",  code } → confirm a code, mark enabled
//   POST { action: "disable", code } → confirm a code, clear the secret
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { encryptSecretStrict, decryptSecret } from "@/lib/crypto";
import { generateTotpSecret, otpauthUri, formatSecret, verifyTotp } from "@/lib/totp";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

const ISSUER = "GHOST EMPIRE";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const u = await prisma.user.findUnique({ where: { id: auth.userId }, select: { totpEnabledAt: true } });
  return NextResponse.json({ enabled: u?.totpEnabledAt != null });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const userId = auth.userId;

  // Brute-force guard on code attempts (enable/disable).
  const rl = await rateLimit(`2fa:${userId}`, 10, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Za szybko. Spróbuj za chwilę." }, { status: 429, headers: rateLimitHeaders(rl) });

  let body: { action?: string; code?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 }); }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, email: true, totpSecret: true, totpEnabledAt: true },
  });
  if (!me) return NextResponse.json({ error: "Brak konta" }, { status: 404 });
  const enabled = me.totpEnabledAt != null;

  if (body.action === "setup") {
    if (enabled) return NextResponse.json({ error: "2FA jest już włączone" }, { status: 409 });
    const secret = generateTotpSecret();
    // Persist pending (encrypted) so the enable step can verify against it.
    await prisma.user.update({ where: { id: userId }, data: { totpSecret: encryptSecretStrict(secret), totpEnabledAt: null } });
    const account = me.username || me.email || "admin";
    const uri = otpauthUri(secret, account, ISSUER);
    // Scannable QR (PNG data-url) so the admin can point a phone camera instead of typing the secret.
    const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
    return NextResponse.json({ secret: formatSecret(secret), otpauthUri: uri, qrDataUrl });
  }

  if (body.action === "enable") {
    if (enabled) return NextResponse.json({ error: "2FA jest już włączone" }, { status: 409 });
    const secret = decryptSecret(me.totpSecret);
    if (!secret) return NextResponse.json({ error: "Najpierw uruchom konfigurację" }, { status: 400 });
    if (!verifyTotp(secret, String(body.code ?? ""), Date.now())) {
      return NextResponse.json({ error: "Nieprawidłowy kod" }, { status: 401, headers: rateLimitHeaders(rl) });
    }
    await prisma.user.update({ where: { id: userId }, data: { totpEnabledAt: new Date() } });
    return NextResponse.json({ ok: true, enabled: true });
  }

  if (body.action === "disable") {
    if (!enabled) return NextResponse.json({ error: "2FA nie jest włączone" }, { status: 409 });
    const secret = decryptSecret(me.totpSecret);
    if (!secret || !verifyTotp(secret, String(body.code ?? ""), Date.now())) {
      return NextResponse.json({ error: "Nieprawidłowy kod" }, { status: 401, headers: rateLimitHeaders(rl) });
    }
    await prisma.user.update({ where: { id: userId }, data: { totpSecret: null, totpEnabledAt: null } });
    return NextResponse.json({ ok: true, enabled: false });
  }

  return NextResponse.json({ error: "action: setup | enable | disable" }, { status: 400 });
}

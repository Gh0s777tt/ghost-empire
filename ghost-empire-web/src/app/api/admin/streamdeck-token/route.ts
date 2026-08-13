// src/app/api/admin/streamdeck-token/route.ts
// Self-serve provisioning of a portal's Stream Deck / Companion trigger token (`Tenant.streamDeckToken`).
//
// Sibling of `bot-secret/route.ts` and intentionally almost identical — same reveal-once shape,
// same owner/admin gate — but for a NARROWER credential. Two invariants:
//   1. The token is returned EXACTLY ONCE, in the response that mints it. GET answers with a
//      boolean + a 4-char hint, never the value; the column stays out of TenantBrand so it can
//      never leak into branding/OG/any viewer payload.
//   2. Only this portal's owner/admin (or the platform owner) may touch it — `canManageTenantBotSecret`,
//      reused because the authorization bar is the same (manage this tenant's server secrets).
//
// Why NO 2FA step-up (unlike bot-secret): the bot secret gates the ECONOMY (mint currency, resolve
// identities, drive the casino), so rotating it clears the same bar as granting an admin role. The
// Stream Deck token can do exactly one thing — enqueue overlay alerts via /api/streamdeck/trigger —
// and never touches money or admin. An admin session + rate-limit + reveal-once + audit is the
// proportionate bar; a 2FA re-prompt to mint an "overlay test alert" token would be friction without
// a matching risk. Encrypted at-rest with `encryptSecret` (AES-256-GCM), same as botSecret.
//
//   GET                        → { configured, hint, slug, name }
//   POST { action: "rotate" }  → { ok, token, hint }   ← the one and only reveal
//   POST { action: "clear" }   → { ok }                ← disables Stream Deck triggers for the portal
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { randomToken } from "@/lib/secure-rng";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { canManageTenantBotSecret, maskBotSecret } from "@/lib/tenants";
import { logAdminAction } from "@/lib/audit";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** 32 bytes = 256 bits, base64url → a 43-char bearer token that pastes into a Companion/SD action. */
const TOKEN_BYTES = 32;

const TENANT_FIELDS = { id: true, slug: true, name: true, ownerUserId: true, streamDeckToken: true } as const;

type TargetTenant = { id: string; slug: string; name: string; ownerUserId: string | null; streamDeckToken: string | null };

type Caller = { userId: string; tenantId: string | null; isAdmin: boolean; isPlatformOwner: boolean };

/**
 * Which portal is this admin provisioning? The HOST portal wins (the panel they're standing in);
 * only when that isn't theirs to manage do we fall back to the portal they OWN, so an owner who
 * landed on the apex still reaches their own settings. Mirrors `bot-secret`'s `resolveTarget`.
 */
async function resolveTarget(caller: Caller): Promise<TargetTenant | null> {
  const hostId = await currentTenantId();
  if (hostId) {
    const host = await prisma.tenant.findUnique({ where: { id: hostId }, select: TENANT_FIELDS });
    if (host && canManageTenantBotSecret(caller, host)) return host;
  }
  const owned = await prisma.tenant.findFirst({ where: { ownerUserId: caller.userId }, select: TENANT_FIELDS });
  if (owned && canManageTenantBotSecret(caller, owned)) return owned;
  return null;
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const target = await resolveTarget(auth);
  if (!target) return NextResponse.json({ error: "Nie masz portalu do skonfigurowania" }, { status: 404 });

  return NextResponse.json({
    configured: Boolean(target.streamDeckToken),
    // A tail fingerprint so the admin can match this against the token pasted into their Stream
    // Deck / Companion — never the value. Decrypt before masking (column holds ciphertext;
    // decryptSecret passes legacy plaintext through unchanged).
    hint: maskBotSecret(decryptSecret(target.streamDeckToken)),
    slug: target.slug,
    name: target.name,
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Minting a credential is cheap for us and noisy in the audit log — cap it well above any honest
  // use (a rotation is a once-in-a-while act) but below a script's appetite.
  const rl = await rateLimit(`streamdeck-token:${auth.userId}`, 10, 5 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Za szybko. Spróbuj za chwilę." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  let body: { action?: unknown };
  try { body = (await req.json()) as typeof body; } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }
  const action = body.action;
  if (action !== "rotate" && action !== "clear") {
    return NextResponse.json({ error: "Nieznana akcja" }, { status: 400 });
  }

  const target = await resolveTarget(auth);
  if (!target) return NextResponse.json({ error: "Nie masz portalu do skonfigurowania" }, { status: 404 });

  if (action === "clear") {
    await prisma.tenant.update({ where: { id: target.id }, data: { streamDeckToken: null } });
    await logAdminAction({
      adminId: auth.userId,
      action: "rotate_streamdeck_token",
      targetType: "tenant_streamdeck_token",
      targetId: target.id,
      details: { slug: target.slug, op: "clear" },
      req,
    });
    return NextResponse.json({ ok: true });
  }

  const token = randomToken(TOKEN_BYTES);
  // Encrypt at-rest; the response below carries PLAINTEXT `token` — the one and only reveal.
  await prisma.tenant.update({ where: { id: target.id }, data: { streamDeckToken: encryptSecret(token) } });
  await logAdminAction({
    adminId: auth.userId,
    action: "rotate_streamdeck_token",
    targetType: "tenant_streamdeck_token",
    targetId: target.id,
    // `replaced` distinguishes a first provision from a rotation. The value itself is never logged.
    details: { slug: target.slug, op: "rotate", replaced: Boolean(target.streamDeckToken) },
    req,
  });

  // The only response that ever carries the token. `no-store` so no proxy or bfcache keeps a copy.
  return NextResponse.json(
    { ok: true, token, hint: maskBotSecret(token) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

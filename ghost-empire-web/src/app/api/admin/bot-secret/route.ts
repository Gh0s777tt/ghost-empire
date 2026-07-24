// src/app/api/admin/bot-secret/route.ts
// Self-serve provisioning of a portal's own bot credential (`Tenant.botSecret`).
//
// Why this exists: #599 added the column and `verifyBotSecretForTenant`, but nothing could
// WRITE it — the platform-owner tenant editor's field allow-list deliberately excludes it,
// so a streamer had to have the row edited in the DB by hand. This is that missing surface.
//
// Two invariants this file exists to hold:
//   1. The generated secret is returned EXACTLY ONCE, in the response that mints it. There is
//      no read-back path: GET answers with a boolean + a 4-char hint, never the value. The
//      column stays out of TenantBrand/getCurrentTenant() so it can't leak into branding,
//      an OG image or any viewer-facing payload.
//   2. Only this portal's owner/admin (or the platform owner) may touch it —
//      `canManageTenantBotSecret`, which is stricter than requireAdmin() alone.
//
// Stored as plaintext on purpose: `verifyBotSecretForTenant` compares the incoming Bearer
// against the column in constant time, exactly like `IntegrationConfig.overlayToken`. Wrapping
// it in encryptSecret() would make every future verifier responsible for remembering to
// decrypt, and would take bot auth down on ENCRYPTION_KEY drift — a worse trade for a
// rotatable bearer token that is never read back.
//
//   GET                             → { configured, hint, slug, name, globalFallback }
//   POST { action: "rotate" }       → { ok, secret, hint }   ← the one and only reveal
//   POST { action: "clear" }        → { ok }                 ← falls back to global BOT_SECRET
import { NextResponse } from "next/server";
import { requireAdmin, requireStepUp } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { randomToken } from "@/lib/secure-rng";
import { canManageTenantBotSecret, maskBotSecret } from "@/lib/tenants";
import { logAdminAction } from "@/lib/audit";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** 32 bytes = 256 bits, base64url → a 43-char token that pastes into a `.env` line. */
const BOT_SECRET_BYTES = 32;

const TENANT_FIELDS = { id: true, slug: true, name: true, ownerUserId: true, botSecret: true } as const;

type TargetTenant = { id: string; slug: string; name: string; ownerUserId: string | null; botSecret: string | null };

type Caller = { userId: string; tenantId: string | null; isAdmin: boolean; isPlatformOwner: boolean };

/**
 * Which portal is this admin provisioning, if any?
 *
 * The HOST portal wins — that's the one whose panel they're standing in, and it's what the
 * platform owner means when they open a tenant's subdomain. Only when the host portal isn't
 * theirs to manage do we fall back to the portal they OWN, so a streamer who landed on the
 * apex (or the platform's own storefront brand) still reaches their own settings, exactly
 * like `/api/onboarding/my`. Null = this admin has no portal to provision here.
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
    configured: Boolean(target.botSecret),
    // A tail fingerprint so the admin can match this against their bot's .env — never the value.
    hint: maskBotSecret(target.botSecret),
    slug: target.slug,
    name: target.name,
    // Boolean only: whether a shared global BOT_SECRET exists to fall back on when this
    // portal has none. Tells the UI whether "clear" is safe or would lock the bot out.
    globalFallback: Boolean(process.env.BOT_SECRET),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Minting credentials is cheap for us and noisy in the audit log — cap it well above any
  // honest use (a rotation is a once-in-a-while act) but below a script's appetite.
  const rl = await rateLimit(`bot-secret:${auth.userId}`, 10, 5 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Za szybko. Spróbuj za chwilę." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  let body: { action?: unknown; totpCode?: unknown };
  try { body = (await req.json()) as typeof body; } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }
  const action = body.action;
  if (action !== "rotate" && action !== "clear") {
    return NextResponse.json({ error: "Nieznana akcja" }, { status: 400 });
  }

  const target = await resolveTarget(auth);
  if (!target) return NextResponse.json({ error: "Nie masz portalu do skonfigurowania" }, { status: 404 });

  // Same bar as granting an admin role: whoever holds this secret can post awards and game
  // results into the portal's economy as the bot. No-op unless this admin enabled 2FA.
  const step = await requireStepUp(auth.userId, typeof body.totpCode === "string" ? body.totpCode : null);
  if (!step.ok) return NextResponse.json({ error: step.error, stepUpRequired: true }, { status: step.status });

  if (action === "clear") {
    await prisma.tenant.update({ where: { id: target.id }, data: { botSecret: null } });
    await logAdminAction({
      adminId: auth.userId,
      action: "rotate_bot_secret",
      targetType: "tenant_bot_secret",
      targetId: target.id,
      details: { slug: target.slug, op: "clear" },
      req,
    });
    return NextResponse.json({ ok: true });
  }

  const secret = randomToken(BOT_SECRET_BYTES);
  await prisma.tenant.update({ where: { id: target.id }, data: { botSecret: secret } });
  await logAdminAction({
    adminId: auth.userId,
    action: "rotate_bot_secret",
    targetType: "tenant_bot_secret",
    targetId: target.id,
    // `replaced` distinguishes a first provision from a rotation. The value itself is never
    // logged — the audit log is readable by every admin of the portal.
    details: { slug: target.slug, op: "rotate", replaced: Boolean(target.botSecret) },
    req,
  });

  // The only response that ever carries the secret. `no-store` so no proxy or bfcache
  // keeps a copy of it after the admin closes the panel.
  return NextResponse.json(
    { ok: true, secret, hint: maskBotSecret(secret) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

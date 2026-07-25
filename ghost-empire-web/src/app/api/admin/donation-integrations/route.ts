// src/app/api/admin/donation-integrations/route.ts
// Owner-facing management of this portal's donation integrations (#donation-layer).
//
// Without this the ingest routes are dead code: they 404 until a DonationIntegration row exists and
// is enabled. Here the streamer generates their per-portal webhook URL, saves the provider's token,
// and turns it on — the self-serve flow the whole white-label design depends on.
//
// SECURITY: tenant-scoped (a portal admin only ever sees/edits their own rows), secrets are stored
// encrypted and NEVER returned — the API reports only whether a secret is set. `trust` is derived
// from the provider, never accepted from the client, so nobody can grant minting rights by POSTing.
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { currentTenantId } from "@/lib/tenant";
import { encryptSecret } from "@/lib/crypto";
import { logAdminAction } from "@/lib/audit";
import { parseTipplyWidgetId } from "@/lib/donations/tipply";

export const dynamic = "force-dynamic";

/**
 * Providers manageable from the panel, with the trust each one may reach.
 *
 * `maxTrust` is the ceiling the SERVER assigns — Ko-fi signs its payloads with a token we can check,
 * so it may reach "verified"; a generic webhook body is composed by the sender, so it is capped at
 * "unverified" and can only ever land in the review queue. This table is the authority; the client
 * cannot influence it.
 */
/** `needs` tells the panel WHICH field to ask for: a provider token/secret, or a public id we poll. */
const PROVIDERS: Record<string, { label: string; maxTrust: "verified" | "unverified"; kind: "inbound" | "poll"; needs: "secret" | "widgetId"; help: string }> = {
  kofi: {
    label: "Ko-fi",
    maxTrust: "verified",
    kind: "inbound",
    needs: "secret",
    help: "W Ko-fi: Settings → API (ko-fi.com/manage/webhooks) → wklej Webhook URL poniżej i skopiuj tutaj Verification Token.",
  },
  custom: {
    label: "Dowolne narzędzie (webhook / Zapier / Make / n8n)",
    maxTrust: "unverified",
    kind: "inbound",
    needs: "secret",
    help: "Wyślij POST na URL poniżej z nagłówkiem Authorization: Bearer <sekret> i ciałem {\"amount\":25,\"currency\":\"PLN\",\"donorName\":\"...\",\"message\":\"...\"}. Wpłaty z tego źródła zawsze wymagają Twojego zatwierdzenia.",
  },
  tipply: {
    label: "Tipply",
    maxTrust: "unverified",
    kind: "poll",
    needs: "widgetId",
    help: "Tipply nie ma oficjalnego API. W Tipply: Konfigurator → powiadomienie o wiadomości → skopiuj link widgetu (TIP_ALERT) i wklej go tutaj. Odpytujemy publiczny endpoint tego widgetu; wpłaty zawsze wymagają Twojego zatwierdzenia.",
  },
};

/** Path only — the UI prefixes the portal's own origin, so this works on every white-label domain. */
function webhookPath(provider: string, id: string): string | null {
  return provider === "kofi" ? `/api/webhooks/kofi/${id}` : provider === "custom" ? `/api/webhooks/custom/${id}` : null;
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();

  const rows = await prisma.donationIntegration
    .findMany({
      where: { ...(tid ? { tenantId: tid } : { tenantId: null }) },
      select: { id: true, provider: true, enabled: true, trust: true, secretEnc: true, externalRef: true, lastEventAt: true, lastError: true },
      orderBy: { provider: "asc" },
    })
    .catch(() => []);

  return NextResponse.json({
    providers: Object.entries(PROVIDERS).map(([key, p]) => ({ key, label: p.label, help: p.help, maxTrust: p.maxTrust, needs: p.needs })),
    integrations: rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      enabled: r.enabled,
      trust: r.trust,
      // Never the secret itself — only whether one is stored.
      hasSecret: Boolean(r.secretEnc),
      externalRef: r.externalRef,
      webhookPath: webhookPath(r.provider, r.id),
      lastEventAt: r.lastEventAt?.toISOString() ?? null,
      lastError: r.lastError,
    })),
  });
}

/** POST { action: "save", provider, secret?, enabled? } | { action: "rotate"|"delete", provider } */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();

  let body: { action?: string; provider?: string; secret?: unknown; externalRef?: unknown; enabled?: unknown };
  try { body = (await req.json()) as typeof body; } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const provider = String(body.provider ?? "");
  const meta = PROVIDERS[provider];
  if (!meta) return NextResponse.json({ error: "Nieznany dostawca" }, { status: 400 });

  // NB: we look the row up with findFirst rather than the (tenantId, provider) compound unique —
  // Postgres treats NULLs as distinct, so a compound unique cannot address the tenantId=null
  // (legacy/founder) row at all. findFirst handles both cases uniformly.
  const current = await prisma.donationIntegration
    .findFirst({ where: { tenantId: tid ?? null, provider }, select: { id: true, secretEnc: true, externalRef: true } })
    .catch(() => null);

  if (body.action === "delete") {
    if (current) await prisma.donationIntegration.delete({ where: { id: current.id } }).catch(() => {});
    await logAdminAction({ adminId: auth.userId, action: "set_user_role", targetType: "donation_integration", details: { provider, op: "delete" }, req });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "rotate") {
    // Only meaningful for the generic webhook, where WE own the secret. For Ko-fi the token belongs
    // to the provider, so the streamer must paste the new value after rotating it on their side.
    if (provider !== "custom") return NextResponse.json({ error: "Ten dostawca dostarcza własny token — wklej go ponownie" }, { status: 400 });
    const fresh = randomBytes(24).toString("base64url");
    const row = current
      ? await prisma.donationIntegration.update({ where: { id: current.id }, data: { secretEnc: encryptSecret(fresh) }, select: { id: true } })
      : await prisma.donationIntegration.create({
          data: { tenantId: tid ?? null, provider, trust: meta.maxTrust, secretEnc: encryptSecret(fresh), enabled: false },
          select: { id: true },
        });
    await logAdminAction({ adminId: auth.userId, action: "set_user_role", targetType: "donation_integration", details: { provider, op: "rotate" }, req });
    // Returned ONCE, at the moment of creation — it is not readable afterwards.
    return NextResponse.json({ ok: true, secret: fresh, webhookPath: webhookPath(provider, row.id) });
  }

  if (body.action !== "save") return NextResponse.json({ error: "action: save | rotate | delete" }, { status: 400 });

  const secret = typeof body.secret === "string" ? body.secret.trim() : "";
  const enabled = body.enabled === true;

  // Poll-based providers identify the streamer by a PUBLIC id, not a secret. Validate its shape so a
  // typo is rejected here instead of turning into a cron that silently polls nothing forever.
  let externalRef: string | undefined;
  if (typeof body.externalRef === "string" && body.externalRef.trim()) {
    if (provider === "tipply") {
      const uuid = parseTipplyWidgetId(body.externalRef);
      if (!uuid) return NextResponse.json({ error: "Wklej link widgetu TIP_ALERT z Tipply (albo jego UUID)" }, { status: 400 });
      externalRef = uuid;
    } else {
      externalRef = body.externalRef.trim().slice(0, 200);
    }
  }

  // Refuse to enable an integration that has nothing to authenticate/identify it: for an inbound
  // webhook that would be an unauthenticated money-in URL; for a poll provider it would be a cron
  // with no target.
  if (meta.needs === "secret" && enabled && !secret && !current?.secretEnc) {
    return NextResponse.json({ error: "Najpierw zapisz token/sekret — bez niego nie można włączyć integracji" }, { status: 400 });
  }
  if (meta.needs === "widgetId" && enabled && !externalRef && !current?.externalRef) {
    return NextResponse.json({ error: "Najpierw wklej link widgetu — bez niego nie ma czego odpytywać" }, { status: 400 });
  }

  const row = current
    ? await prisma.donationIntegration.update({
        where: { id: current.id },
        data: {
          enabled,
          trust: meta.maxTrust, // server-assigned; a client can never raise it
          ...(secret ? { secretEnc: encryptSecret(secret) } : {}),
          ...(externalRef ? { externalRef } : {}),
          lastError: null,
        },
        select: { id: true },
      })
    : await prisma.donationIntegration.create({
        data: {
          tenantId: tid ?? null,
          provider,
          enabled,
          trust: meta.maxTrust,
          ...(secret ? { secretEnc: encryptSecret(secret) } : {}),
          ...(externalRef ? { externalRef } : {}),
        },
        select: { id: true },
      });

  await logAdminAction({
    adminId: auth.userId, action: "set_user_role", targetType: "donation_integration",
    details: { provider, op: "save", enabled, secretChanged: Boolean(secret) }, req,
  });
  return NextResponse.json({ ok: true, id: row.id, webhookPath: webhookPath(provider, row.id) });
}

// src/app/api/onboarding/my/route.ts
// Self-service for a tenant OWNER (Phase 6 follow-up): read your own portal's
// status and edit its branding. Deliberately narrower than the platform-owner
// API (/api/admin/tenants/[id]) — no slug changes, no plan/expiry changes
// (plans move via billing or the platform owner).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { effectivePlan, planHasFeature } from "@/lib/entitlements";
import { safeMediaUrl } from "@/lib/url-safe";
import { isBgPreset } from "@/lib/bg-presets";
import { parseHubLinks, sanitizeHubBio } from "@/lib/hub";
import { logAdminAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

const HEX = /^#[0-9a-f]{6}$/i;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }
  const t = await prisma.tenant.findFirst({
    where: { ownerUserId: session.user.id },
    select: {
      slug: true, name: true, shortName: true, ownerHandle: true,
      tokenName: true, tokenSymbol: true, brandColor: true, logoUrl: true,
      bgImageUrl: true,
      // Pola, które do tej pory umiał ustawić WYŁĄCZNIE właściciel platformy (#asymetria):
      // bez własnych `socialLinks` stopka i /hub cudzego portalu pokazują socjale założyciela.
      socialLinks: true, timezone: true, companionDefaultName: true, supportAlertMode: true,
      hubEnabled: true, hubBio: true, hubLinks: true,
      plan: true, planExpiresAt: true, createdAt: true,
      stripeSubscriptionId: true,
      _count: { select: { users: true } },
    },
  });
  if (!t) return NextResponse.json({ tenant: null });
  return NextResponse.json({
    tenant: {
      ...t,
      _count: undefined,
      hubLinks: parseHubLinks(t.hubLinks), // defensive: never hand the client a malformed blob
      // Boolean only — the raw Stripe id stays server-side.
      stripeSubscriptionId: undefined,
      hasSubscription: Boolean(t.stripeSubscriptionId),
      users: t._count.users,
      planExpiresAt: t.planExpiresAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      effectivePlan: effectivePlan(t.plan, t.planExpiresAt),
    },
  });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }
  const mine = await prisma.tenant.findFirst({
    where: { ownerUserId: session.user.id },
    select: { id: true, slug: true, plan: true, planExpiresAt: true },
  });
  if (!mine) return NextResponse.json({ error: "Nie masz jeszcze portalu" }, { status: 404 });

  // Custom white-label branding (name/token naming/logo/colour) is an ELITE feature.
  // Gate on the OWNER's tenant plan — NOT featureGateResponse(), which checks the Host
  // tenant (the owner may edit from the main domain, not their subdomain).
  if (!planHasFeature(effectivePlan(mine.plan, mine.planExpiresAt), "custom_branding")) {
    return NextResponse.json({ error: "Personalizacja brandingu jest dostępna w planie Elite" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  const str = (k: string, max: number, { allowEmptyNull = false } = {}) => {
    const v = body[k];
    if (typeof v !== "string") return;
    const t = v.trim();
    if (!t && allowEmptyNull) { data[k] = null; return; }
    if (t && t.length <= max) data[k] = t;
  };
  str("name", 60);
  str("shortName", 60);
  str("ownerHandle", 40, { allowEmptyNull: true });
  str("tokenName", 40);
  str("tokenSymbol", 8);
  str("logoUrl", 300, { allowEmptyNull: true });
  str("bgImageUrl", 300, { allowEmptyNull: true });
  // Owner is semi-trusted, but logoUrl renders site-wide as <img src> — only
  // accept absolute http(s) (drop javascript:/data:/tracking schemes).
  if (typeof data.logoUrl === "string") data.logoUrl = safeMediaUrl(data.logoUrl);
  // Streamer self-serve background (#audit3): validated IDENTICALLY to the platform-owner
  // route — bgImageUrl is EITHER a built-in "preset:<id>" template (kept verbatim,
  // allowlist-checked) or a custom image URL rendered as CSS url() (must be absolute http(s)).
  if (typeof data.bgImageUrl === "string" && !isBgPreset(data.bgImageUrl)) data.bgImageUrl = safeMediaUrl(data.bgImageUrl);
  if (typeof body.brandColor === "string" && HEX.test(body.brandColor.trim())) {
    data.brandColor = body.brandColor.trim();
  }
  // ── Pola, które do tej pory umiał ustawić WYŁĄCZNIE właściciel platformy ────────────────
  // Asymetria, nie polityka: kolumny i walidacja istniały od dawna w /api/admin/tenants/[id],
  // brakowało ich tutaj. Skutek był konkretny — bez własnych `socialLinks` stopka, kafelki /hub
  // i przycisk „oglądaj na żywo" cudzego portalu pokazywały socjale ZAŁOŻYCIELA, a streamer nie
  // miał jak tego zmienić bez proszenia operatora platformy.
  //
  // Walidacja przepisana CO DO ZNAKU z trasy właściciela platformy. To nie jest kosmetyka:
  // gdyby tu była luźniejsza, powstałaby druga, słabsza furtka do tych samych kolumn.
  //
  // `domain` świadomie POZA zakresem — jest `@unique` i mapuje Host→tenant, więc samoobsługa
  // bez weryfikacji DNS pozwoliłaby przejąć cudzy adres. Zostaje u właściciela platformy.
  str("companionDefaultName", 30, { allowEmptyNull: true });
  str("timezone", 64, { allowEmptyNull: true });
  // Strefa steruje godzinami na /schedule — odrzucamy śmieci zamiast zapisać nieużywalną strefę.
  // Puste → null (odczyt spada na Europe/Warsaw).
  if (typeof data.timezone === "string") {
    try { new Intl.DateTimeFormat(undefined, { timeZone: data.timezone }); }
    catch { return NextResponse.json({ error: "Nieprawidłowa strefa czasowa (IANA)" }, { status: 400 }); }
  }
  // Socjale portalu — tablica { platform (znany zbiór), url (http(s)) }; puste/null czyści.
  if (body.socialLinks !== undefined) {
    if (body.socialLinks === null || (Array.isArray(body.socialLinks) && body.socialLinks.length === 0)) {
      data.socialLinks = null;
    } else if (Array.isArray(body.socialLinks)) {
      const ALLOWED = new Set(["discord", "twitch", "kick", "youtube", "tiktok", "instagram", "x"]);
      const clean = body.socialLinks
        .filter((s): s is { platform: string; url: string } =>
          !!s && typeof s === "object" && typeof (s as { platform?: unknown }).platform === "string" && typeof (s as { url?: unknown }).url === "string")
        .map((s) => ({ platform: s.platform.toLowerCase().trim().slice(0, 20), url: safeMediaUrl(s.url.trim()) ?? "" }))
        .filter((s) => ALLOWED.has(s.platform) && s.url)
        .slice(0, 12);
      data.socialLinks = clean.length ? clean : null;
    }
  }
  if (typeof body.supportAlertMode === "string" && ["none", "bell", "overlay", "both"].includes(body.supportAlertMode)) {
    data.supportAlertMode = body.supportAlertMode;
  }

  // Link-in-bio Hub config (#hub). hubLinks/hubBio are re-validated here (never trust the client
  // blob), so the /hub page can render them raw. Present-but-absent keys are simply skipped.
  if (typeof body.hubEnabled === "boolean") data.hubEnabled = body.hubEnabled;
  if ("hubBio" in body) data.hubBio = sanitizeHubBio(body.hubBio);
  if (Array.isArray(body.hubLinks)) data.hubLinks = parseHubLinks(body.hubLinks);
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Brak zmian" }, { status: 400 });
  }

  await prisma.tenant.update({ where: { id: mine.id }, data });
  await logAdminAction({
    adminId: session.user.id,
    action: "set_user_role",
    targetType: "tenant_self_update",
    details: { slug: mine.slug, fields: Object.keys(data) },
    req,
  });
  return NextResponse.json({ ok: true });
}

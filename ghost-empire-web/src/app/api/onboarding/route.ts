// src/app/api/onboarding/route.ts
// Public tenant provisioning (Phase 6): a logged-in streamer reserves their own
// white-label portal. Creates the Tenant with a 14-day trial of the chosen plan;
// billing (Stripe) later stamps real periods, and the platform owner can extend
// manually via /admin#tenants meanwhile.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { validateTenantSlug } from "@/lib/tenants";
import { normalizePlan } from "@/lib/entitlements";
import { logAdminAction } from "@/lib/audit";
import { seedTenantContent } from "@/lib/tenant-seed";

export const dynamic = "force-dynamic";

const TRIAL_DAYS = 14;
const HEX = /^#[0-9a-f]{6}$/i;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }

  const rl = await rateLimit(`onboarding:${session.user.id}`, 3, 60 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Za dużo prób — spróbuj później" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  let body: {
    slug?: string; name?: string; ownerHandle?: string;
    tokenName?: string; tokenSymbol?: string; brandColor?: string; plan?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const slug = (body.slug ?? "").trim().toLowerCase();
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "Nazwa jest wymagana (max 60 znaków)" }, { status: 400 });
  }
  const slugErr = validateTenantSlug(slug);
  if (slugErr) {
    return NextResponse.json({
      error: slugErr === "reserved" ? "Ten adres jest zarezerwowany" : "Adres: 3-32 znaki, małe litery/cyfry/myślniki",
    }, { status: 400 });
  }

  // One portal per account (the platform owner can always provision more via admin).
  const mine = await prisma.tenant.findFirst({ where: { ownerUserId: session.user.id }, select: { slug: true } });
  if (mine) {
    return NextResponse.json({ error: "Masz już portal: " + mine.slug, slug: mine.slug }, { status: 409 });
  }
  const taken = await prisma.tenant.findUnique({ where: { slug } });
  if (taken) return NextResponse.json({ error: "Ten adres jest już zajęty" }, { status: 409 });

  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } });

  // The no-card 14-day trial grants at most Pro — Elite must go through billing,
  // otherwise a streamer could self-issue a free Elite trial (basic→basic, pro/elite→pro).
  const trialPlan = normalizePlan(body.plan) === "basic" ? "basic" : "pro";

  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name,
      shortName: name,
      ownerUserId: session.user.id,
      ownerEmail: me?.email ?? null,
      ownerHandle: body.ownerHandle?.trim().slice(0, 40) || null,
      tokenName: body.tokenName?.trim().slice(0, 40) || "Ghost Tokens",
      tokenSymbol: body.tokenSymbol?.trim().slice(0, 8) || "GT",
      ...(typeof body.brandColor === "string" && HEX.test(body.brandColor.trim())
        ? { brandColor: body.brandColor.trim() }
        : {}),
      plan: trialPlan,
      planExpiresAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  // Seed the fresh portal with the founder's engagement content — achievements, daily quests,
  // alert styling and a battle pass (#689/#690). Best-effort: each piece never throws (returns a
  // count), so it can't block provisioning.
  const seeded = await seedTenantContent(tenant.id);

  await logAdminAction({
    adminId: session.user.id,
    action: "set_user_role",
    targetType: "tenant_onboarding",
    details: { slug: tenant.slug, plan: tenant.plan, trialDays: TRIAL_DAYS, seeded },
    req,
  });

  return NextResponse.json({ ok: true, slug: tenant.slug, plan: tenant.plan, trialDays: TRIAL_DAYS });
}

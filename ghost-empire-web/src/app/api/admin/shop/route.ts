// src/app/api/admin/shop/route.ts
// PATCH — update fields of an existing ShopItem
// POST  — create new ShopItem
// DELETE — soft-delete (active=false)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";
import { currentTenantId } from "@/lib/tenant";

const VALID_CATEGORIES = ["games", "skins", "subs", "cosmetic", "experience"];
const VALID_TIERS = ["T1", "T2", "T3", "Prime", "OG", "DUAL"];

export async function PATCH(req: Request) {
  const auth = await requirePermission("manage_shop");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    id?: string;
    name?: string;
    description?: string;
    category?: string;
    price?: number;
    imageEmoji?: string;
    stock?: number;
    totalStock?: number;
    hot?: boolean;
    active?: boolean;
    featured?: boolean;
    requiresSubTier?: string | null;
    requiresMinLevel?: number | null;
    requiresMinMonths?: number | null;
    imageUrl?: string | null;
    requiresAchievement?: string | null;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: "Brak id" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const n = body.name.trim().slice(0, 200);
    if (!n) return NextResponse.json({ error: "Nazwa pusta" }, { status: 400 });
    data.name = n;
  }
  if (body.description !== undefined) data.description = body.description.trim().slice(0, 2000);
  if (body.category !== undefined) {
    if (!VALID_CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: `Category: ${VALID_CATEGORIES.join("|")}` }, { status: 400 });
    }
    data.category = body.category;
  }
  if (body.price !== undefined) {
    const p = Math.floor(Number(body.price));
    if (!Number.isFinite(p) || p < 1 || p > 100_000_000) {
      return NextResponse.json({ error: "Price 1-100,000,000" }, { status: 400 });
    }
    data.price = p;
  }
  if (body.imageEmoji !== undefined) data.imageEmoji = body.imageEmoji.slice(0, 16) || null;
  if (body.stock !== undefined) {
    const s = Math.floor(Number(body.stock));
    if (!Number.isFinite(s) || s < -1) {
      return NextResponse.json({ error: "Stock >= -1 (-1 = unlimited)" }, { status: 400 });
    }
    data.stock = s;
  }
  if (body.totalStock !== undefined) {
    const t = Math.floor(Number(body.totalStock));
    if (!Number.isFinite(t) || t < -1) {
      return NextResponse.json({ error: "totalStock >= -1" }, { status: 400 });
    }
    data.totalStock = t;
  }
  if (body.hot !== undefined) data.hot = !!body.hot;
  if (body.active !== undefined) data.active = !!body.active;
  if (body.featured !== undefined) data.featured = !!body.featured;
  if (body.requiresSubTier !== undefined) {
    if (body.requiresSubTier && !VALID_TIERS.includes(body.requiresSubTier)) {
      return NextResponse.json({ error: `requiresSubTier: ${VALID_TIERS.join("|")}` }, { status: 400 });
    }
    data.requiresSubTier = body.requiresSubTier || null;
  }
  if (body.requiresMinLevel !== undefined) {
    data.requiresMinLevel = body.requiresMinLevel ? Math.max(1, Math.min(100, Math.floor(body.requiresMinLevel))) : null;
  }
  if (body.requiresMinMonths !== undefined) {
    data.requiresMinMonths = body.requiresMinMonths ? Math.max(0, Math.floor(body.requiresMinMonths)) : null;
  }
  if (body.imageUrl !== undefined) {
    const u = (body.imageUrl ?? "").trim();
    if (u && !/^https?:\/\//i.test(u)) {
      return NextResponse.json({ error: "imageUrl musi zaczynać się od http(s)://" }, { status: 400 });
    }
    data.imageUrl = u ? u.slice(0, 1000) : null;
  }
  if (body.requiresAchievement !== undefined) {
    data.requiresAchievement = body.requiresAchievement ? String(body.requiresAchievement).slice(0, 100) : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Brak pól do aktualizacji" }, { status: 400 });
  }

  // Tenant-guarded update (can't edit another tenant's item).
  const tid = await currentTenantId();
  const r = await prisma.shopItem.updateMany({
    where: { id: body.id, ...(tid ? { tenantId: tid } : {}) },
    data,
  });
  if (r.count === 0) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
  const updated = await prisma.shopItem.findUnique({ where: { id: body.id } });

  await logAdminAction({
    adminId: auth.userId,
    action: "edit_shop_item",
    targetType: "shop_item",
    targetId: body.id,
    details: { changed: Object.keys(data), values: data },
    req,
  });

  return NextResponse.json({ ok: true, item: updated });
}

export async function POST(req: Request) {
  const auth = await requirePermission("manage_shop");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    name?: string;
    description?: string;
    category?: string;
    price?: number;
    imageEmoji?: string;
    stock?: number;
    totalStock?: number;
    hot?: boolean;
    featured?: boolean;
    requiresSubTier?: string | null;
    requiresMinLevel?: number | null;
    requiresMinMonths?: number | null;
    imageUrl?: string | null;
    requiresAchievement?: string | null;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const name = body.name?.trim().slice(0, 200);
  const description = body.description?.trim().slice(0, 2000);
  const category = body.category;
  const price = Math.floor(Number(body.price ?? 0));

  if (!name) return NextResponse.json({ error: "Nazwa wymagana" }, { status: 400 });
  if (!description) return NextResponse.json({ error: "Opis wymagany" }, { status: 400 });
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `Category: ${VALID_CATEGORIES.join("|")}` }, { status: 400 });
  }
  if (!Number.isFinite(price) || price < 1) {
    return NextResponse.json({ error: "Price >= 1" }, { status: 400 });
  }

  const stock = body.stock === undefined ? -1 : Math.floor(Number(body.stock));
  const totalStock = body.totalStock === undefined ? stock : Math.floor(Number(body.totalStock));

  const tid = await currentTenantId();
  const created = await prisma.shopItem.create({
    data: {
      ...(tid ? { tenantId: tid } : {}),
      name, description, category, price,
      imageEmoji: body.imageEmoji?.slice(0, 16) || "🎁",
      stock, totalStock,
      hot: !!body.hot,
      featured: !!body.featured,
      active: true,
      requiresSubTier: body.requiresSubTier && VALID_TIERS.includes(body.requiresSubTier) ? body.requiresSubTier : null,
      requiresMinLevel: body.requiresMinLevel ?? null,
      requiresMinMonths: body.requiresMinMonths ?? null,
      imageUrl: body.imageUrl && /^https?:\/\//i.test(body.imageUrl) ? body.imageUrl.slice(0, 1000) : null,
      requiresAchievement: body.requiresAchievement ? String(body.requiresAchievement).slice(0, 100) : null,
    },
  });

  await logAdminAction({
    adminId: auth.userId,
    action: "create_drop", // reusing for now — TODO add "create_shop_item"
    targetType: "shop_item",
    targetId: created.id,
    details: { name, category, price },
    req,
  });

  return NextResponse.json({ ok: true, item: created });
}

export async function DELETE(req: Request) {
  const auth = await requirePermission("manage_shop");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });

  const tid = await currentTenantId();
  await prisma.shopItem.updateMany({
    where: { id, ...(tid ? { tenantId: tid } : {}) },
    data: { active: false },
  });

  await logAdminAction({
    adminId: auth.userId,
    action: "deactivate_drop",
    targetType: "shop_item",
    targetId: id,
    req,
  });

  return NextResponse.json({ ok: true });
}

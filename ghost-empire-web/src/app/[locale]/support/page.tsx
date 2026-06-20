// src/app/[locale]/support/page.tsx
// Public "support / tip" page (#514) — the streamer's real-money methods (links,
// crypto wallets, bank/IBAN) with one-tap copy, reveal-on-click and QR codes. Public
// (no auth). Per-tenant. QR data-URLs are generated server-side from the `qrcode`
// dep so the client ships no QR library.
import { headers } from "next/headers";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { cacheJson } from "@/lib/redis";
import { currentTenantId, getCurrentTenant } from "@/lib/tenant";
import { cryptoUri, sepaQrPayload } from "@/lib/payment-methods";
import { Header } from "@/components/Header";
import { SupportClient } from "@/components/support/SupportClient";
import { SponsorStrip } from "@/components/support/SponsorStrip";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "support" });
  const tenant = await getCurrentTenant();
  return {
    title: t("metaTitle", { name: tenant.ownerHandle }),
    description: t("metaDesc", { name: tenant.ownerHandle }),
    alternates: localeAlternates("/support", locale),
  };
}

async function toQr(data: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(data, { margin: 1, width: 320, color: { dark: "#0a0a0a", light: "#ffffff" } });
  } catch {
    return null;
  }
}

// First token only (privacy), capped; null name → client shows a localized "Anonymous".
const firstName = (n: string | null) => {
  const s = (n ?? "").trim();
  if (!s) return null;
  return (s.includes(" ") ? s.split(" ")[0] : s).slice(0, 24);
};

/**
 * Everything on this page is public, non-personalized and slow-changing, yet it was 5
 * DB queries (incl. a groupBy) + CPU-bound per-method QR generation on EVERY visit. Cache
 * the whole shaped blob per tenant for 60s so visitors don't hammer the 3-connection pool.
 * #audit-v2 perf. (No Date fields cross the cache — only primitives + string data-URLs.)
 */
async function loadSupport(tid: string | null, brandName: string) {
  return cacheJson(`support:${tid ?? "_"}`, 60_000, async () => {
    const [methods, goalRow, supporterRows, topRows, sponsors] = await Promise.all([
      prisma.paymentMethod
        .findMany({
          where: { active: true, ...(tid ? { tenantId: tid } : {}) },
          orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        })
        .catch(() => []), // table not migrated yet → empty page (graceful)
      (tid ? prisma.supportGoal.findUnique({ where: { tenantId: tid } }) : prisma.supportGoal.findFirst())
        .catch(() => null),
      // Recent supporters wall (#529): last real-money tips (donation StreamAlerts). Name
      // only (first token, privacy) + amount — no donor message, so no moderation surface.
      prisma.streamAlert
        .findMany({
          where: { type: "donation", ...(tid ? { tenantId: tid } : {}) },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { actorName: true, amount: true, amountLabel: true },
        })
        .catch(() => []),
      // All-time top supporters (#530): donations summed per donor name (best-effort).
      prisma.streamAlert
        .groupBy({
          by: ["actorName"],
          where: { type: "donation", amount: { not: null }, actorName: { not: null }, ...(tid ? { tenantId: tid } : {}) },
          _sum: { amount: true },
          orderBy: { _sum: { amount: "desc" } },
          take: 5,
        })
        .catch(() => [] as { actorName: string | null; _sum: { amount: number | null } }[]),
      // Sponsors / brand partners (#538). Per-tenant; graceful before the table exists.
      prisma.sponsor
        .findMany({
          where: { active: true, ...(tid ? { tenantId: tid } : {}) },
          orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
          select: { name: true, url: true, logoUrl: true, note: true, tier: true, featured: true },
        })
        .catch(() => [] as { name: string; url: string; logoUrl: string | null; note: string | null; tier: string | null; featured: boolean }[]),
    ]);

    const goal = goalRow?.active && goalRow.target > 0
      ? { title: goalRow.title, target: goalRow.target, current: goalRow.current, currency: goalRow.currency }
      : null;
    const supporters = supporterRows.map((r) => ({ name: firstName(r.actorName), amount: r.amount, amountLabel: r.amountLabel }));
    const tipCurrency = supporterRows.find((r) => r.amountLabel)?.amountLabel ?? null;
    const topSupporters = topRows
      .map((r) => ({ name: firstName(r.actorName), total: r._sum.amount ?? 0 }))
      .filter((s): s is { name: string; total: number } => !!s.name && s.total > 0);

    // Shape + attach a per-method QR (crypto deep-link / SEPA payload / the link URL).
    const shaped = await Promise.all(
      methods.map(async (m) => {
        const qrData =
          m.kind === "crypto" ? cryptoUri(m.network, m.value)
          : m.kind === "bank" ? sepaQrPayload(m.network ?? brandName, m.value)
          : m.value; // link
        return {
          id: m.id,
          kind: m.kind as "link" | "crypto" | "bank",
          label: m.label,
          value: m.value,
          network: m.network,
          note: m.note,
          icon: m.icon,
          featured: m.featured,
          qr: await toQr(qrData),
        };
      }),
    );

    return { shaped, goal, supporters, topSupporters, sponsors, tipCurrency };
  });
}

export default async function SupportPage() {
  const tid = await currentTenantId();
  const tenant = await getCurrentTenant();

  const data = await loadSupport(tid, tenant.name);

  // Absolute URL for the page QR (host from the proxy headers). Host→URL is stable per
  // tenant, and the QR render is CPU-bound, so cache it per host (5 min).
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const pageUrl = host ? `${proto}://${host}/support` : "";
  const pageQr = pageUrl ? await cacheJson(`support:qr:${host}`, 300_000, () => toQr(pageUrl)) : null;

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/3 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <SupportClient
          owner={tenant.ownerHandle}
          brandName={tenant.name}
          logoUrl={tenant.logoUrl}
          methods={data.shaped}
          pageQr={pageQr}
          pageUrl={pageUrl}
          goal={data.goal}
          supporters={data.supporters}
          topSupporters={data.topSupporters}
          tipCurrency={data.tipCurrency}
        />
        <SponsorStrip sponsors={data.sponsors} />
      </main>
    </div>
  );
}

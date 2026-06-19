// src/app/[locale]/support/page.tsx
// Public "support / tip" page (#514) — the streamer's real-money methods (links,
// crypto wallets, bank/IBAN) with one-tap copy, reveal-on-click and QR codes. Public
// (no auth). Per-tenant. QR data-URLs are generated server-side from the `qrcode`
// dep so the client ships no QR library.
import { headers } from "next/headers";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { currentTenantId, getCurrentTenant } from "@/lib/tenant";
import { cryptoUri, sepaQrPayload } from "@/lib/payment-methods";
import { Header } from "@/components/Header";
import { SupportClient } from "@/components/support/SupportClient";
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

export default async function SupportPage() {
  const tid = await currentTenantId();
  const tenant = await getCurrentTenant();

  const [methods, goalRow] = await Promise.all([
    prisma.paymentMethod
      .findMany({
        where: { active: true, ...(tid ? { tenantId: tid } : {}) },
        orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      })
      .catch(() => []), // table not migrated yet → empty page (graceful)
    (tid ? prisma.supportGoal.findUnique({ where: { tenantId: tid } }) : prisma.supportGoal.findFirst())
      .catch(() => null),
  ]);
  const goal = goalRow?.active && goalRow.target > 0
    ? { title: goalRow.title, target: goalRow.target, current: goalRow.current, currency: goalRow.currency }
    : null;

  // Absolute URL for the page QR (host from the proxy headers).
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const pageUrl = host ? `${proto}://${host}/support` : "";
  const pageQr = pageUrl ? await toQr(pageUrl) : null;

  // Shape + attach a per-method QR (crypto deep-link / SEPA payload / the link URL).
  const shaped = await Promise.all(
    methods.map(async (m) => {
      const qrData =
        m.kind === "crypto" ? cryptoUri(m.network, m.value)
        : m.kind === "bank" ? sepaQrPayload(m.network ?? tenant.name, m.value)
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
          methods={shaped}
          pageQr={pageQr}
          pageUrl={pageUrl}
          goal={goal}
        />
      </main>
    </div>
  );
}

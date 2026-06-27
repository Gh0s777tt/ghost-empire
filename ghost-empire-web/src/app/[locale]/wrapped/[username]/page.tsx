// src/app/[locale]/wrapped/[username]/page.tsx
// Public Season "Wrapped" for a given user (#691) — visible to anyone (no auth). Renders the
// SAME WrappedClient in `isPublic` mode, which hides the private GT-flow card (spent is never
// shown publicly) and adds a "see your own" CTA. Powers a per-user OG card (opengraph-image.tsx
// in this folder) so a shared /wrapped/<username> link previews THAT user's season.
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { WrappedClient } from "@/components/wrapped/WrappedClient";
import { getWrapped } from "@/lib/wrapped";

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";
import { displayNick } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; locale: string }>;
}): Promise<Metadata> {
  const { username, locale } = await params;
  const t = await getTranslations({ locale, namespace: "wrapped" });
  const user = await prisma.user.findUnique({ where: { username }, select: { displayName: true, username: true } });
  if (!user) return { title: t("metaTitle") };
  const name = displayNick(user.displayName, user.username);
  return {
    title: t("publicMetaTitle", { name }),
    description: t("publicMetaDesc", { name }),
    alternates: localeAlternates(`/wrapped/${username}`, locale),
  };
}

export default async function PublicWrappedPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true, tenantId: true } });
  if (!user) notFound();
  const data = await getWrapped(user.id, user.tenantId);
  if (!data) notFound();

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full blur-[160px] opacity-20"
          style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <WrappedClient data={data} isAuthenticated isPublic />
      </main>
    </div>
  );
}

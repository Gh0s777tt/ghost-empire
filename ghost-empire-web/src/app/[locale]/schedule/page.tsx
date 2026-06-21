// src/app/schedule/page.tsx
// Public stream schedule — weekly view + countdown to next stream
import { prisma } from "@/lib/prisma";
import { currentTenantId, getCurrentTenant } from "@/lib/tenant";
import { Header } from "@/components/Header";
import { Calendar, Clock } from "lucide-react";
import { ScheduleClient } from "@/components/schedule/ScheduleClient";

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "schedule" });
  return { title: t("metaTitle"), description: t("metaDesc"), alternates: localeAlternates("/schedule", locale) };
}

export default async function SchedulePage() {
  const t = await getTranslations("schedule");
  const tenant = await getCurrentTenant();
  const tid = await currentTenantId();
  const slots = await prisma.streamScheduleSlot.findMany({
    where: { active: true, ...(tid ? { tenantId: tid } : {}) },
    orderBy: [{ dayOfWeek: "asc" }, { startHour: "asc" }, { startMinute: "asc" }],
  });

  // Localized weekday names (index 0=Sunday..6=Saturday) — reuse the schedule namespace's
  // `daysFull` so they match the rest of the schedule UI; no more hard-coded Polish. #audit4
  const dayNames = t.raw("daysFull") as string[];

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/3 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Calendar className="w-6 h-6 text-red-500" />
              <h1
                className="font-display text-4xl text-white tracking-wider"
                style={{ textShadow: "2px 0 0 rgba(229,9,20,0.6), -2px 0 0 rgba(139,0,0,0.4)" }}
              >
                {t("title")}
              </h1>
            </div>
            <p className="text-zinc-500 text-sm">
              {t("subtitle", { owner: tenant.ownerHandle })}
            </p>
          </div>

          {slots.length === 0 ? (
            <div className="border border-zinc-800 bg-zinc-950/50 p-12 text-center">
              <Clock className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500">{t("emptyTitle")}</p>
              <p className="text-zinc-600 text-xs mt-2">{t("emptyHint")}</p>
            </div>
          ) : (
            <ScheduleClient
              slots={slots.map((s) => ({
                id: s.id,
                dayOfWeek: s.dayOfWeek,
                dayName: dayNames[s.dayOfWeek],
                startHour: s.startHour,
                startMinute: s.startMinute,
                durationMinutes: s.durationMinutes,
                title: s.title,
                platform: s.platform,
              }))}
            />
          )}
        </div>
      </main>
    </div>
  );
}

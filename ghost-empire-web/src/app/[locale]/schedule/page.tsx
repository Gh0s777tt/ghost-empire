// src/app/schedule/page.tsx
// Public stream schedule — weekly view + countdown to next stream
import { prisma } from "@/lib/prisma";
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

const DAYS_PL = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];

export default async function SchedulePage() {
  const slots = await prisma.streamScheduleSlot.findMany({
    where: { active: true },
    orderBy: [{ dayOfWeek: "asc" }, { startHour: "asc" }, { startMinute: "asc" }],
  });

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/3 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, #E50914 0%, transparent 70%)" }}
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
                PLAN STREAMÓW
              </h1>
            </div>
            <p className="text-zinc-500 text-sm">
              Kiedy Gh0s77tt jest live. Czas lokalny (Europa/Warszawa).
            </p>
          </div>

          {slots.length === 0 ? (
            <div className="border border-zinc-800 bg-zinc-950/50 p-12 text-center">
              <Clock className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500">Plan streamów nie został jeszcze ustawiony.</p>
              <p className="text-zinc-600 text-xs mt-2">Wkrótce admin go skonfiguruje.</p>
            </div>
          ) : (
            <ScheduleClient
              slots={slots.map((s) => ({
                id: s.id,
                dayOfWeek: s.dayOfWeek,
                dayName: DAYS_PL[s.dayOfWeek],
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

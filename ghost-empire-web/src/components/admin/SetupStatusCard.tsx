"use client";
// src/components/admin/SetupStatusCard.tsx
// Dashboard "what's configured" checklist — at-a-glance status + one-click jump to the
// section that needs setting up. Data from /api/admin/setup-status.
import { useState, useEffect } from "react";
import { CheckCircle2, AlertCircle, ArrowRight, ListChecks, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { SectionCard } from "./shared";

type Item = { key: string; label: string; ok: boolean; section: string; hint: string; optional?: boolean };

export function SetupStatusCard({ onJump, onOpenWizard }: { onJump: (id: string) => void; onOpenWizard?: () => void }) {
  const t = useTranslations("admin.setupStatus");
  const [items, setItems] = useState<Item[] | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/setup-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.items) { setItems(d.items); setCompletedAt(d.completedAt ?? null); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!items) return null;

  const done = items.filter((i) => i.ok).length;
  const required = items.filter((i) => !i.optional);
  const reqDone = required.filter((i) => i.ok).length;
  const allReqOk = reqDone === required.length;

  return (
    <SectionCard title={t("title")} icon={ListChecks}>
      <div className="flex items-center justify-between mb-3 text-xs">
        <span className="text-zinc-400">{t.rich("done", { b: (c) => <strong className="text-white">{c}</strong>, done, total: items.length })}</span>
        <span className={cn(allReqOk ? "text-green-400" : "text-orange-400")}>
          {allReqOk ? t("allReqOk") : t("reqProgress", { done: reqDone, total: required.length })}
        </span>
      </div>
      {onOpenWizard && !completedAt && (
        <button
          onClick={onOpenWizard}
          className="w-full mb-3 px-3 py-2 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <Wand2 className="w-3.5 h-3.5" /> {t("openWizard")}
        </button>
      )}
      <div className="space-y-1.5">
        {items.map((i) => (
          <div key={i.key} className="flex items-center gap-2.5 border border-zinc-800 bg-black/20 px-3 py-2">
            {i.ok
              ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              : <AlertCircle className={cn("w-4 h-4 shrink-0", i.optional ? "text-zinc-500" : "text-orange-400")} />}
            <div className="flex-1 min-w-0">
              <div className={cn("text-sm", i.ok ? "text-zinc-400" : "text-white")}>
                {t.has(`item.${i.key}.label`) ? t(`item.${i.key}.label`) : i.label}
                {i.optional && !i.ok && <span className="text-[9px] uppercase tracking-widest text-zinc-600 ml-1.5">{t("optional")}</span>}
              </div>
              {!i.ok && <div className="text-[10px] text-zinc-500">{t.has(`item.${i.key}.hint`) ? t(`item.${i.key}.hint`) : i.hint}</div>}
            </div>
            {!i.ok && (
              <button
                onClick={() => onJump(i.section)}
                className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2 py-1 shrink-0 flex items-center gap-1 transition-colors"
              >
                {t("configure")} <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

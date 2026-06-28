"use client";
// src/components/admin/sections/ActiveDrops.tsx — lazily-loaded list of active drops.
import { Gift, Copy, Trash2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { fmt, formatDate } from "@/lib/utils";
import { useTenantBranding } from "@/components/TenantBranding";
import { SectionCard } from "../shared";
import type { Drop } from "../types";

export function ActiveDropsList({
  drops, onToast, onSuccess, pending,
}: {
  drops: Drop[];
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.activeDrops");
  const locale = useLocale();
  const { tokenSymbol } = useTenantBranding();
  async function deactivate(id: string) {
    if (!confirm(t("confirmDeactivate"))) return;
    const res = await fetch(`/api/admin/drops?id=${id}`, { method: "DELETE" });
    if (res.ok) { onToast("ok", t("deactivated")); onSuccess(); }
    else onToast("err", t("err"));
  }

  if (drops.length === 0) return null;
  return (
    <SectionCard title={t("title")} icon={Gift}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {drops.map((d) => (
          <div key={d.id} className="border border-zinc-800 bg-black/30 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <button
                onClick={() => { navigator.clipboard.writeText(d.code); onToast("ok", t("copied", { code: d.code })); }}
                className="font-mono text-base text-white tracking-wider hover:text-red-400 flex items-center gap-1"
                title={t("copyTitle")}
              >
                {d.code}
                <Copy className="w-3 h-3 opacity-50" />
              </button>
              <button
                onClick={() => deactivate(d.id)}
                disabled={pending}
                title={t("deleteTitle")}
                className="text-zinc-500 hover:text-red-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 space-y-0.5">
              <div>Reward: <span className="text-white">{fmt(d.reward, locale)} {tokenSymbol}</span></div>
              {d.bonusReward > 0 && (
                <div>Bonus: <span className="text-orange-400">+{fmt(d.bonusReward, locale)} {tokenSymbol} × {d.bonusSlots}</span></div>
              )}
              <div>Claims: <span className="text-white">{d.claimsCount}</span></div>
              {d.expiresAt && (
                <div>{t("expiresLabel")} <span className="text-white">{formatDate(d.expiresAt, locale)}</span></div>
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

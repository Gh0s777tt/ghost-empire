"use client";
// src/components/admin/sections/PendingOrders.tsx — lazily-loaded shop order fulfilment list.
import { useState } from "react";
import { Package, Loader2, Check } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { formatDate } from "@/lib/utils";
import { useTenantBranding } from "@/components/TenantBranding";
import { SectionCard } from "../shared";
import type { PendingOrder } from "../types";

export function PendingOrdersList({
  orders, onToast, onSuccess, pending,
}: {
  orders: PendingOrder[];
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.pendingOrders");
  const locale = useLocale();
  const { tokenSymbol } = useTenantBranding();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, action: "deliver" | "refund") {
    if (action === "refund" && !confirm(t("confirmRefund"))) return;
    setBusyId(id);
    try {
      const note = action === "refund" ? prompt(t("notePrompt")) ?? undefined : undefined;
      const res = await fetch("/api/admin/deliver-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: id, action, note }),
      });
      const data = await res.json();
      if (!res.ok) onToast("err", data.error ?? t("err"));
      else {
        onToast("ok", action === "deliver" ? t("delivered") : t("refunded", { amount: data.refunded }));
        onSuccess();
      }
    } finally { setBusyId(null); }
  }

  if (orders.length === 0) {
    return (
      <SectionCard title="Pending orders" icon={Package}>
        <p className="text-zinc-500 text-sm">{t("empty")}</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Pending orders" icon={Package}>
      <div className="space-y-2">
        {orders.map((o) => (
          <div key={o.id} className="border border-orange-900/50 bg-orange-950/10 p-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">{o.shopItem?.imageEmoji ?? "🎁"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-medium truncate">
                  {o.shopItem?.name ?? o.reason}
                </div>
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                  @{o.user.username ?? "?"} · {Math.abs(o.amount)} {tokenSymbol} · {formatDate(o.createdAt, locale)}
                  {o.user.discordUsername && ` · 💬 ${o.user.discordUsername}`}
                </div>
                {o.user.discordId && (
                  <div className="text-[10px] font-mono text-zinc-600 mt-0.5">
                    Discord ID: {o.user.discordId}
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => act(o.id, "deliver")}
                  disabled={busyId === o.id || pending}
                  className="px-2.5 py-1.5 bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1"
                >
                  {busyId === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Done
                </button>
                <button
                  onClick={() => act(o.id, "refund")}
                  disabled={busyId === o.id || pending}
                  className="px-2.5 py-1.5 border border-zinc-700 hover:border-red-500 text-zinc-400 hover:text-red-400 text-[10px] font-bold tracking-widest uppercase disabled:opacity-50"
                >
                  Refund
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

"use client";
// src/components/admin/sections/Bounties.tsx
// Admin — resolve Viewer Bounties (#679). "Mark done" keeps (spends) the pool; "Decline"
// refunds every backer. Data via /api/admin/bounties. lib/bounties.ts holds the escrow logic.
import { useState, useEffect, useCallback } from "react";
import { Target, Loader2, Trash2, Check, X, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { useTenantBranding } from "@/components/TenantBranding";

type Bounty = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  pooledGt: number;
  backers: number;
  creator: string;
  topBackers: Array<{ name: string; amount: number }>;
  createdAt: string;
  resolvedAt: string | null;
};

export function BountiesManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.bounties");
  const fmt = useLocaleFmt();
  const { tokenSymbol } = useTenantBranding();
  const [loading, setLoading] = useState(true);
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ bounties: Bounty[] }>("/api/admin/bounties");
      setBounties(d.bounties);
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(id: string, body: Record<string, unknown>, okMsg: string) {
    setBusy(id);
    try {
      await apiPost("/api/admin/bounties", body);
      onToast("ok", okMsg);
      await load();
    } catch (err) {
      onToast("err", err instanceof ApiError ? err.message : t("err"));
    } finally {
      setBusy(null);
    }
  }

  const open = bounties.filter((b) => b.status === "open");
  const resolved = bounties.filter((b) => b.status !== "open");

  return (
    <SectionCard title={t("title")} icon={Target}>
      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> …</div>
      ) : bounties.length === 0 ? (
        <p className="text-zinc-500 text-sm">{t("empty")}</p>
      ) : (
        <div className="space-y-5">
          {open.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("openHeading", { count: open.length })}</h4>
              {open.map((b) => (
                <div key={b.id} className="border border-red-900/50 bg-black/30 p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="text-white font-bold text-sm">{b.title}</div>
                      {b.description && <div className="text-zinc-400 text-xs mt-1">{b.description}</div>}
                      <div className="text-[11px] text-zinc-500 mt-1.5 flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{b.backers} {t("backers", { count: b.backers })}</span>
                        <span>· {t("by", { name: b.creator })}</span>
                      </div>
                    </div>
                    <div className="text-end shrink-0">
                      <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">{t("pooled")}</div>
                      <div className="font-mono font-bold text-yellow-500 text-lg tabular-nums">{fmt(b.pooledGt)} {tokenSymbol}</div>
                    </div>
                  </div>

                  {b.topBackers.length > 0 && (
                    <div className="text-[11px] text-zinc-500 mb-3">
                      {t("topBackers")}: {b.topBackers.map((p) => `${p.name} (${fmt(p.amount)})`).join(", ")}
                    </div>
                  )}

                  <div className="flex items-center gap-2 border-t border-zinc-800 pt-3">
                    <button
                      onClick={() => { if (window.confirm(t("completeConfirm", { gt: fmt(b.pooledGt) }))) void act(b.id, { action: "resolve", id: b.id, outcome: "completed" }, t("completed")); }}
                      disabled={busy === b.id}
                      className="px-3 py-1.5 bg-green-800 hover:bg-green-700 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-30 flex items-center gap-1.5"
                    >
                      {busy === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      {t("complete")}
                    </button>
                    <button
                      onClick={() => { if (window.confirm(t("rejectConfirm"))) void act(b.id, { action: "resolve", id: b.id, outcome: "rejected" }, t("rejected")); }}
                      disabled={busy === b.id}
                      className="px-3 py-1.5 border border-zinc-700 hover:border-red-700 text-zinc-300 hover:text-red-300 text-[10px] font-bold tracking-widest uppercase disabled:opacity-30 flex items-center gap-1.5"
                    >
                      <X className="w-3 h-3" />
                      {t("reject")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {resolved.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("resolvedHeading")}</h4>
              {resolved.map((b) => (
                <div key={b.id} className="border border-zinc-800 bg-black/20 p-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <span className="text-zinc-300 truncate">{b.title}</span>
                    <span className="text-[11px] text-zinc-600 ms-2">{fmt(b.pooledGt)} {tokenSymbol} · {b.backers} {t("backers", { count: b.backers })}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border ${b.status === "completed" ? "border-green-700 text-green-300" : "border-zinc-700 text-zinc-400"}`}>
                      {t(`status_${b.status}` as "status_completed" | "status_rejected" | "status_expired")}
                    </span>
                    <button
                      onClick={() => { if (window.confirm(t("deleteConfirm"))) void act(b.id, { action: "delete", id: b.id }, t("deleted")); }}
                      disabled={busy === b.id}
                      className="text-zinc-600 hover:text-red-400 disabled:opacity-30"
                      title={t("delete")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

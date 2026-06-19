"use client";
// src/components/admin/sections/SoundRewards.tsx
// Manage the GT sound-redemption catalog: viewers spend GT to play a sound on the
// alerts overlay. Each reward = name + emoji + cost + sound URL. Data via
// /api/admin/sound-rewards.
import { useState, useEffect, useCallback } from "react";
import { Volume2, Loader2, Trash2, Plus, Play, Eye, EyeOff } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useTenantBranding } from "@/components/TenantBranding";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type Reward = { id: string; name: string; emoji: string | null; cost: number; soundUrl: string; active: boolean };

export function SoundRewardsManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.soundRewards");
  const nf = useLocale();
  const { tokenSymbol } = useTenantBranding();
  const sym = tokenSymbol || "GT";
  const [loading, setLoading] = useState(true);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [cost, setCost] = useState("100");
  const [soundUrl, setSoundUrl] = useState("");

  const load = useCallback(async () => {
    try { setRewards((await apiGet<{ rewards: Reward[] }>("/api/admin/sound-rewards")).rewards); }
    catch { /* keep */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function call(action: string, payload: Record<string, unknown>): Promise<boolean> {
    try { await apiPost("/api/admin/sound-rewards", { action, ...payload }); return true; }
    catch (e) { onToast("err", e instanceof ApiError ? e.message : t("err")); return false; }
  }

  async function create() {
    setBusy("create");
    if (await call("create", { name: name.trim(), emoji: emoji.trim(), cost: parseInt(cost || "0", 10), soundUrl: soundUrl.trim() })) {
      onToast("ok", t("created")); setName(""); setEmoji(""); setCost("100"); setSoundUrl(""); await load();
    }
    setBusy(null);
  }
  async function toggle(r: Reward) { setBusy(r.id); if (await call("update", { id: r.id, active: !r.active })) await load(); setBusy(null); }
  async function remove(r: Reward) {
    if (!confirm(t("deleteConfirm", { name: r.name }))) return;
    setBusy(r.id); if (await call("delete", { id: r.id })) { onToast("ok", t("deleted")); await load(); } setBusy(null);
  }
  function preview(url: string) { try { void new Audio(url).play().catch(() => onToast("err", t("playErr"))); } catch { onToast("err", t("playErr")); } }

  return (
    <SectionCard title={t("title")} icon={Volume2}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro")}</p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : (
        <div className="space-y-2 mb-4">
          {rewards.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">{t("empty")}</div>
          ) : rewards.map((r) => (
            <div key={r.id} className={`flex items-center gap-2 border p-2.5 ${r.active ? "border-zinc-800 bg-black/30" : "border-zinc-900 bg-black/20 opacity-60"}`}>
              <span className="text-lg shrink-0">{r.emoji || "🔊"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{r.name}</div>
                <div className="text-[10px] text-zinc-600 font-mono truncate">{r.soundUrl}</div>
              </div>
              <span className="text-xs font-mono text-amber-300 tabular-nums shrink-0">{r.cost.toLocaleString(nf)} {sym}</span>
              <button onClick={() => preview(r.soundUrl)} title={t("preview")} className="shrink-0 text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center"><Play className="w-3 h-3" /></button>
              <button onClick={() => toggle(r)} disabled={busy === r.id} title={r.active ? t("disable") : t("enable")} className="shrink-0 text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center">{r.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}</button>
              <button onClick={() => remove(r)} disabled={busy === r.id} title={t("deleteTitle")} className="shrink-0 text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-6 h-6 flex items-center justify-center"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}

      <div className="border border-zinc-800 bg-black/30 p-3 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("addTitle")}</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input value={name} maxLength={60} placeholder={t("namePh")} onChange={(e) => setName(e.target.value)} className="sm:col-span-2 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
          <input value={emoji} maxLength={8} placeholder="🔊" onChange={(e) => setEmoji(e.target.value)} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white text-center outline-hidden focus:border-red-600" />
          <input value={cost} inputMode="numeric" placeholder="100" onChange={(e) => setCost(e.target.value.replace(/[^0-9]/g, ""))} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono tabular-nums outline-hidden focus:border-red-600" />
        </div>
        <input value={soundUrl} placeholder={t("urlPh")} onChange={(e) => setSoundUrl(e.target.value)} className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600" />
        <button onClick={() => void create()} disabled={busy === "create" || !name.trim() || !soundUrl.trim()} className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy === "create" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} {t("addBtn")}
        </button>
      </div>
    </SectionCard>
  );
}

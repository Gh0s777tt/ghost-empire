"use client";
// src/components/admin/sections/Seasons.tsx — lazily-loaded battle pass / seasons manager.
import { useState, useEffect, useCallback } from "react";
import { Ticket, Loader2, RefreshCw, Trash2, Plus } from "lucide-react";
import { fmt } from "@/lib/utils";
import { SectionCard } from "../shared";

type AdminSeason = {
  id: string;
  number: number;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  totalTiers: number;
  xpPerTier: number;
  active: boolean;
  participants: number;
  rewards: Array<{ id: string; tier: number; premium: boolean; type: string; label: string; value: string; icon: string | null }>;
};

export function SeasonsManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [seasons, setSeasons] = useState<AdminSeason[]>([]);
  const [rewardTypes, setRewardTypes] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [rTier, setRTier] = useState("1");
  const [rType, setRType] = useState("tokens");
  const [rLabel, setRLabel] = useState("");
  const [rValue, setRValue] = useState("");
  const [rIcon, setRIcon] = useState("");
  const [rPremium, setRPremium] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/seasons");
      const data = await res.json();
      if (res.ok) {
        setSeasons(data.seasons ?? []);
        setRewardTypes(data.rewardTypes ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function call(payload: Record<string, unknown>): Promise<boolean> {
    const res = await fetch("/api/admin/seasons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) { onToast("err", data.error ?? "Błąd"); return false; }
    return true;
  }

  async function ensureCurrent() {
    setBusy("ensure");
    if (await call({ action: "ensure_current" })) { onToast("ok", "Bieżący sezon gotowy"); await load(); onSuccess(); }
    setBusy(null);
  }

  async function addReward(seasonId: string) {
    const tier = parseInt(rTier, 10);
    if (!tier || !rLabel.trim() || !rValue.trim()) { onToast("err", "Tier + label + value wymagane"); return; }
    setBusy(`add-${seasonId}`);
    const ok = await call({
      action: "add_reward",
      seasonId,
      tier,
      type: rType,
      label: rLabel.trim(),
      value: rValue.trim(),
      icon: rIcon || undefined,
      premium: rPremium,
    });
    if (ok) {
      setRLabel(""); setRValue(""); setRIcon("");
      onToast("ok", "Nagroda dodana");
      await load();
    }
    setBusy(null);
  }

  async function deleteReward(rewardId: string) {
    if (!confirm("Usunąć nagrodę?")) return;
    setBusy(rewardId);
    if (await call({ action: "delete_reward", rewardId })) { await load(); }
    setBusy(null);
  }

  const activeSeason = seasons.find((s) => s.active);

  return (
    <SectionCard title="Battle Pass / Sezony" icon={Ticket}>
      <p className="text-zinc-500 text-xs mb-3">
        Sezony rolują się miesięcznie (auto przy pierwszym XP eventcie miesiąca). Widzowie zbierają XP za aktywność, odbierają nagrody na tierach. Strona widzów: <code className="text-zinc-300">/seasons</code>.
      </p>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={ensureCurrent}
          disabled={busy === "ensure" || pending}
          className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy === "ensure" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Utwórz / odśwież bieżący sezon
        </button>
        <span className="text-[10px] text-zinc-500">Tworzy sezon dla bieżącego miesiąca z domyślnymi nagrodami.</span>
      </div>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : seasons.length === 0 ? (
        <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
          Brak sezonów. Kliknij &quot;Utwórz bieżący sezon&quot;.
        </div>
      ) : (
        <div className="space-y-4">
          {activeSeason && (
            <div className="border border-green-900 bg-green-950/10 p-3">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div>
                  <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-green-700 bg-green-950/40 text-green-300 mr-2">AKTYWNY</span>
                  <span className="text-white font-bold">{activeSeason.name}</span>
                </div>
                <div className="text-[10px] font-mono text-zinc-500">
                  {activeSeason.participants} graczy · {activeSeason.totalTiers} tierów · {fmt(activeSeason.xpPerTier)} XP/tier · do {new Date(activeSeason.endsAt).toLocaleDateString("pl-PL")}
                </div>
              </div>

              <div className="space-y-1 mb-3">
                {activeSeason.rewards.length === 0 ? (
                  <div className="text-[11px] text-zinc-600 italic">Brak nagród.</div>
                ) : (
                  activeSeason.rewards.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-[11px] border border-zinc-800 bg-black/30 px-2 py-1">
                      <span className="font-mono text-zinc-500 w-12">T{r.tier}</span>
                      <span>{r.icon ?? "🎁"}</span>
                      <span className="text-white flex-1 truncate">{r.label}</span>
                      {r.premium && <span className="text-[8px] font-mono uppercase px-1 border border-yellow-700 text-yellow-300">PREM</span>}
                      <span className="font-mono text-zinc-600">{r.type}={r.value}</span>
                      <button
                        onClick={() => deleteReward(r.id)}
                        disabled={busy === r.id}
                        className="text-zinc-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-zinc-800 pt-2">
                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Dodaj nagrodę</div>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 items-end">
                  <div>
                    <label className="text-[9px] text-zinc-500 block">Tier</label>
                    <input type="number" min={1} max={activeSeason.totalTiers} value={rTier} onChange={(e) => setRTier(e.target.value)}
                      className="w-full border border-zinc-700 bg-black/40 px-1.5 py-1 text-xs text-white font-mono outline-hidden focus:border-red-600" />
                  </div>
                  <div>
                    <label className="text-[9px] text-zinc-500 block">Typ</label>
                    <select value={rType} onChange={(e) => setRType(e.target.value)}
                      className="w-full border border-zinc-700 bg-black/40 px-1.5 py-1 text-xs text-white outline-hidden focus:border-red-600">
                      {rewardTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[9px] text-zinc-500 block">Label</label>
                    <input value={rLabel} onChange={(e) => setRLabel(e.target.value)} placeholder="np. 5000 Ghost Tokens"
                      className="w-full border border-zinc-700 bg-black/40 px-1.5 py-1 text-xs text-white outline-hidden focus:border-red-600" />
                  </div>
                  <div>
                    <label className="text-[9px] text-zinc-500 block">Value</label>
                    <input value={rValue} onChange={(e) => setRValue(e.target.value)}
                      placeholder={rType === "tokens" ? "5000" : rType === "code" ? "KOD-XYZ-123" : rType === "item" ? "opis odbioru" : "wartość"}
                      className="w-full border border-zinc-700 bg-black/40 px-1.5 py-1 text-xs text-white font-mono outline-hidden focus:border-red-600" />
                  </div>
                  <div>
                    <label className="text-[9px] text-zinc-500 block">Ikona</label>
                    <input value={rIcon} onChange={(e) => setRIcon(e.target.value)} placeholder="👻"
                      className="w-full border border-zinc-700 bg-black/40 px-1.5 py-1 text-xs text-white outline-hidden focus:border-red-600" />
                  </div>
                </div>
                <p className="text-[9px] text-zinc-600 mt-1 leading-relaxed">
                  <strong className="text-zinc-400">tokens</strong>: ilość GT w „value" · <strong className="text-zinc-400">code</strong>: kod pokazywany graczowi po odebraniu · <strong className="text-zinc-400">item</strong>: nagroda rzeczowa, odbiór przez ticket (w „value" wpisz szczegóły) · reszta = kosmetyka.
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={rPremium} onChange={(e) => setRPremium(e.target.checked)} className="accent-yellow-600" />
                    Premium track
                  </label>
                  <button
                    onClick={() => addReward(activeSeason.id)}
                    disabled={busy === `add-${activeSeason.id}` || pending}
                    className="ml-auto px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {busy === `add-${activeSeason.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Dodaj
                  </button>
                </div>
              </div>
            </div>
          )}

          {seasons.filter((s) => !s.active).length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Poprzednie sezony</div>
              <div className="space-y-1">
                {seasons.filter((s) => !s.active).map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-[11px] border border-zinc-900 bg-black/20 px-2 py-1.5">
                    <span className="text-white">{s.name}</span>
                    <span className="text-zinc-600 font-mono ml-auto">{s.participants} graczy · {s.rewards.length} nagród</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

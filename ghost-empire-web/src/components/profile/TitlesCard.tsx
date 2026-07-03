"use client";
// src/components/profile/TitlesCard.tsx
// Profile Titles (#761) — buy cosmetic titles with GT (a sink) + equip one. Lives on /profile.
import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Crown, Loader2, Check, Lock } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { emitBalance } from "@/lib/balance-bus";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { useTenantBranding } from "@/components/TenantBranding";
import { PROFILE_TITLES, TITLE_RARITY_COLOR, titleUnlocked } from "@/lib/titles";

type Data = { owned: string[]; equipped: string | null; balance: number; level: number };

export function TitlesCard() {
  const t = useTranslations("titles");
  const fmt = useLocaleFmt();
  const { tokenSymbol } = useTenantBranding();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ k: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<Data>("/api/titles");
      setData({ owned: d.owned, equipped: d.equipped, balance: d.balance, level: d.level });
    } catch {
      /* keep current */
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function buy(id: string) {
    if (busy) return;
    setBusy(id);
    setMsg(null);
    try {
      const res = await apiPost<{ balance: number }>("/api/titles", { action: "buy", titleId: id });
      emitBalance(res.balance);
      setMsg({ k: "ok", text: t("bought") });
      await load();
    } catch (e) {
      setMsg({ k: "err", text: e instanceof ApiError ? e.message || t("err") : t("err") });
    } finally {
      setBusy(null);
    }
  }

  async function equip(id: string | null) {
    if (busy) return;
    setBusy(id ?? "_off");
    setMsg(null);
    try {
      await apiPost("/api/titles", { action: "equip", titleId: id });
      await load();
    } catch (e) {
      setMsg({ k: "err", text: e instanceof ApiError ? e.message || t("err") : t("err") });
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <div className="border border-zinc-800 bg-black/30 p-4 text-xs text-zinc-500 flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 bg-black/30 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-1">
        <Crown className="w-4 h-4 text-amber-400" />
        <h3 className="font-display text-lg text-white tracking-wide">{t("title")}</h3>
        {data.equipped && (
          <button
            onClick={() => equip(null)}
            disabled={!!busy}
            className="ml-auto text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-red-400 disabled:opacity-50"
          >
            {t("unequip")}
          </button>
        )}
      </div>
      <p className="text-[11px] text-zinc-500 mb-3">{t("subtitle", { sym: tokenSymbol })}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {PROFILE_TITLES.map((def) => {
          const owned = data.owned.includes(def.id);
          const equipped = data.equipped === def.id;
          const color = TITLE_RARITY_COLOR[def.rarity];
          const canAfford = data.balance >= def.cost;
          const isBusy = busy === def.id;
          return (
            <div
              key={def.id}
              className="flex items-center gap-2 border px-3 py-2"
              style={{ borderColor: equipped ? color : "#27272a", background: equipped ? `${color}14` : "transparent" }}
            >
              <span className="font-bold text-sm uppercase tracking-wide" style={{ color }}>
                {t(`title_${def.id}`)}
              </span>
              <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">{t(`rarity_${def.rarity}`)}</span>
              <div className="ms-auto shrink-0">
                {equipped ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest" style={{ color }}>
                    <Check className="w-3 h-3" /> {t("equipped")}
                  </span>
                ) : owned ? (
                  <button
                    onClick={() => equip(def.id)}
                    disabled={!!busy}
                    className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest border border-zinc-700 text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
                  >
                    {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : t("equip")}
                  </button>
                ) : !titleUnlocked(def, data.level) ? (
                  // Rank-locked (#788/B5) — a prestige gate, not just a wallet check.
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest border border-zinc-800 text-zinc-500" title={t("needLevel", { n: def.requiresLevel ?? 0 })}>
                    <Lock className="w-3 h-3" /> {t("lvl", { n: def.requiresLevel ?? 0 })}
                  </span>
                ) : (
                  <button
                    onClick={() => buy(def.id)}
                    disabled={!!busy || !canAfford}
                    title={!canAfford ? t("tooPoor") : undefined}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest bg-amber-600 hover:bg-amber-500 text-black disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : !canAfford ? <Lock className="w-3 h-3" /> : null}
                    {fmt(def.cost)} {tokenSymbol}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {msg && <p className={`mt-3 text-xs ${msg.k === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}

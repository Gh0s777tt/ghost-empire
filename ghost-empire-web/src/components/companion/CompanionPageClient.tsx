"use client";
// src/components/companion/CompanionPageClient.tsx
// Ghost Companion — a per-user idle pet. Feed it GT (a real economy sink) to gain
// xp; it evolves through six stages. Data + feeding via /api/companion[/feed].
import { useState, useEffect, useCallback } from "react";
import { Loader2, Pencil, Check, X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { signIn } from "next-auth/react";
import { apiGet, apiPost, apiPatch, ApiError } from "@/lib/api-client";
import { emitBalance } from "@/lib/balance-bus";
import { companionProgress, COMPANION_STAGES, FEED_MIN, FEED_MAX } from "@/lib/companion";
import { useTenantBranding } from "@/components/TenantBranding";

type CompanionData = { name: string; xp: number; lastFedAt: string | null; balance: number };

export function CompanionPageClient({ isAuthenticated }: { isAuthenticated: boolean }) {
  const t = useTranslations("companion");
  const nf = useLocale();
  const { tokenSymbol } = useTenantBranding();
  const sym = tokenSymbol || "GT";

  const [loading, setLoading] = useState(isAuthenticated);
  const [data, setData] = useState<CompanionData | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const load = useCallback(async () => {
    try { setData(await apiGet<CompanionData>("/api/companion")); }
    catch { /* leave empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAuthenticated) void load(); }, [isAuthenticated, load]);

  function flash(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 2600);
  }

  async function feed(value: number) {
    if (busy || !data) return;
    if (!Number.isInteger(value) || value < FEED_MIN) { flash("err", t("errAmount", { min: FEED_MIN })); return; }
    setBusy(true);
    try {
      const r = await apiPost<{ xp: number; newBalance: number; fed: number; lastFedAt: string | null }>("/api/companion/feed", { amount: value });
      setData((d) => (d ? { ...d, xp: r.xp, balance: r.newBalance, lastFedAt: r.lastFedAt } : d));
      emitBalance(r.newBalance);
      setAmount("");
      flash("ok", t("fed", { xp: r.fed.toLocaleString(nf) }));
    } catch (err) {
      flash("err", err instanceof ApiError ? err.message : t("errFeed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    const name = nameDraft.trim().slice(0, 20);
    if (!name) { setEditing(false); return; }
    try {
      const r = await apiPatch<{ name: string }>("/api/companion", { name });
      setData((d) => (d ? { ...d, name: r.name } : d));
      setEditing(false);
    } catch (err) {
      flash("err", err instanceof ApiError ? err.message : t("errFeed"));
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">{t("title")}</h1>
      <p className="text-zinc-500 text-sm mb-6">{t("subtitle")}</p>

      {toast && (
        <div className={`mb-4 text-sm px-3 py-2 rounded-lg border ${toast.kind === "ok" ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-300" : "border-red-800/60 bg-red-950/30 text-red-300"}`}>
          {toast.msg}
        </div>
      )}

      {!isAuthenticated ? (
        <div className="border border-zinc-800 bg-black/40 rounded-xl p-8 text-center">
          <div className="text-6xl mb-3 select-none">👻</div>
          <h2 className="text-lg font-bold text-white mb-1">{t("guestTitle")}</h2>
          <p className="text-zinc-400 text-sm mb-4">{t("guestText")}</p>
          <button onClick={() => signIn()} className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "var(--brand)" }}>
            {t("login")}
          </button>
        </div>
      ) : loading ? (
        <div className="text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}</div>
      ) : !data ? (
        <div className="text-sm text-zinc-500 text-center py-8 border border-zinc-900 bg-black/20 rounded-xl">{t("errFeed")}</div>
      ) : (
        <CompanionInner
          data={data} sym={sym} nf={nf} t={t} busy={busy} amount={amount}
          editing={editing} nameDraft={nameDraft}
          onAmount={setAmount} onFeed={feed} onSave={saveName}
          onStartEdit={() => { setNameDraft(data.name); setEditing(true); }}
          onCancelEdit={() => setEditing(false)} onNameDraft={setNameDraft}
        />
      )}
    </div>
  );
}

function CompanionInner({
  data, sym, nf, t, busy, amount, editing, nameDraft,
  onAmount, onFeed, onSave, onStartEdit, onCancelEdit, onNameDraft,
}: {
  data: CompanionData; sym: string; nf: string;
  t: ReturnType<typeof useTranslations>;
  busy: boolean; amount: string; editing: boolean; nameDraft: string;
  onAmount: (v: string) => void; onFeed: (v: number) => void; onSave: () => void;
  onStartEdit: () => void; onCancelEdit: () => void; onNameDraft: (v: string) => void;
}) {
  const prog = companionProgress(data.xp);
  const stage = prog.stage;
  const quick = [100, 1000, 10000];
  const maxFeed = Math.min(data.balance, FEED_MAX);

  return (
    <>
      <div className="border border-zinc-800 bg-black/40 rounded-xl p-6 text-center">
        <div className="relative inline-flex items-center justify-center mb-3">
          <div className="absolute w-36 h-36 rounded-full blur-3xl opacity-30 animate-pulse" style={{ background: "var(--brand)" }} />
          <div className="relative text-[84px] leading-none select-none">{stage.emoji}</div>
        </div>

        {editing ? (
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <input
              value={nameDraft} maxLength={20} autoFocus
              onChange={(e) => onNameDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancelEdit(); }}
              className="bg-black/60 border border-zinc-700 rounded px-2 py-1 text-center text-white text-lg w-44 focus:outline-none focus:border-zinc-500"
            />
            <button onClick={onSave} aria-label={t("save")} className="text-emerald-400 hover:text-emerald-300 p-1"><Check className="w-4 h-4" /></button>
            <button onClick={onCancelEdit} aria-label={t("cancel")} className="text-zinc-500 hover:text-white p-1"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 mb-1">
            <h2 className="text-xl font-bold text-white">{data.name}</h2>
            <button onClick={onStartEdit} aria-label={t("rename")} className="text-zinc-600 hover:text-white p-1"><Pencil className="w-3.5 h-3.5" /></button>
          </div>
        )}

        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-4">
          {t("stageLabel", { n: stage.index + 1, total: COMPANION_STAGES.length })} · {t(`stage_${stage.key}`)}
        </div>

        <div className="flex justify-between text-[11px] text-zinc-500 mb-1">
          <span>{t("lifetimeFed", { xp: data.xp.toLocaleString(nf) })}</span>
          <span>{prog.next ? t("toNext", { xp: prog.toNext.toLocaleString(nf) }) : t("maxStage")}</span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${prog.pct}%`, background: "var(--brand)" }} />
        </div>
      </div>

      <div className="mt-4 border border-zinc-800 bg-black/40 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-zinc-300">{t("feedTitle")}</span>
          <span className="text-xs font-mono text-zinc-500 tabular-nums">{t("balance", { n: data.balance.toLocaleString(nf), sym })}</span>
        </div>
        <div className="flex gap-2">
          <input
            value={amount} inputMode="numeric" placeholder={String(FEED_MIN)}
            onChange={(e) => onAmount(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") onFeed(parseInt(amount || "0", 10)); }}
            className="flex-1 bg-black/60 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm tabular-nums focus:outline-none focus:border-zinc-500"
          />
          <button
            onClick={() => onFeed(parseInt(amount || "0", 10))} disabled={busy}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 inline-flex items-center gap-2"
            style={{ background: "var(--brand)" }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("feed")}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {quick.map((v) => (
            <button key={v} onClick={() => onFeed(v)} disabled={busy || data.balance < v}
              className="px-2.5 py-1 rounded border border-zinc-700 text-xs text-zinc-300 hover:border-zinc-500 disabled:opacity-40">
              {v.toLocaleString(nf)}
            </button>
          ))}
          <button onClick={() => onFeed(maxFeed)} disabled={busy || data.balance < FEED_MIN}
            className="px-2.5 py-1 rounded border border-zinc-700 text-xs text-zinc-300 hover:border-zinc-500 disabled:opacity-40">
            {t("max")}
          </button>
        </div>
        <p className="text-[11px] text-zinc-600 mt-2">{t("sinkNote")}</p>
      </div>
    </>
  );
}

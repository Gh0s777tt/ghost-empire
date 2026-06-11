"use client";
// src/components/admin/sections/Predictions.tsx — lazily-loaded predictions/bets manager.
import { useState, useEffect, useCallback } from "react";
import { Dice5, Loader2, Trash2, X, Plus, Megaphone, MegaphoneOff } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { fmt, cn } from "@/lib/utils";
import { SectionCard } from "../shared";
import { OverlayPreview } from "@/components/admin/OverlayPreview";
import { PredictionOverlayCard } from "@/components/PredictionOverlayCard";
import { useTenantBranding } from "@/components/TenantBranding";

type PredictionRow = {
  id: string;
  question: string;
  options: string[];
  status: string;
  resolvedOptionIndex: number | null;
  totalPot: number;
  opensAt: string;
  closesAt: string | null;
  resolvedAt: string | null;
  announceToChat: boolean;
  accentColor: string;
  entriesCount: number;
  breakdown: Array<{ index: number; total: number; count: number }>;
};

export function PredictionsManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.predictions");
  const locale = useLocale();
  const nf = locale;
  const { tokenSymbol } = useTenantBranding();
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Create form
  const [newQuestion, setNewQuestion] = useState("");
  const [newOptions, setNewOptions] = useState<string[]>(["", ""]);
  const [newClosesIn, setNewClosesIn] = useState("");  // minutes from now, optional
  const [newAccent, setNewAccent] = useState("#a855f7");
  const [newAnnounce, setNewAnnounce] = useState(true); // bot re-announces in chat while open

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/predictions");
      const data = await res.json();
      if (res.ok) setPredictions(data.predictions ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function call(action: string, payload: Record<string, unknown>): Promise<boolean> {
    const res = await fetch("/api/admin/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) { onToast("err", data.error ?? t("err")); return false; }
    return true;
  }

  async function createPrediction() {
    const cleanOptions = newOptions.map((o) => o.trim()).filter((o) => o.length > 0);
    if (newQuestion.trim().length < 5) { onToast("err", t("qMin")); return; }
    if (cleanOptions.length < 2) { onToast("err", t("optMin")); return; }

    let closesAt: string | undefined;
    const min = parseInt(newClosesIn, 10);
    if (min > 0) closesAt = new Date(Date.now() + min * 60_000).toISOString();

    setBusy("create");
    const ok = await call("create", {
      question: newQuestion.trim(),
      options: cleanOptions,
      closesAt,
      accentColor: newAccent,
      announceToChat: newAnnounce,
    });
    if (ok) {
      setNewQuestion("");
      setNewOptions(["", ""]);
      setNewClosesIn("");
      setNewAnnounce(true);
      onToast("ok", t("created"));
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  async function lock(p: PredictionRow) {
    if (!confirm(t("lockConfirm", { q: p.question }))) return;
    setBusy(p.id);
    if (await call("lock", { id: p.id })) { onToast("ok", t("locked")); await load(); }
    setBusy(null);
  }

  async function resolve(p: PredictionRow, winningOptionIndex: number) {
    if (!confirm(t("resolveConfirm", { opt: p.options[winningOptionIndex], pot: String(p.totalPot) }))) return;
    setBusy(p.id);
    const res = await fetch("/api/admin/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", id: p.id, winningOptionIndex }),
    });
    const data = await res.json();
    if (!res.ok) onToast("err", data.error ?? t("err"));
    else {
      onToast("ok", data.refunded
        ? t("refundedMsg", { count: data.losersCount })
        : t("paidOut", { winners: data.winnersCount, pot: String(data.potDistributed) }),
      );
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  async function cancel(p: PredictionRow) {
    if (!confirm(t("cancelConfirm"))) return;
    setBusy(p.id);
    if (await call("cancel", { id: p.id })) { onToast("ok", t("cancelled")); await load(); }
    setBusy(null);
  }

  async function toggleAnnounce(p: PredictionRow) {
    setBusy(p.id);
    if (await call("toggle_announce", { id: p.id, announceToChat: !p.announceToChat })) {
      onToast("ok", p.announceToChat ? t("announceOff") : t("announceOn"));
      await load();
    }
    setBusy(null);
  }

  async function deletePrediction(p: PredictionRow) {
    if (!confirm(t("deleteConfirm"))) return;
    setBusy(p.id);
    if (await call("delete", { id: p.id })) { onToast("ok", t("deleted")); await load(); }
    setBusy(null);
  }

  // Sample data for the OBS overlay preview — reflects the picked accent + typed Q/options.
  const previewLabels = newOptions.map((o) => o.trim()).filter(Boolean);
  const previewOptions = (previewLabels.length >= 2 ? previewLabels.slice(0, 4) : (t.raw("previewOpts") as string[])).map(
    (label, i) => ({ label, total: [1400, 900, 450, 200][i] ?? 100, count: 0 }),
  );
  const previewPot = previewOptions.reduce((s, o) => s + o.total, 0);

  return (
    <SectionCard title={t("title")} icon={Dice5}>
      <p className="text-zinc-500 text-xs mb-3">
        {t("intro")}
      </p>

      {/* OBS overlay: shows the active prediction on stream (alongside /predictions) */}
      <div className="mb-4">
        <OverlayPreview
          path="/overlay/predictions"
          note={t("obsNote")}
        >
          <div className="flex justify-center">
            <PredictionOverlayCard
              question={newQuestion.trim() || t("previewQuestion")}
              options={previewOptions}
              totalPot={previewPot}
              accent={newAccent}
            />
          </div>
        </OverlayPreview>
      </div>

      {/* Active predictions */}
      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : (
        <div className="space-y-2 mb-4">
          {predictions.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
              {t("emptyList")}
            </div>
          ) : (
            predictions.map((p) => {
              const isOpen = p.status === "open";
              const isLocked = p.status === "locked";
              const isResolved = p.status === "resolved";
              const isCancelled = p.status === "cancelled";
              const isBusy = busy === p.id || pending;
              return (
                <div key={p.id} className={cn(
                  "border bg-black/30 p-3",
                  isOpen ? "border-green-900" :
                  isLocked ? "border-orange-900" :
                  isResolved ? "border-zinc-800" :
                  "border-zinc-900 opacity-60",
                )}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {isOpen && <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-green-700 bg-green-950/40 text-green-300">OPEN</span>}
                        {isLocked && <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-orange-700 bg-orange-950/40 text-orange-300">LOCKED</span>}
                        {isResolved && <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-zinc-700 bg-zinc-900/60 text-zinc-300">RESOLVED</span>}
                        {isCancelled && <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-zinc-800 text-zinc-500">CANCELLED</span>}
                        <span className="text-[10px] font-mono text-zinc-500">
                          {p.entriesCount} {p.entriesCount === 1 ? "wager" : "wagers"} · {t("potWord")} {fmt(p.totalPot, locale)} {tokenSymbol}
                        </span>
                        {p.closesAt && isOpen && (
                          <span className="text-[10px] font-mono text-orange-400">
                            {t("closesLabel")} {new Date(p.closesAt).toLocaleString(nf, { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-white">{p.question}</div>
                    </div>
                  </div>

                  {/* Per-option breakdown + resolve buttons */}
                  <div className="space-y-1 mb-2">
                    {p.options.map((label, idx) => {
                      const b = p.breakdown.find((x) => x.index === idx);
                      const isWinner = p.resolvedOptionIndex === idx;
                      const pct = p.totalPot > 0 ? ((b?.total ?? 0) / p.totalPot) * 100 : 0;
                      return (
                        <div key={idx} className={cn(
                          "flex items-center gap-2 px-2 py-1.5 border text-xs",
                          isWinner ? "border-green-700 bg-green-950/30" : "border-zinc-800 bg-black/20",
                        )}>
                          <span className="font-mono text-[10px] text-zinc-500 shrink-0">#{idx + 1}</span>
                          <span className="text-white flex-1 truncate">{label}</span>
                          <span className="font-mono text-[10px] text-zinc-400 tabular-nums shrink-0">
                            {fmt(b?.total ?? 0, locale)} {tokenSymbol} · {b?.count ?? 0} · {pct.toFixed(0)}%
                          </span>
                          {(isOpen || isLocked) && (
                            <button
                              onClick={() => resolve(p, idx)}
                              disabled={isBusy}
                              className="text-[10px] font-mono uppercase tracking-widest text-green-300 hover:text-green-200 border border-green-900 hover:border-green-700 px-1.5 py-0.5 disabled:opacity-50 shrink-0"
                              title={t("resolveTitle")}
                            >
                              ✓ Win
                            </button>
                          )}
                          {isWinner && <span className="text-[10px] text-green-300 shrink-0">★ WINNER</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {isOpen && (
                      <button
                        onClick={() => lock(p)}
                        disabled={isBusy}
                        className="text-[10px] font-mono uppercase tracking-widest text-orange-300 hover:text-orange-200 border border-orange-900 hover:border-orange-700 px-2 py-1 disabled:opacity-50"
                      >
                        {t("lockBtn")}
                      </button>
                    )}
                    {(isOpen || isLocked) && (
                      <button
                        onClick={() => toggleAnnounce(p)}
                        disabled={isBusy}
                        title={p.announceToChat ? t("announceTitleOn") : t("announceTitleOff")}
                        className={cn(
                          "text-[10px] font-mono uppercase tracking-widest border px-2 py-1 disabled:opacity-50 flex items-center gap-1",
                          p.announceToChat
                            ? "text-violet-300 hover:text-violet-200 border-violet-900 hover:border-violet-700"
                            : "text-zinc-500 hover:text-zinc-300 border-zinc-800 hover:border-zinc-600",
                        )}
                      >
                        {p.announceToChat ? <Megaphone className="w-3 h-3" /> : <MegaphoneOff className="w-3 h-3" />}
                        {p.announceToChat ? t("chatOn") : t("chatOff")}
                      </button>
                    )}
                    {(isOpen || isLocked) && (
                      <button
                        onClick={() => cancel(p)}
                        disabled={isBusy}
                        className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 px-2 py-1 disabled:opacity-50"
                      >
                        {t("cancelBtn")}
                      </button>
                    )}
                    {(isResolved || isCancelled) && (
                      <button
                        onClick={() => deletePrediction(p)}
                        disabled={isBusy}
                        className="text-[10px] font-mono uppercase tracking-widest text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 px-2 py-1 disabled:opacity-50 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        {t("deleteBtn")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Create form */}
      <div className="border border-zinc-800 bg-black/30 p-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
          {t("newBet")}
        </div>
        <div className="space-y-2">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">{t("questionLabel")}</label>
            <input
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder={t("questionPh")}
              maxLength={500}
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-sm text-white outline-hidden focus:border-red-600"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">
              {t("optionsLabel")}
            </label>
            <div className="space-y-1">
              {newOptions.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-zinc-500 w-6">#{idx + 1}</span>
                  <input
                    value={opt}
                    onChange={(e) => {
                      const next = [...newOptions];
                      next[idx] = e.target.value;
                      setNewOptions(next);
                    }}
                    placeholder={t("optionPh", { n: idx + 1 })}
                    maxLength={100}
                    className="flex-1 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600"
                  />
                  {newOptions.length > 2 && (
                    <button
                      onClick={() => setNewOptions(newOptions.filter((_, i) => i !== idx))}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {newOptions.length < 4 && (
                <button
                  onClick={() => setNewOptions([...newOptions, ""])}
                  className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white border border-dashed border-zinc-700 hover:border-zinc-500 px-2 py-1 w-full flex items-center justify-center gap-1"
                >
                  <Plus className="w-3 h-3" /> {t("addOption")}
                </button>
              )}
            </div>
          </div>
          {/* Accent color + live preview */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">{t("accentLabel")}</label>
            <div className="flex items-center gap-2">
              <input type="color" value={newAccent} onChange={(e) => setNewAccent(e.target.value)} className="w-10 h-9 bg-black border border-zinc-700 cursor-pointer" />
              <input
                type="text"
                value={newAccent}
                onChange={(e) => setNewAccent(e.target.value)}
                className="w-24 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600"
              />
              <span className="text-[10px] text-zinc-600">{t("previewHint")}</span>
            </div>
          </div>

          <div className="border bg-black/40 p-3" style={{ borderColor: newAccent }}>
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: newAccent }}>
              {t("previewBadge")}
            </div>
            <div className="text-sm text-white mb-2">{newQuestion.trim() || t("previewQEmpty")}</div>
            <div className="space-y-1">
              {(newOptions.some((o) => o.trim()) ? newOptions : [t("optionPh", { n: 1 }), t("optionPh", { n: 2 })]).map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2 px-2 py-1.5 border bg-black/30" style={{ borderColor: `${newAccent}55` }}>
                  <span className="font-mono text-[10px] text-zinc-500 shrink-0">#{idx + 1}</span>
                  <span className="text-white text-xs flex-1 truncate">{opt.trim() || t("optionPh", { n: idx + 1 })}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm" style={{ background: `${newAccent}22`, color: newAccent }}>{t("betWord")}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">
                {t("closesIn")}
              </label>
              <input
                type="number"
                min={1}
                value={newClosesIn}
                onChange={(e) => setNewClosesIn(e.target.value)}
                placeholder={t("closesInPh")}
                className="w-24 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600"
              />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer pb-1.5" title={t("announceCheckTitle")}>
              <input type="checkbox" checked={newAnnounce} onChange={(e) => setNewAnnounce(e.target.checked)} className="accent-violet-600 w-3.5 h-3.5" />
              <Megaphone className="w-3 h-3 text-violet-400" /> {t("announceCheck")}
            </label>
            <button
              onClick={createPrediction}
              disabled={busy === "create" || pending}
              className="ml-auto px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy === "create" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Dice5 className="w-3 h-3" />}
              {t("createBet")}
            </button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

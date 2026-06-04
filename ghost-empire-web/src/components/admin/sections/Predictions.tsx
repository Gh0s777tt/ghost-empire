"use client";
// src/components/admin/sections/Predictions.tsx — lazily-loaded predictions/bets manager.
import { useState, useEffect, useCallback } from "react";
import { Dice5, Loader2, Trash2, X, Plus } from "lucide-react";
import { fmt, cn } from "@/lib/utils";
import { SectionCard } from "../shared";
import { OverlayPreview } from "@/components/admin/OverlayPreview";
import { PredictionOverlayCard } from "@/components/PredictionOverlayCard";

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
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Create form
  const [newQuestion, setNewQuestion] = useState("");
  const [newOptions, setNewOptions] = useState<string[]>(["", ""]);
  const [newClosesIn, setNewClosesIn] = useState("");  // minutes from now, optional
  const [newAccent, setNewAccent] = useState("#a855f7");

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
    if (!res.ok) { onToast("err", data.error ?? "Błąd"); return false; }
    return true;
  }

  async function createPrediction() {
    const cleanOptions = newOptions.map((o) => o.trim()).filter((o) => o.length > 0);
    if (newQuestion.trim().length < 5) { onToast("err", "Pytanie min 5 znaków"); return; }
    if (cleanOptions.length < 2) { onToast("err", "Min 2 opcje"); return; }

    let closesAt: string | undefined;
    const min = parseInt(newClosesIn, 10);
    if (min > 0) closesAt = new Date(Date.now() + min * 60_000).toISOString();

    setBusy("create");
    const ok = await call("create", {
      question: newQuestion.trim(),
      options: cleanOptions,
      closesAt,
      accentColor: newAccent,
    });
    if (ok) {
      setNewQuestion("");
      setNewOptions(["", ""]);
      setNewClosesIn("");
      onToast("ok", "Zakład utworzony");
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  async function lock(p: PredictionRow) {
    if (!confirm(`Zablokować obstawianie zakładu "${p.question}"?`)) return;
    setBusy(p.id);
    if (await call("lock", { id: p.id })) { onToast("ok", "Zablokowany"); await load(); }
    setBusy(null);
  }

  async function resolve(p: PredictionRow, winningOptionIndex: number) {
    if (!confirm(`Rozstrzygnąć: wygrana opcja "${p.options[winningOptionIndex]}"?\n\nPula ${p.totalPot} GT zostanie podzielona między zwycięzców proporcjonalnie do stawek.`)) return;
    setBusy(p.id);
    const res = await fetch("/api/admin/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", id: p.id, winningOptionIndex }),
    });
    const data = await res.json();
    if (!res.ok) onToast("err", data.error ?? "Błąd");
    else {
      onToast("ok", data.refunded
        ? `Brak zwycięzców — pełen zwrot (${data.losersCount} graczy)`
        : `Wypłacono: ${data.winnersCount} wygrywających, ${data.potDistributed} GT z puli`,
      );
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  async function cancel(p: PredictionRow) {
    if (!confirm(`Anulować zakład i zwrócić wszystkim stawki?`)) return;
    setBusy(p.id);
    if (await call("cancel", { id: p.id })) { onToast("ok", "Anulowano + zwrot"); await load(); }
    setBusy(null);
  }

  async function deletePrediction(p: PredictionRow) {
    if (!confirm(`Usunąć ten zakład z bazy?`)) return;
    setBusy(p.id);
    if (await call("delete", { id: p.id })) { onToast("ok", "Usunięto"); await load(); }
    setBusy(null);
  }

  // Sample data for the OBS overlay preview — reflects the picked accent + typed Q/options.
  const previewLabels = newOptions.map((o) => o.trim()).filter(Boolean);
  const previewOptions = (previewLabels.length >= 2 ? previewLabels.slice(0, 4) : ["Mniej niż 5", "5–10", "Więcej niż 10"]).map(
    (label, i) => ({ label, total: [1400, 900, 450, 200][i] ?? 100, count: 0 }),
  );
  const previewPot = previewOptions.reduce((s, o) => s + o.total, 0);

  return (
    <SectionCard title="Predictions / Zakłady" icon={Dice5}>
      <p className="text-zinc-500 text-xs mb-3">
        Twórz pytania, widzowie obstawiają Ghost Tokens. Pula = suma wszystkich stawek. Po rozstrzygnięciu wygrywająca opcja dzieli pulę proporcjonalnie do stawek. Brak zwycięzców → zwrot wszystkim.
      </p>

      {/* OBS overlay: shows the active prediction on stream (alongside /predictions) */}
      <div className="mb-4">
        <OverlayPreview
          path="/overlay/predictions"
          note="Pokazuje aktualny otwarty/zamknięty zakład u góry ekranu OBS. Token współdzielony z alertami/goals. Możesz pokazywać zakład na stronie /predictions i/lub tym overlayem — jak chcesz."
        >
          <div className="flex justify-center">
            <PredictionOverlayCard
              question={newQuestion.trim() || "Ile zgonów w tym streamie?"}
              options={previewOptions}
              totalPot={previewPot}
              accent={newAccent}
            />
          </div>
        </OverlayPreview>
      </div>

      {/* Active predictions */}
      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : (
        <div className="space-y-2 mb-4">
          {predictions.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
              Brak zakładów. Dodaj pierwszy poniżej.
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
                          {p.entriesCount} {p.entriesCount === 1 ? "wager" : "wagers"} · pula {fmt(p.totalPot)} GT
                        </span>
                        {p.closesAt && isOpen && (
                          <span className="text-[10px] font-mono text-orange-400">
                            Zamknięcie: {new Date(p.closesAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}
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
                            {fmt(b?.total ?? 0)} GT · {b?.count ?? 0} · {pct.toFixed(0)}%
                          </span>
                          {(isOpen || isLocked) && (
                            <button
                              onClick={() => resolve(p, idx)}
                              disabled={isBusy}
                              className="text-[10px] font-mono uppercase tracking-widest text-green-300 hover:text-green-200 border border-green-900 hover:border-green-700 px-1.5 py-0.5 disabled:opacity-50 shrink-0"
                              title="Oznacz jako wygrywająca"
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
                        Zablokuj
                      </button>
                    )}
                    {(isOpen || isLocked) && (
                      <button
                        onClick={() => cancel(p)}
                        disabled={isBusy}
                        className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 px-2 py-1 disabled:opacity-50"
                      >
                        Anuluj (zwrot)
                      </button>
                    )}
                    {(isResolved || isCancelled) && (
                      <button
                        onClick={() => deletePrediction(p)}
                        disabled={isBusy}
                        className="text-[10px] font-mono uppercase tracking-widest text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 px-2 py-1 disabled:opacity-50 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        Usuń
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
          Nowy zakład
        </div>
        <div className="space-y-2">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">Pytanie</label>
            <input
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="np. Ile zgonów w tym streamie?"
              maxLength={500}
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-sm text-white outline-hidden focus:border-red-600"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">
              Opcje (2-4)
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
                    placeholder={`Opcja ${idx + 1}`}
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
                  <Plus className="w-3 h-3" /> Dodaj opcję
                </button>
              )}
            </div>
          </div>
          {/* Accent color + live preview */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">Kolor akcentu</label>
            <div className="flex items-center gap-2">
              <input type="color" value={newAccent} onChange={(e) => setNewAccent(e.target.value)} className="w-10 h-9 bg-black border border-zinc-700 cursor-pointer" />
              <input
                type="text"
                value={newAccent}
                onChange={(e) => setNewAccent(e.target.value)}
                className="w-24 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600"
              />
              <span className="text-[10px] text-zinc-600">Podgląd jak na stronie „Predykcje" →</span>
            </div>
          </div>

          <div className="border bg-black/40 p-3" style={{ borderColor: newAccent }}>
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: newAccent }}>
              Zakład · podgląd
            </div>
            <div className="text-sm text-white mb-2">{newQuestion.trim() || "Twoje pytanie pojawi się tutaj"}</div>
            <div className="space-y-1">
              {(newOptions.some((o) => o.trim()) ? newOptions : ["Opcja 1", "Opcja 2"]).map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2 px-2 py-1.5 border bg-black/30" style={{ borderColor: `${newAccent}55` }}>
                  <span className="font-mono text-[10px] text-zinc-500 shrink-0">#{idx + 1}</span>
                  <span className="text-white text-xs flex-1 truncate">{opt.trim() || `Opcja ${idx + 1}`}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm" style={{ background: `${newAccent}22`, color: newAccent }}>Obstaw</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">
                Zamknij za (min, opcjonalne)
              </label>
              <input
                type="number"
                min={1}
                value={newClosesIn}
                onChange={(e) => setNewClosesIn(e.target.value)}
                placeholder="np. 30"
                className="w-24 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600"
              />
            </div>
            <button
              onClick={createPrediction}
              disabled={busy === "create" || pending}
              className="ml-auto px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy === "create" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Dice5 className="w-3 h-3" />}
              Utwórz zakład
            </button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

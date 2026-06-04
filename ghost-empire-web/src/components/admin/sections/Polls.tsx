"use client";
// src/components/admin/sections/Polls.tsx — lazily-loaded polls manager.
import { useState, useEffect } from "react";
import { BarChart3, Loader2, Plus, Trash2 } from "lucide-react";
import { SectionCard, FieldInput, FieldTextarea } from "../shared";
import { OverlayPreview } from "@/components/admin/OverlayPreview";
import { PollOverlayCard } from "@/components/PollOverlayCard";

type PollRow = { id: string; question: string; options: string[]; status: string; accentColor: string; createdAt: string; closesAt: string | null; totalVotes: number; counts: number[] };

export function PollsManager({
  onToast,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [list, setList] = useState<PollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [newAccent, setNewAccent] = useState("#3b82f6");

  async function load() {
    try {
      const r = await fetch("/api/admin/polls");
      if (r.ok) { const d = await r.json(); setList(d.polls ?? []); }
    } catch { /* keep */ } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function call(payload: Record<string, unknown>, okMsg?: string) {
    setBusy(typeof payload.id === "string" ? payload.id : "create");
    try {
      const res = await fetch("/api/admin/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { onToast("err", data.error ?? "Błąd"); return false; }
      if (okMsg) onToast("ok", okMsg);
      return true;
    } catch { onToast("err", "Błąd sieci"); return false; }
    finally { setBusy(null); }
  }

  async function create() {
    const options = optionsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!question.trim()) { onToast("err", "Pytanie wymagane"); return; }
    if (options.length < 2) { onToast("err", "Podaj min. 2 opcje (po jednej w linii)"); return; }
    if (await call({ action: "create", question: question.trim(), options, accentColor: newAccent }, "Ankieta utworzona")) {
      setQuestion(""); setOptionsText(""); await load();
    }
  }

  // Sample data for the OBS overlay preview — reflects the picked accent + typed Q/options.
  const previewLabels = optionsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const previewOptions = (previewLabels.length >= 2 ? previewLabels.slice(0, 10) : ["Opcja A", "Opcja B", "Opcja C"]).map(
    (label, i) => ({ label, count: [42, 27, 15, 9, 6][i] ?? 3 }),
  );
  const previewTotal = previewOptions.reduce((s, o) => s + o.count, 0);

  return (
    <SectionCard title="Ankiety / głosowania" icon={BarChart3}>
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 leading-relaxed">
          Proste ankiety społeczności (bez tokenów). Widoczne na <code className="text-zinc-400">/polls</code>; zalogowani głosują,
          mogą zmienić głos póki ankieta otwarta. Zamknięta = tylko wyniki.
        </p>

        {/* OBS overlay: shows the active poll on stream (alongside /polls) */}
        <OverlayPreview
          path="/overlay/polls"
          note="Pokazuje aktualną otwartą ankietę u góry ekranu OBS. Token współdzielony z alertami/goals. Ankietę pokazujesz na /polls i/lub tym overlayem."
        >
          <div className="flex justify-center">
            <PollOverlayCard
              question={question.trim() || "W co gramy w piątek?"}
              options={previewOptions}
              total={previewTotal}
              accent={newAccent}
            />
          </div>
        </OverlayPreview>

        {/* Create */}
        <div className="border border-zinc-800 bg-black/30 p-3 space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Nowa ankieta</div>
          <FieldInput label="Pytanie" value={question} onChange={setQuestion} placeholder="np. W co gramy w piątek?" />
          <FieldTextarea label="Opcje (po jednej w linii, 2–10)" value={optionsText} onChange={setOptionsText} />

          {/* Accent color */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">Kolor akcentu</label>
            <div className="flex items-center gap-2">
              <input type="color" value={newAccent} onChange={(e) => setNewAccent(e.target.value)} className="w-10 h-9 bg-black border border-zinc-700 cursor-pointer" />
              <input type="text" value={newAccent} onChange={(e) => setNewAccent(e.target.value)} className="w-24 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600" />
              <span className="text-[10px] text-zinc-600">Podgląd jak na „/polls" →</span>
            </div>
          </div>

          {/* Live preview */}
          <div className="border bg-black/40 p-3" style={{ borderColor: newAccent }}>
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: newAccent }}>Ankieta · podgląd</div>
            <div className="text-sm text-white mb-2">{question.trim() || "Twoje pytanie pojawi się tutaj"}</div>
            <div className="space-y-1">
              {(optionsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).length >= 1
                ? optionsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
                : ["Opcja 1", "Opcja 2"]
              ).slice(0, 10).map((opt, i, arr) => {
                const pct = Math.round(100 / arr.length);
                return (
                  <div key={i} className="relative border overflow-hidden" style={{ borderColor: `${newAccent}55` }}>
                    <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: `${newAccent}33` }} />
                    <div className="relative flex items-center justify-between px-2 py-1 text-[11px]">
                      <span className="text-zinc-200 truncate">{opt}</span>
                      <span className="font-mono text-zinc-500 tabular-nums">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button onClick={create} disabled={busy === "create" || !question.trim()}
            className="w-full px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {busy === "create" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Utwórz ankietę
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
        ) : (
          <div className="space-y-2 max-h-[460px] overflow-y-auto">
            {list.length === 0 && <p className="text-zinc-600 text-sm">Brak ankiet.</p>}
            {list.map((p) => (
              <div key={p.id} className="border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white">{p.question}</div>
                    <div className="text-[10px] font-mono text-zinc-500">{p.totalVotes} głosów · {p.status === "open" ? "otwarta" : "zamknięta"}</div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {p.status === "open" ? (
                      <button onClick={async () => { if (await call({ action: "close", id: p.id }, "Zamknięto")) await load(); }} disabled={busy === p.id}
                        className="text-[9px] font-mono uppercase tracking-widest px-2 py-1 border border-zinc-700 text-zinc-300 hover:border-zinc-500 disabled:opacity-50">Zamknij</button>
                    ) : (
                      <button onClick={async () => { if (await call({ action: "reopen", id: p.id }, "Otwarto")) await load(); }} disabled={busy === p.id}
                        className="text-[9px] font-mono uppercase tracking-widest px-2 py-1 border border-green-800 text-green-300 hover:border-green-600 disabled:opacity-50">Otwórz</button>
                    )}
                    <button onClick={async () => { if (window.confirm("Usunąć ankietę?") && await call({ action: "delete", id: p.id }, "Usunięto")) await load(); }} disabled={busy === p.id}
                      className="text-zinc-500 hover:text-red-400 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="space-y-1">
                  {p.options.map((opt, i) => {
                    const count = p.counts[i] ?? 0;
                    const pct = p.totalVotes > 0 ? (count / p.totalVotes) * 100 : 0;
                    return (
                      <div key={i} className="relative border border-zinc-800 overflow-hidden">
                        <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: `${p.accentColor}33` }} />
                        <div className="relative flex items-center justify-between px-2 py-1 text-[11px]">
                          <span className="text-zinc-300">{opt}</span>
                          <span className="font-mono text-zinc-500 tabular-nums">{pct.toFixed(0)}% · {count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

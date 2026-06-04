"use client";
// src/components/admin/sections/CodeDrops.tsx — lazily-loaded overlay code-drop manager.
import { useState } from "react";
import { Gift, Loader2, Check, Copy, Plus, Eye, EyeOff, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionCard, FieldInput } from "../shared";
import { CodeCard } from "@/components/CodeCard";
import type { CodeRow, CodeConfig } from "../types";

export function CodeDropsCard({
  codes, config, overlayToken, onToast,
}: {
  codes: CodeRow[];
  config: CodeConfig;
  overlayToken: string | null;
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [list, setList] = useState<CodeRow[]>(codes);
  const [enabled, setEnabled] = useState(config.enabled);
  const [intervalMin, setIntervalMin] = useState(String(Math.max(1, Math.round(config.intervalSeconds / 60))));
  const [title, setTitle] = useState(config.title);
  const [accent, setAccent] = useState(config.accentColor);
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const overlayUrl = overlayToken ? `${origin}/overlay/codes?token=${overlayToken}` : null;
  const activeCount = list.filter((c) => c.active).length;

  async function reload() {
    try {
      const r = await fetch("/api/admin/section-data?s=codes");
      if (r.ok) { const d = await r.json(); setList(d.codes ?? []); }
    } catch { /* keep current list */ }
  }

  async function call(payload: Record<string, unknown>, okMsg?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { onToast("err", data.error ?? "Błąd"); return false; }
      if (okMsg) onToast("ok", okMsg);
      return true;
    } catch {
      onToast("err", "Błąd sieci");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Drop kodów (overlay)" icon={Gift}>
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 leading-relaxed">
          Pula kodów (np. klucze do gier). Overlay losuje i pokazuje <strong className="text-zinc-300">jeden kod na ekranie</strong>,
          zmieniając go co ustawiony czas. Każdy kod wejdzie zanim któryś się powtórzy.
        </p>

        {/* Config */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 border border-zinc-800 bg-black/30 p-2 cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-green-500" />
            <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">Overlay włączony</span>
          </label>
          <FieldInput label="Zmiana kodu co (minuty)" value={intervalMin} onChange={setIntervalMin} type="number" placeholder="10" />
          <FieldInput label="Nagłówek na karcie" value={title} onChange={setTitle} placeholder="Darmowy kod!" />
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Kolor akcentu</label>
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-full h-9 bg-black border border-zinc-800 cursor-pointer" />
          </div>
        </div>
        <button
          onClick={() => call({ action: "config", enabled, intervalSeconds: Math.max(1, parseInt(intervalMin) || 10) * 60, title, accentColor: accent }, "Ustawienia zapisane")}
          disabled={busy}
          className="w-full px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Zapisz ustawienia
        </button>

        {/* Live preview */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Podgląd (tak wygląda na streamie)</label>
          <div className="border border-zinc-800 rounded-sm p-6 flex justify-center" style={{ background: "repeating-conic-gradient(#18181b 0% 25%, #0a0a0a 0% 50%) 50% / 24px 24px" }}>
            <CodeCard title={title || "Kod"} label="Cyberpunk 2077 (Steam)" code="ABCD-EFGH-IJKL" accent={accent} />
          </div>
        </div>

        {/* Overlay URL */}
        {overlayUrl && (
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">URL do OBS (Browser Source)</label>
            <div className="flex gap-2">
              <input readOnly value={overlayUrl} className="flex-1 bg-black border border-zinc-800 px-3 py-2 text-xs text-zinc-300 font-mono truncate" />
              <button
                onClick={() => { navigator.clipboard.writeText(overlayUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="px-3 border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-all"
                title="Kopiuj"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        )}

        {/* Bulk add */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Dodaj kody (jeden na linię; opcjonalnie „Etykieta | KOD")
          </label>
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={4}
            placeholder={"Cyberpunk 2077 (Steam) | ABCD-EFGH-IJKL\nXXXX-YYYY-ZZZZ"}
            className="w-full bg-black border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:border-green-600 outline-hidden"
          />
          <button
            onClick={async () => { if (await call({ action: "add", text: bulk }, "Kody dodane")) { setBulk(""); await reload(); } }}
            disabled={busy || !bulk.trim()}
            className="mt-2 w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" /> Dodaj kody
          </button>
        </div>

        {/* List */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-zinc-400">{list.length} kodów ({activeCount} aktywnych)</span>
            <div className="flex gap-3">
              <button
                onClick={async () => { if (await call({ action: "reset_shown" }, "Liczniki wyzerowane")) await reload(); }}
                disabled={busy}
                className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
              >
                Zeruj liczniki
              </button>
              <button
                onClick={async () => { if (window.confirm("Usunąć WSZYSTKIE kody?") && await call({ action: "clear" }, "Wszystkie kody usunięte")) await reload(); }}
                disabled={busy}
                className="text-[10px] font-mono uppercase tracking-widest text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                Usuń wszystkie
              </button>
            </div>
          </div>
          <div className="space-y-1 max-h-[320px] overflow-y-auto">
            {list.length === 0 && <p className="text-zinc-600 text-sm py-2">Brak kodów — dodaj pulę powyżej.</p>}
            {list.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "flex items-center gap-2 border px-2 py-1.5",
                  c.active ? "border-zinc-800 bg-zinc-950" : "border-zinc-900 bg-black/40 opacity-60",
                )}
              >
                <div className="flex-1 min-w-0">
                  {c.label && <div className="text-[11px] text-zinc-400 truncate">{c.label}</div>}
                  <div className="font-mono text-xs text-white truncate">{c.code}</div>
                </div>
                <span className="text-[9px] font-mono text-zinc-500 whitespace-nowrap" title="Ile razy pokazany">×{c.shownCount}</span>
                <button
                  onClick={async () => { if (await call({ action: "toggle", id: c.id })) await reload(); }}
                  disabled={busy}
                  title={c.active ? "Wyłącz z rotacji" : "Włącz do rotacji"}
                  className="text-zinc-500 hover:text-white disabled:opacity-50"
                >
                  {c.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={async () => { if (await call({ action: "delete", id: c.id })) await reload(); }}
                  disabled={busy}
                  title="Usuń"
                  className="text-zinc-500 hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

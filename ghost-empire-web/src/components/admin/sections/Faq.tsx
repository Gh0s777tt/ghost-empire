"use client";
// src/components/admin/sections/Faq.tsx — lazily-loaded FAQ / auto-responses manager.
import { useState, useEffect, useCallback } from "react";
import { HelpCircle, Loader2, Eye, EyeOff, Pencil, Trash2, Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionCard } from "../shared";

type FaqRow = {
  id: string;
  keyword: string;
  matchType: string;
  response: string;
  cooldownSeconds: number;
  enabled: boolean;
};

export function FaqManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [fKeyword, setFKeyword] = useState("");
  const [fMatchType, setFMatchType] = useState("contains");
  const [fResponse, setFResponse] = useState("");
  const [fCooldown, setFCooldown] = useState("30");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/faq");
      const data = await res.json();
      if (res.ok) setFaqs(data.faqs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function call(action: string, payload: Record<string, unknown>) {
    const res = await fetch("/api/admin/faq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) {
      onToast("err", data.error ?? "Błąd");
      return false;
    }
    return true;
  }

  function resetForm() {
    setEditingId(null);
    setFKeyword("");
    setFMatchType("contains");
    setFResponse("");
    setFCooldown("30");
  }

  function startEdit(f: FaqRow) {
    setEditingId(f.id);
    setFKeyword(f.keyword);
    setFMatchType(f.matchType);
    setFResponse(f.response);
    setFCooldown(String(f.cooldownSeconds));
  }

  async function submit() {
    const keyword = fKeyword.trim();
    const response = fResponse.trim();
    const cooldownSeconds = Math.max(0, parseInt(fCooldown, 10) || 0);
    if (!keyword || !response) {
      onToast("err", "Wpisz słowo kluczowe i odpowiedź");
      return;
    }
    setBusy("form");
    const payload = { keyword, matchType: fMatchType, response, cooldownSeconds };
    const ok = editingId
      ? await call("update", { id: editingId, ...payload })
      : await call("create", payload);
    if (ok) {
      onToast("ok", editingId ? "Zapisano" : "FAQ dodane");
      resetForm();
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  async function toggleEnabled(f: FaqRow) {
    setBusy(f.id);
    if (await call("update", { id: f.id, enabled: !f.enabled })) await load();
    setBusy(null);
  }

  async function deleteFaq(f: FaqRow) {
    if (!confirm(`Usunąć FAQ "${f.keyword}"?`)) return;
    setBusy(f.id);
    if (await call("delete", { id: f.id })) {
      onToast("ok", "Usunięto");
      if (editingId === f.id) resetForm();
      await load();
    }
    setBusy(null);
  }

  return (
    <SectionCard title="FAQ / auto-odpowiedzi" icon={HelpCircle}>
      <p className="text-zinc-500 text-xs mb-3">
        Bot odpowiada, gdy wiadomość <strong>zawiera</strong> słowo kluczowe (nie tylko <code className="text-zinc-300">!komendy</code>).
        Działa na Twitch + Kick + YouTube. „Całe słowo" = dopasowanie tylko jako osobny wyraz.
      </p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : (
        <div className="space-y-2 mb-4">
          {faqs.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
              Brak wpisów FAQ. Dodaj pierwszy poniżej.
            </div>
          ) : (
            faqs.map((f) => (
              <div
                key={f.id}
                className={cn(
                  "border bg-black/30 p-3",
                  f.enabled ? "border-zinc-800" : "border-zinc-900 opacity-60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[11px] font-mono px-1.5 py-0.5 border border-blue-800 bg-blue-950/30 text-blue-300 shrink-0">
                      {f.keyword}
                    </span>
                    <span className="text-[9px] font-mono uppercase text-zinc-600 shrink-0">
                      {f.matchType === "word" ? "słowo" : "zawiera"}
                    </span>
                    <span className="text-sm text-zinc-300 truncate">{f.response}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-mono text-zinc-600 mr-1" title="Cooldown">{f.cooldownSeconds}s</span>
                    <button
                      onClick={() => toggleEnabled(f)}
                      disabled={busy === f.id || pending}
                      className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center"
                      title={f.enabled ? "Wyłącz" : "Włącz"}
                    >
                      {f.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => startEdit(f)}
                      disabled={busy === f.id || pending}
                      className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center"
                      title="Edytuj"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteFaq(f)}
                      disabled={busy === f.id || pending}
                      className="text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-6 h-6 flex items-center justify-center"
                      title="Usuń"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create / edit form */}
      <div className="border border-zinc-800 bg-black/30 p-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
          {editingId ? "Edytuj FAQ" : "Dodaj FAQ"}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[160px_120px_1fr_90px] gap-2 mb-2">
          <input
            value={fKeyword}
            onChange={(e) => setFKeyword(e.target.value)}
            placeholder="słowo kluczowe"
            className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
          />
          <select
            value={fMatchType}
            onChange={(e) => setFMatchType(e.target.value)}
            className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
          >
            <option value="contains">zawiera</option>
            <option value="word">całe słowo</option>
          </select>
          <input
            value={fResponse}
            onChange={(e) => setFResponse(e.target.value)}
            placeholder="Odpowiedź bota…"
            className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
          />
          <input
            type="number"
            value={fCooldown}
            onChange={(e) => setFCooldown(e.target.value)}
            min={0}
            title="Cooldown (sekundy)"
            className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={submit}
            disabled={busy === "form" || pending}
            className="bg-red-900/40 border border-red-800 hover:border-red-600 text-red-200 px-3 py-1.5 text-xs font-mono uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy === "form" ? <Loader2 className="w-3 h-3 animate-spin" /> : editingId ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {editingId ? "Zapisz" : "Dodaj"}
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              disabled={busy === "form"}
              className="border border-zinc-800 hover:border-zinc-600 text-zinc-400 px-3 py-1.5 text-xs font-mono uppercase tracking-widest"
            >
              Anuluj
            </button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

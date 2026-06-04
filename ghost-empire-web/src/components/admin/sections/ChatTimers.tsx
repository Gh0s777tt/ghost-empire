"use client";
// src/components/admin/sections/ChatTimers.tsx — lazily-loaded cyclic chat timers.
import { useState, useEffect, useCallback } from "react";
import { Clock, Loader2, Eye, EyeOff, Pencil, Trash2, Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionCard } from "../shared";

type ChatTimerRow = {
  id: string;
  message: string;
  intervalSeconds: number;
  enabled: boolean;
};

export function ChatTimersManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [timers, setTimers] = useState<ChatTimerRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [fMessage, setFMessage] = useState("");
  const [fMinutes, setFMinutes] = useState("15");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/chat-timers");
      const data = await res.json();
      if (res.ok) setTimers(data.timers ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function call(action: string, payload: Record<string, unknown>) {
    const res = await fetch("/api/admin/chat-timers", {
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
    setFMessage("");
    setFMinutes("15");
  }

  function startEdit(t: ChatTimerRow) {
    setEditingId(t.id);
    setFMessage(t.message);
    setFMinutes(String(Math.max(1, Math.round(t.intervalSeconds / 60))));
  }

  async function submit() {
    const message = fMessage.trim();
    const minutes = Math.max(1, parseInt(fMinutes, 10) || 0);
    if (!message) {
      onToast("err", "Wpisz wiadomość");
      return;
    }
    setBusy("form");
    const intervalSeconds = minutes * 60;
    const ok = editingId
      ? await call("update", { id: editingId, message, intervalSeconds })
      : await call("create", { message, intervalSeconds });
    if (ok) {
      onToast("ok", editingId ? "Zapisano" : "Timer dodany");
      resetForm();
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  async function toggleEnabled(t: ChatTimerRow) {
    setBusy(t.id);
    if (await call("update", { id: t.id, enabled: !t.enabled })) await load();
    setBusy(null);
  }

  async function deleteTimer(t: ChatTimerRow) {
    if (!confirm("Usunąć ten timer?")) return;
    setBusy(t.id);
    if (await call("delete", { id: t.id })) {
      onToast("ok", "Usunięto");
      if (editingId === t.id) resetForm();
      await load();
    }
    setBusy(null);
  }

  return (
    <SectionCard title="Timery (cykliczne wiadomości)" icon={Clock}>
      <p className="text-zinc-500 text-xs mb-3">
        Bot wrzuca te wiadomości co X minut na <strong>Twitch + Kick + YouTube</strong> —
        tylko gdy czat jest aktywny (czyli podczas streamu).
      </p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : (
        <div className="space-y-2 mb-4">
          {timers.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
              Brak timerów. Dodaj pierwszy poniżej.
            </div>
          ) : (
            timers.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "border bg-black/30 p-3",
                  t.enabled ? "border-zinc-800" : "border-zinc-900 opacity-60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 border border-zinc-700 text-zinc-400 shrink-0">
                      co {Math.max(1, Math.round(t.intervalSeconds / 60))} min
                    </span>
                    <span className="text-sm text-zinc-300 truncate">{t.message}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleEnabled(t)}
                      disabled={busy === t.id || pending}
                      className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center"
                      title={t.enabled ? "Wyłącz" : "Włącz"}
                    >
                      {t.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => startEdit(t)}
                      disabled={busy === t.id || pending}
                      className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center"
                      title="Edytuj"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteTimer(t)}
                      disabled={busy === t.id || pending}
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
          {editingId ? "Edytuj timer" : "Dodaj timer"}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-2 mb-2">
          <input
            value={fMessage}
            onChange={(e) => setFMessage(e.target.value)}
            placeholder="Wiadomość (np. Wbijaj na portal po GT!)"
            className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
          />
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={fMinutes}
              onChange={(e) => setFMinutes(e.target.value)}
              min={1}
              className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
            />
            <span className="text-xs text-zinc-500 shrink-0">min</span>
          </div>
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

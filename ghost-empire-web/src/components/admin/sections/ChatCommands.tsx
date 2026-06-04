"use client";
// src/components/admin/sections/ChatCommands.tsx — lazily-loaded chat commands manager
// (incl. conditional gating: requiresLive / activeFromMinute).
import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Loader2, Eye, EyeOff, Pencil, Trash2, Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionCard } from "../shared";

type ChatCommandRow = {
  id: string;
  trigger: string;
  response: string;
  cooldownSeconds: number;
  enabled: boolean;
  requiresLive: boolean;
  activeFromMinute: number;
};

export function ChatCommandsManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [commands, setCommands] = useState<ChatCommandRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Create / edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fTrigger, setFTrigger] = useState("");
  const [fResponse, setFResponse] = useState("");
  const [fCooldown, setFCooldown] = useState("15");
  const [fRequiresLive, setFRequiresLive] = useState(false);
  const [fActiveFrom, setFActiveFrom] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/chat-commands");
      const data = await res.json();
      if (res.ok) setCommands(data.commands ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function call(action: string, payload: Record<string, unknown>) {
    const res = await fetch("/api/admin/chat-commands", {
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
    setFTrigger("");
    setFResponse("");
    setFCooldown("15");
    setFRequiresLive(false);
    setFActiveFrom("0");
  }

  function startEdit(c: ChatCommandRow) {
    setEditingId(c.id);
    setFTrigger(c.trigger);
    setFResponse(c.response);
    setFCooldown(String(c.cooldownSeconds));
    setFRequiresLive(c.requiresLive);
    setFActiveFrom(String(c.activeFromMinute));
  }

  async function submit() {
    const trigger = fTrigger.trim().toLowerCase();
    const response = fResponse.trim();
    const cooldownSeconds = Math.max(0, parseInt(fCooldown, 10) || 0);
    const activeFromMinute = Math.max(0, parseInt(fActiveFrom, 10) || 0);
    if (!trigger || !response) {
      onToast("err", "Wpisz trigger i odpowiedź");
      return;
    }
    setBusy("form");
    const fields = { trigger, response, cooldownSeconds, requiresLive: fRequiresLive, activeFromMinute };
    const ok = editingId
      ? await call("update", { id: editingId, ...fields })
      : await call("create", fields);
    if (ok) {
      onToast("ok", editingId ? "Zapisano" : "Komenda dodana");
      resetForm();
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  async function toggleEnabled(c: ChatCommandRow) {
    setBusy(c.id);
    if (await call("update", { id: c.id, enabled: !c.enabled })) await load();
    setBusy(null);
  }

  async function deleteCmd(c: ChatCommandRow) {
    if (!confirm(`Usunąć komendę ${c.trigger}?`)) return;
    setBusy(c.id);
    if (await call("delete", { id: c.id })) {
      onToast("ok", "Usunięto");
      if (editingId === c.id) resetForm();
      await load();
    }
    setBusy(null);
  }

  return (
    <SectionCard title="Komendy czatu" icon={MessageSquare}>
      <p className="text-zinc-500 text-xs mb-3">
        Działają na <strong>Twitch + Kick + YouTube</strong>. Bot pobiera włączone komendy co ~2 min.
        Trigger to pierwsze słowo wiadomości, np. <code className="text-zinc-300">!portal</code>.
      </p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : (
        <div className="space-y-2 mb-4">
          {commands.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
              Brak komend. Dodaj pierwszą poniżej.
            </div>
          ) : (
            commands.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "border bg-black/30 p-3",
                  c.enabled ? "border-zinc-800" : "border-zinc-900 opacity-60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[11px] font-mono px-1.5 py-0.5 border border-red-800 bg-red-950/30 text-red-300 shrink-0">
                      {c.trigger}
                    </span>
                    {c.requiresLive && (
                      <span className="text-[9px] font-mono px-1 py-0.5 border border-green-800 bg-green-950/30 text-green-400 shrink-0" title="Działa tylko, gdy stream jest na żywo">
                        LIVE
                      </span>
                    )}
                    {c.activeFromMinute > 0 && (
                      <span className="text-[9px] font-mono px-1 py-0.5 border border-zinc-700 text-zinc-400 shrink-0" title={`Aktywna dopiero po ${c.activeFromMinute} min od startu streamu`}>
                        ≥{c.activeFromMinute}min
                      </span>
                    )}
                    <span className="text-sm text-zinc-300 truncate">{c.response}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-mono text-zinc-600 mr-1" title="Cooldown">{c.cooldownSeconds}s</span>
                    <button
                      onClick={() => toggleEnabled(c)}
                      disabled={busy === c.id || pending}
                      className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center"
                      title={c.enabled ? "Wyłącz" : "Włącz"}
                    >
                      {c.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => startEdit(c)}
                      disabled={busy === c.id || pending}
                      className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center"
                      title="Edytuj"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteCmd(c)}
                      disabled={busy === c.id || pending}
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
          {editingId ? "Edytuj komendę" : "Dodaj komendę"}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_90px] gap-2 mb-2">
          <input
            value={fTrigger}
            onChange={(e) => setFTrigger(e.target.value)}
            placeholder="!komenda"
            className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono focus:border-red-700 outline-hidden"
          />
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2">
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={fRequiresLive}
              onChange={(e) => setFRequiresLive(e.target.checked)}
              className="accent-red-600"
            />
            Tylko na żywo
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400">
            Aktywna od minuty
            <input
              type="number"
              value={fActiveFrom}
              onChange={(e) => setFActiveFrom(e.target.value)}
              min={0}
              title="Komenda zacznie działać dopiero po N minutach od startu streamu (0 = od razu). Implikuje „na żywo”."
              className="w-16 bg-black border border-zinc-800 px-2 py-1 text-sm text-white focus:border-red-700 outline-hidden"
            />
          </label>
          <span className="text-[10px] text-zinc-600">Wymaga subskrypcji <span className="font-mono">stream.online</span> (/admin#twitch).</span>
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

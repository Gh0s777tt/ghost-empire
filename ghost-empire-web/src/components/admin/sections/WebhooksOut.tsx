"use client";
// src/components/admin/sections/WebhooksOut.tsx
// Manage outgoing webhooks: POST stream events to Discord / n8n / Zapier / custom URLs.
import { useCallback, useEffect, useState } from "react";
import { Webhook, Loader2, Plus, Trash2, Send, Power } from "lucide-react";
import { SectionCard } from "../shared";

type Hook = {
  id: string; label: string; url: string; events: string[];
  hasSecret: boolean; enabled: boolean; failCount: number;
  lastStatus: number | null; lastFiredAt: string | null;
};

const EVENT_LABEL: Record<string, string> = {
  shop_purchase: "Zakup w sklepie", event_win: "Wygrana w evencie", drop_claim_bonus: "Odbiór drop-kodu",
  twitch_sub: "Sub (Twitch)", twitch_gift_sub: "Gift sub", twitch_cheer: "Bity (cheer)",
  donation: "Donacja", welcome: "Powitanie", level_up: "Level up", wheel_win: "Wygrana w Kole",
};

export function WebhooksOutManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [hooks, setHooks] = useState<Hook[] | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // create form
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [allEvents, setAllEvents] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/webhooks-out");
    if (r.ok) { const d = await r.json(); setHooks(d.webhooks); setEvents(d.events); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function call(payload: Record<string, unknown>): Promise<unknown | null> {
    const r = await fetch("/api/admin/webhooks-out", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (!r.ok) { onToast("err", d.error ?? "Błąd"); return null; }
    return d;
  }

  async function create() {
    if (!url.trim()) { onToast("err", "Podaj URL"); return; }
    const evs = allEvents ? ["*"] : [...picked];
    if (evs.length === 0) { onToast("err", "Wybierz min. 1 event"); return; }
    setBusy("create");
    const ok = await call({ action: "create", label: label.trim() || "Webhook", url: url.trim(), events: evs, secret: secret.trim() || undefined });
    if (ok) {
      setLabel(""); setUrl(""); setSecret(""); setPicked(new Set()); setAllEvents(false);
      onToast("ok", "Webhook dodany"); await load(); onSuccess();
    }
    setBusy(null);
  }

  async function toggle(h: Hook) {
    setBusy(h.id);
    if (await call({ action: "update", id: h.id, enabled: !h.enabled })) { await load(); }
    setBusy(null);
  }
  async function remove(h: Hook) {
    if (!confirm(`Usunąć webhook „${h.label}"?`)) return;
    setBusy(h.id);
    if (await call({ action: "delete", id: h.id })) { onToast("ok", "Usunięto"); await load(); }
    setBusy(null);
  }
  async function test(h: Hook) {
    setBusy(h.id);
    const r = (await call({ action: "test", id: h.id })) as { ok?: boolean; status?: number; error?: string } | null;
    if (r) onToast(r.ok ? "ok" : "err", r.ok ? `Test OK (HTTP ${r.status})` : `Test nieudany (${r.error ?? r.status})`);
    await load();
    setBusy(null);
  }

  function togglePick(e: string) {
    setPicked((s) => { const n = new Set(s); n.has(e) ? n.delete(e) : n.add(e); return n; });
  }

  if (!hooks) {
    return (
      <SectionCard title="Webhooki wychodzące" icon={Webhook}>
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Webhooki wychodzące" icon={Webhook}>
      <p className="text-zinc-500 text-xs mb-4 leading-relaxed">
        Wysyłaj zdarzenia streamu (suby, donacje, zakupy, wygrane…) jako <strong className="text-zinc-300">POST JSON</strong> na dowolny URL —
        <strong className="text-zinc-300"> Discord webhook</strong>, n8n, Zapier, własny serwer. Opcjonalny sekret podpisuje treść
        (<code className="text-zinc-400">X-GhostEmpire-Signature: sha256=…</code>). Martwy endpoint sam się wyłącza po serii błędów.
      </p>

      {/* existing */}
      <div className="space-y-2 mb-4">
        {hooks.length === 0 ? (
          <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">Brak webhooków. Dodaj pierwszy poniżej.</div>
        ) : hooks.map((h) => (
          <div key={h.id} className={`border p-3 ${h.enabled ? "border-zinc-800 bg-black/30" : "border-zinc-900 bg-black/10 opacity-60"}`}>
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">{h.label} {h.hasSecret && <span title="podpisany sekretem">🔑</span>}</div>
                <div className="text-[10px] font-mono text-zinc-500 truncate">{h.url}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => test(h)} disabled={busy === h.id || pending} className="p-1.5 border border-zinc-700 text-zinc-300 hover:border-blue-500 hover:text-blue-300 disabled:opacity-50" title="Wyślij testowy">
                  <Send className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => toggle(h)} disabled={busy === h.id || pending} className={`p-1.5 border disabled:opacity-50 ${h.enabled ? "border-green-800 text-green-400" : "border-zinc-700 text-zinc-500"}`} title={h.enabled ? "Wyłącz" : "Włącz"}>
                  <Power className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => remove(h)} disabled={busy === h.id || pending} className="p-1.5 border border-zinc-700 text-zinc-400 hover:border-red-500 hover:text-red-400 disabled:opacity-50" title="Usuń">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {h.events.includes("*")
                ? <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 border border-violet-800 text-violet-300">wszystkie</span>
                : h.events.map((e) => <span key={e} className="text-[9px] font-mono px-1.5 py-0.5 border border-zinc-800 text-zinc-400">{EVENT_LABEL[e] ?? e}</span>)}
            </div>
            {(h.lastFiredAt || h.failCount > 0) && (
              <div className="text-[10px] text-zinc-600 mt-1.5">
                {h.lastFiredAt && <>ostatnio: {new Date(h.lastFiredAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })} · status {h.lastStatus ?? "—"}</>}
                {h.failCount > 0 && <span className="text-orange-400"> · błędy: {h.failCount}</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* create */}
      <div className="border border-zinc-800 bg-black/30 p-3 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Nowy webhook</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nazwa (np. Discord #alerty)" className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white outline-hidden focus:border-blue-600" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/…" className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-blue-600" />
        </div>
        <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Sekret HMAC (opcjonalny — podpisuje treść)" autoComplete="off" className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-blue-600" />
        <div>
          <label className="flex items-center gap-2 text-xs text-zinc-300 mb-1.5">
            <input type="checkbox" checked={allEvents} onChange={(e) => setAllEvents(e.target.checked)} className="accent-violet-600" />
            Wszystkie eventy
          </label>
          {!allEvents && (
            <div className="flex flex-wrap gap-1.5">
              {events.map((e) => (
                <button key={e} type="button" onClick={() => togglePick(e)} className={`text-[10px] px-2 py-1 border ${picked.has(e) ? "border-blue-600 bg-blue-950/30 text-blue-200" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"}`}>
                  {EVENT_LABEL[e] ?? e}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={create} disabled={busy === "create" || pending} className="w-full px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2">
          {busy === "create" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Dodaj webhook
        </button>
      </div>
    </SectionCard>
  );
}

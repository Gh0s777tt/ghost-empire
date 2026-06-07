"use client";
// src/components/admin/sections/WebhooksOut.tsx
// Manage outgoing webhooks: POST stream events to Discord / n8n / Zapier / custom URLs.
import { useCallback, useEffect, useState } from "react";
import { Webhook, Loader2, Plus, Trash2, Send, Power } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";

type Hook = {
  id: string; label: string; url: string; events: string[];
  hasSecret: boolean; enabled: boolean; failCount: number;
  lastStatus: number | null; lastFiredAt: string | null;
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
  const t = useTranslations("admin.webhooksOut");
  const EVENT_LABEL = t.raw("eventLabel") as Record<string, string>;

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
    if (!r.ok) { onToast("err", d.error ?? t("err")); return null; }
    return d;
  }

  async function create() {
    if (!url.trim()) { onToast("err", t("urlRequired")); return; }
    const evs = allEvents ? ["*"] : [...picked];
    if (evs.length === 0) { onToast("err", t("eventRequired")); return; }
    setBusy("create");
    const ok = await call({ action: "create", label: label.trim() || "Webhook", url: url.trim(), events: evs, secret: secret.trim() || undefined });
    if (ok) {
      setLabel(""); setUrl(""); setSecret(""); setPicked(new Set()); setAllEvents(false);
      onToast("ok", t("created")); await load(); onSuccess();
    }
    setBusy(null);
  }

  async function toggle(h: Hook) {
    setBusy(h.id);
    if (await call({ action: "update", id: h.id, enabled: !h.enabled })) { await load(); }
    setBusy(null);
  }
  async function remove(h: Hook) {
    if (!confirm(t("deleteConfirm", { label: h.label }))) return;
    setBusy(h.id);
    if (await call({ action: "delete", id: h.id })) { onToast("ok", t("deleted")); await load(); }
    setBusy(null);
  }
  async function test(h: Hook) {
    setBusy(h.id);
    const r = (await call({ action: "test", id: h.id })) as { ok?: boolean; status?: number; error?: string } | null;
    if (r) onToast(r.ok ? "ok" : "err", r.ok ? t("testOk", { status: String(r.status) }) : t("testFail", { err: String(r.error ?? r.status) }));
    await load();
    setBusy(null);
  }

  function togglePick(e: string) {
    setPicked((s) => { const n = new Set(s); n.has(e) ? n.delete(e) : n.add(e); return n; });
  }

  if (!hooks) {
    return (
      <SectionCard title={t("title")} icon={Webhook}>
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t("title")} icon={Webhook}>
      <p className="text-zinc-500 text-xs mb-4 leading-relaxed">
        {t.rich("intro", { b: (c) => <strong className="text-zinc-300">{c}</strong>, code: (c) => <code className="text-zinc-400">{c}</code> })}
      </p>

      {/* existing */}
      <div className="space-y-2 mb-4">
        {hooks.length === 0 ? (
          <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">{t("empty")}</div>
        ) : hooks.map((h) => (
          <div key={h.id} className={`border p-3 ${h.enabled ? "border-zinc-800 bg-black/30" : "border-zinc-900 bg-black/10 opacity-60"}`}>
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">{h.label} {h.hasSecret && <span title={t("signedTitle")}>🔑</span>}</div>
                <div className="text-[10px] font-mono text-zinc-500 truncate">{h.url}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => test(h)} disabled={busy === h.id || pending} className="p-1.5 border border-zinc-700 text-zinc-300 hover:border-blue-500 hover:text-blue-300 disabled:opacity-50" title={t("testTitle")}>
                  <Send className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => toggle(h)} disabled={busy === h.id || pending} className={`p-1.5 border disabled:opacity-50 ${h.enabled ? "border-green-800 text-green-400" : "border-zinc-700 text-zinc-500"}`} title={h.enabled ? t("disable") : t("enable")}>
                  <Power className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => remove(h)} disabled={busy === h.id || pending} className="p-1.5 border border-zinc-700 text-zinc-400 hover:border-red-500 hover:text-red-400 disabled:opacity-50" title={t("deleteTitle")}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {h.events.includes("*")
                ? <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 border border-violet-800 text-violet-300">{t("allBadge")}</span>
                : h.events.map((e) => <span key={e} className="text-[9px] font-mono px-1.5 py-0.5 border border-zinc-800 text-zinc-400">{EVENT_LABEL[e] ?? e}</span>)}
            </div>
            {(h.lastFiredAt || h.failCount > 0) && (
              <div className="text-[10px] text-zinc-600 mt-1.5">
                {h.lastFiredAt && <>{t("lastFired", { date: new Date(h.lastFiredAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" }), status: String(h.lastStatus ?? "—") })}</>}
                {h.failCount > 0 && <span className="text-orange-400"> {t("errorsCount", { count: h.failCount })}</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* create */}
      <div className="border border-zinc-800 bg-black/30 p-3 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("newWebhook")}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("labelPh")} className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white outline-hidden focus:border-blue-600" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/…" className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-blue-600" />
        </div>
        <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={t("secretPh")} autoComplete="off" className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-blue-600" />
        <div>
          <label className="flex items-center gap-2 text-xs text-zinc-300 mb-1.5">
            <input type="checkbox" checked={allEvents} onChange={(e) => setAllEvents(e.target.checked)} className="accent-violet-600" />
            {t("allEvents")}
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
          {t("addBtn")}
        </button>
      </div>
    </SectionCard>
  );
}

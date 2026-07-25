"use client";
// src/components/admin/sections/DonationIntegrations.tsx
// Connect a donation provider to THIS portal (#donation-layer).
//
// This is the surface that makes the ingest routes usable: they 404 until an integration row exists
// and is enabled. The streamer copies their per-portal webhook URL, pastes the provider's token, and
// switches it on — no OAuth app, no partner approval, nothing shared with other portals.
//
// Copy is inline PL/EN (same pattern as the other recent sections) so it needs no locale files.
import { useState, useEffect, useCallback } from "react";
import { useLocale } from "next-intl";
import { Webhook, Loader2, Check, Copy, Trash2, RefreshCw, ShieldCheck, ShieldAlert, ExternalLink } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { SectionCard } from "../shared";

type Provider = { key: string; label: string; help: string; maxTrust: "verified" | "unverified"; needs: "secret" | "widgetId" | "oauth"; configured?: boolean };
type Integration = {
  id: string; provider: string; enabled: boolean; trust: string; hasSecret: boolean;
  webhookPath: string | null; externalRef: string | null; lastEventAt: string | null; lastError: string | null;
};

const T = {
  pl: {
    title: "Integracje donacji", loading: "Ładowanie…",
    intro: "Podłącz swoje narzędzie do donacji. Każda wpłata trafi do portalu: doda widzowi walutę, odpali alert i podbije cele.",
    url: "Twój adres webhooka", copy: "Kopiuj", copied: "Skopiowano ✓",
    token: "Token / sekret od dostawcy", tokenSet: "zapisany", tokenNone: "brak",
    widget: "Link widgetu (TIP_ALERT)", widgetSet: "zapisany",
    connect: "Połącz", reconnect: "Połącz ponownie", connected: "Połączono ✓",
    notConfigured: "Właściciel platformy musi najpierw dodać dane aplikacji OAuth (patrz docs/OWNER-SETUP.md §9) — dopóki ich nie ma, przycisk nic nie zrobi.",
    save: "Zapisz", enable: "Włączona", generate: "Wygeneruj sekret", rotate: "Nowy sekret", del: "Usuń",
    verified: "Może naliczać walutę automatycznie", unverified: "Zawsze wymaga Twojego zatwierdzenia w kolejce donacji",
    lastEvent: "Ostatnia wpłata", never: "jeszcze nic nie przyszło",
    saved: "Zapisano ✓", err: "Nie udało się zapisać",
    secretOnce: "Skopiuj teraz — nie pokażemy go ponownie:",
    codeHint: "Widz dostaje walutę automatycznie tylko wtedy, gdy w wiadomości wpłaty poda swój kod GE-XXXXXX (jest na jego profilu). Bez kodu wpłata czeka na Twoje przypisanie.",
  },
  en: {
    title: "Donation integrations", loading: "Loading…",
    intro: "Connect your donation tool. Every tip reaches the portal: it credits the viewer, fires an alert and moves your goals.",
    url: "Your webhook URL", copy: "Copy", copied: "Copied ✓",
    token: "Token / secret from the provider", tokenSet: "saved", tokenNone: "none",
    widget: "Widget link (TIP_ALERT)", widgetSet: "saved",
    connect: "Connect", reconnect: "Reconnect", connected: "Connected ✓",
    notConfigured: "The platform owner must add the OAuth app credentials first (see docs/OWNER-SETUP.md §9) — until then this button does nothing.",
    save: "Save", enable: "Enabled", generate: "Generate secret", rotate: "New secret", del: "Remove",
    verified: "May credit currency automatically", unverified: "Always needs your approval in the donation queue",
    lastEvent: "Last tip", never: "nothing received yet",
    saved: "Saved ✓", err: "Couldn't save",
    secretOnce: "Copy it now — it will not be shown again:",
    codeHint: "A viewer is credited automatically only when the tip message contains their GE-XXXXXX code (it is on their profile). Without it, the tip waits for you to assign it.",
  },
} as const;

export function DonationIntegrationsManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void; onSuccess?: () => void; pending?: boolean }) {
  const t = useLocale().startsWith("pl") ? T.pl : T.en;
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [rows, setRows] = useState<Integration[]>([]);
  const [secretDraft, setSecretDraft] = useState<Record<string, string>>({});
  const [freshSecret, setFreshSecret] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ providers: Provider[]; integrations: Integration[] }>("/api/admin/donation-integrations");
      setProviders(d.providers);
      setRows(d.integrations);
    } catch { /* section shows empty state */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(provider: string, action: "save" | "rotate" | "delete", extra: Record<string, unknown> = {}) {
    setBusy(provider);
    try {
      const r = await apiPost<{ ok: true; secret?: string }>("/api/admin/donation-integrations", { action, provider, ...extra });
      if (r.secret) setFreshSecret((s) => ({ ...s, [provider]: r.secret! }));
      setSecretDraft((s) => ({ ...s, [provider]: "" }));
      onToast("ok", t.saved);
      await load();
    } catch (e) {
      onToast("err", e instanceof ApiError ? e.message : t.err);
    } finally { setBusy(null); }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch { /* clipboard blocked — the value is visible to select manually */ }
  }

  if (loading) {
    return <SectionCard title={t.title} icon={Webhook}><div className="text-zinc-500 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t.loading}</div></SectionCard>;
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <SectionCard title={t.title} icon={Webhook}>
      <p className="text-zinc-500 text-xs mb-1">{t.intro}</p>
      <p className="text-zinc-600 text-[11px] mb-4">{t.codeHint}</p>

      <div className="space-y-3">
        {providers.map((p) => {
          const row = rows.find((r) => r.provider === p.key);
          const url = row?.webhookPath ? `${origin}${row.webhookPath}` : null;
          const isVerified = p.maxTrust === "verified";
          return (
            <div key={p.key} className="border border-zinc-800 bg-black/30 p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">{p.label}</div>
                  <div className={`text-[11px] flex items-center gap-1 ${isVerified ? "text-emerald-400" : "text-amber-400"}`}>
                    {isVerified ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                    {isVerified ? t.verified : t.unverified}
                  </div>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-300 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!row?.enabled}
                    disabled={busy === p.key}
                    onChange={(e) => void act(p.key, "save", { enabled: e.target.checked, ...(p.needs === "oauth" ? {} : p.needs === "widgetId" ? { externalRef: secretDraft[p.key] || undefined } : { secret: secretDraft[p.key] || undefined }) })}
                    className="accent-emerald-500"
                  />
                  {t.enable}
                </label>
              </div>

              <p className="text-[11px] text-zinc-500 mb-2 leading-snug">{p.help}</p>

              {url && (
                <div className="flex items-center gap-1.5 mb-2">
                  <input readOnly value={url} className="flex-1 min-w-0 bg-black border border-zinc-800 px-2 py-1.5 text-[11px] text-zinc-300 font-mono" />
                  <button onClick={() => void copy(url, `url-${p.key}`)} className="px-2 py-1.5 border border-zinc-700 text-zinc-300 hover:border-zinc-500" title={t.copy}>
                    {copied === `url-${p.key}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              {freshSecret[p.key] && (
                <div className="mb-2 border border-emerald-900/60 bg-emerald-950/20 p-2">
                  <div className="text-[10px] text-emerald-300 mb-1">{t.secretOnce}</div>
                  <div className="flex items-center gap-1.5">
                    <input readOnly value={freshSecret[p.key]} className="flex-1 min-w-0 bg-black border border-zinc-800 px-2 py-1 text-[11px] text-white font-mono" />
                    <button onClick={() => void copy(freshSecret[p.key], `sec-${p.key}`)} className="px-2 py-1 border border-zinc-700 text-zinc-300 hover:border-zinc-500">
                      {copied === `sec-${p.key}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                {p.needs === "oauth" ? (
                  <>
                    {/* "Connected" must come from the stored CREDENTIAL, not from row existence — a row
                        can exist with no grant, and calling that connected would be a lie. */}
                    {row?.hasSecret ? <span className="text-[11px] text-emerald-400 self-center">{t.connected}</span> : null}
                    {p.configured === false ? (
                      <span className="text-[11px] text-amber-400 flex-1 min-w-[14rem] leading-snug">{t.notConfigured}</span>
                    ) : (
                      <a
                        href={`/api/auth/${p.key}`}
                        className="px-2.5 py-1.5 border border-zinc-700 text-zinc-200 hover:border-emerald-600 text-[10px] font-bold tracking-widest uppercase"
                      >
                        {row?.hasSecret ? t.reconnect : t.connect}
                      </a>
                    )}
                  </>
                ) : p.needs === "widgetId" ? (
                  <>
                    <input
                      value={secretDraft[p.key] ?? ""}
                      onChange={(e) => setSecretDraft((s) => ({ ...s, [p.key]: e.target.value }))}
                      placeholder={`${t.widget}${row?.externalRef ? ` (${t.widgetSet})` : ""}`}
                      className="flex-1 min-w-[14rem] bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-500 placeholder:text-zinc-700"
                    />
                    <button onClick={() => void act(p.key, "save", { externalRef: secretDraft[p.key], enabled: !!row?.enabled })} disabled={busy === p.key || !secretDraft[p.key]}
                      className="px-2.5 py-1.5 border border-zinc-700 text-zinc-200 hover:border-emerald-600 text-[10px] font-bold tracking-widest uppercase disabled:opacity-40">
                      {t.save}
                    </button>
                  </>
                ) : p.key === "custom" ? (
                  <button onClick={() => void act(p.key, "rotate")} disabled={busy === p.key}
                    className="px-2.5 py-1.5 border border-zinc-700 text-zinc-200 hover:border-emerald-600 text-[10px] font-bold tracking-widest uppercase inline-flex items-center gap-1 disabled:opacity-50">
                    <RefreshCw className="w-3 h-3" /> {row?.hasSecret ? t.rotate : t.generate}
                  </button>
                ) : (
                  <>
                    <input
                      value={secretDraft[p.key] ?? ""}
                      onChange={(e) => setSecretDraft((s) => ({ ...s, [p.key]: e.target.value }))}
                      placeholder={`${t.token} (${row?.hasSecret ? t.tokenSet : t.tokenNone})`}
                      className="flex-1 min-w-[12rem] bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-500 placeholder:text-zinc-700"
                    />
                    <button onClick={() => void act(p.key, "save", { secret: secretDraft[p.key], enabled: !!row?.enabled })} disabled={busy === p.key || !secretDraft[p.key]}
                      className="px-2.5 py-1.5 border border-zinc-700 text-zinc-200 hover:border-emerald-600 text-[10px] font-bold tracking-widest uppercase disabled:opacity-40">
                      {t.save}
                    </button>
                  </>
                )}
                {row && (
                  <button onClick={() => void act(p.key, "delete")} disabled={busy === p.key}
                    className="px-2 py-1.5 border border-zinc-800 text-zinc-500 hover:border-red-700 hover:text-red-400 disabled:opacity-40" title={t.del}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {busy === p.key && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />}
              </div>

              {row && (
                <div className="mt-2 text-[10px] text-zinc-600">
                  {t.lastEvent}: {row.lastEventAt ? new Date(row.lastEventAt).toLocaleString() : t.never}
                  {row.lastError && <span className="ms-2 text-red-400">· {row.lastError}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <a href="https://ko-fi.com/manage/webhooks" target="_blank" rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300">
        ko-fi.com/manage/webhooks <ExternalLink className="w-3 h-3" />
      </a>
    </SectionCard>
  );
}

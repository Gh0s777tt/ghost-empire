"use client";
// src/components/admin/sections/Integrations.tsx — paste runtime/feature API keys here
// instead of hunting through env files. Stored in the DB (admin-only); secrets come
// back masked. Infra/auth secrets stay in env by design.
import { useState, useEffect, useCallback } from "react";
import { Plug, Loader2, Check, KeyRound } from "lucide-react";
import { SectionCard } from "../shared";

const AI_PROVIDERS: Array<[string, string]> = [
  ["anthropic", "Anthropic (Claude)"],
  ["openai", "OpenAI (GPT)"],
  ["grok", "xAI (Grok)"],
  ["gemini", "Google (Gemini)"],
  ["deepseek", "DeepSeek"],
  ["bielik", "Bielik (SpeakLeash)"],
];

type Meta = {
  aiProvider: string; aiModel: string;
  hasAiKey: boolean; aiKeyPreview: string | null;
  hasSentry: boolean; sentryPreview: string | null;
  obsWebsocketUrl: string;
  hasObsPassword: boolean; obsPasswordPreview: string | null;
};

function SecretField({ label, has, preview, value, onChange, onClear, placeholder }: {
  label: string; has: boolean; preview: string | null;
  value: string; onChange: (v: string) => void; onClear: () => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1 flex items-center gap-2">
        <KeyRound className="w-3 h-3" /> {label}
        {has && <span className="text-green-500 normal-case tracking-normal">● ustawiony ({preview})</span>}
      </label>
      <div className="flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={has ? "wklej nowy klucz, by nadpisać" : (placeholder ?? "wklej klucz…")}
          autoComplete="off"
          className="flex-1 bg-black border border-zinc-800 px-3 py-2 text-sm text-white font-mono outline-hidden focus:border-green-600"
        />
        {has && (
          <button type="button" onClick={onClear} className="px-2.5 border border-zinc-700 text-zinc-400 hover:border-red-500 hover:text-red-400 text-[10px] font-mono uppercase">
            Wyczyść
          </button>
        )}
      </div>
    </div>
  );
}

export function IntegrationsManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [saving, setSaving] = useState(false);

  // editable
  const [aiProvider, setAiProvider] = useState("anthropic");
  const [aiModel, setAiModel] = useState("");
  const [obsUrl, setObsUrl] = useState("");
  // secrets — empty unless the admin types a new value; null = clear
  const [aiKey, setAiKey] = useState<string | null>("");
  const [sentry, setSentry] = useState<string | null>("");
  const [obsPass, setObsPass] = useState<string | null>("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/integrations");
    if (r.ok) {
      const d: Meta = await r.json();
      setMeta(d); setAiProvider(d.aiProvider); setAiModel(d.aiModel); setObsUrl(d.obsWebsocketUrl);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { aiProvider, aiModel, obsWebsocketUrl: obsUrl };
      // Only send a field when it changed: a typed value sets it, explicit null clears.
      const touched = (v: string | null) => v === null || (typeof v === "string" && v.trim().length > 0);
      const fields: Array<[string, string | null]> = [["aiApiKey", aiKey], ["sentryDsn", sentry], ["obsWebsocketPassword", obsPass]];
      for (const [k, v] of fields) if (touched(v)) body[k] = v;

      const res = await fetch("/api/admin/integrations", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { onToast("err", d.error ?? "Błąd"); return; }
      onToast("ok", "Integracje zapisane");
      setAiKey(""); setSentry(""); setObsPass(""); // clear inputs; reload shows masked state
      await load();
      onSuccess();
    } finally { setSaving(false); }
  }

  if (!meta) {
    return (
      <SectionCard title="Integracje / klucze API" icon={Plug}>
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Integracje / klucze API" icon={Plug}>
      <p className="text-zinc-500 text-xs mb-4 leading-relaxed">
        Wklej tutaj klucze <strong className="text-zinc-300">funkcji opcjonalnych</strong> — zapisują się w bazie, więc przeżywają
        zmianę komputera i nie musisz ich szukać w plikach. <strong className="text-zinc-300">Wartość z bazy nadpisuje env.</strong> Klucze
        wracają zamaskowane. <span className="text-zinc-600">Sekrety infrastruktury (baza, logowanie OAuth, NEXTAUTH/BOT_SECRET) celowo zostają w env.</span>
      </p>

      {/* AI — unlocks the bot persona + !imagine (F4) */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">🤖 AI (postać bota + !imagine)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-[11px] text-zinc-400">Dostawca
            <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)} className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white outline-hidden focus:border-green-600">
              {AI_PROVIDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-zinc-400">Model (opcjonalnie)
            <input value={aiModel} onChange={(e) => setAiModel(e.target.value)} placeholder="np. claude-… / gpt-…" className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-green-600" />
          </label>
        </div>
        <SecretField label="Klucz API" has={meta.hasAiKey} preview={meta.aiKeyPreview} value={aiKey ?? ""} onChange={setAiKey} onClear={() => setAiKey(null)} placeholder="wklej klucz dostawcy AI" />
        <p className="text-[10px] text-zinc-600">Po wklejeniu klucza poproś o uruchomienie F4 — postać <code className="text-zinc-400">@bot</code> i <code className="text-zinc-400">!imagine</code>.</p>
      </div>

      {/* Sentry */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-2">🐛 Sentry (monitoring błędów)</div>
        <SecretField label="DSN" has={meta.hasSentry} preview={meta.sentryPreview} value={sentry ?? ""} onChange={setSentry} onClear={() => setSentry(null)} placeholder="DSN z ustawień projektu w Sentry" />
      </div>

      {/* OBS WebSocket */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-4 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">🎛️ OBS WebSocket (sterowanie sceną)</div>
        <label className="text-[11px] text-zinc-400 block">Adres
          <input value={obsUrl} onChange={(e) => setObsUrl(e.target.value)} placeholder="ws://localhost:4455" className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-green-600" />
        </label>
        <SecretField label="Hasło" has={meta.hasObsPassword} preview={meta.obsPasswordPreview} value={obsPass ?? ""} onChange={setObsPass} onClear={() => setObsPass(null)} placeholder="hasło z OBS" />
      </div>

      <button
        onClick={save}
        disabled={saving || pending}
        className="w-full px-4 py-2.5 bg-green-700 hover:bg-green-600 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        Zapisz integracje
      </button>
    </SectionCard>
  );
}

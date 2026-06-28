"use client";
// src/components/admin/sections/Integrations.tsx — paste runtime/feature API keys here
// instead of hunting through env files. Stored in the DB (admin-only); secrets come
// back masked. Infra/auth secrets stay in env by design.
// Każda integracja to rozwijana karta: nagłówek pokazuje status (✓ OK / brak),
// klik rozwija pola edycji (collapsed domyślnie).
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Plug, Loader2, Check, KeyRound, ChevronDown, CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

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
  goveeDeviceId: string; goveeDeviceModel: string;
  hasGoveeApiKey: boolean; goveeApiKeyPreview: string | null;
  xUsername: string;
  hasXToken: boolean; xTokenPreview: string | null;
};

function SecretField({ label, has, preview, value, onChange, onClear, placeholder }: {
  label: string; has: boolean; preview: string | null;
  value: string; onChange: (v: string) => void; onClear: () => void; placeholder?: string;
}) {
  const t = useTranslations("admin.integrations");
  return (
    <div>
      <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1 flex items-center gap-2">
        <KeyRound className="w-3 h-3" /> {label}
        {has && <span className="text-green-500 normal-case tracking-normal">{t("secretSet", { preview: preview ?? "" })}</span>}
      </label>
      <div className="flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={has ? t("overwritePh") : (placeholder ?? t("defaultKeyPh"))}
          autoComplete="off"
          className="flex-1 bg-black border border-zinc-800 px-3 py-2 text-sm text-white font-mono outline-hidden focus:border-green-600"
        />
        {has && (
          <button type="button" onClick={onClear} className="px-2.5 border border-zinc-700 text-zinc-400 hover:border-red-500 hover:text-red-400 text-[10px] font-mono uppercase">
            {t("clear")}
          </button>
        )}
      </div>
    </div>
  );
}

// Rozwijana karta integracji — nagłówek (tytuł + status + chevron), klik → treść edycji.
function IntegrationCard({ title, configured, statusLabel, children, defaultOpen = false }: {
  title: string; configured: boolean; statusLabel?: string; children: ReactNode; defaultOpen?: boolean;
}) {
  const t = useTranslations("admin.integrations");
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-zinc-800 bg-black/30 mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-300 flex-1">{title}</span>
        {configured ? (
          <span className="flex items-center gap-1.5 text-xs text-green-500 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" /> {statusLabel ?? "OK"}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-zinc-500 shrink-0">
            <XCircle className="w-3.5 h-3.5" /> {t("none")}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="p-3 pt-0 space-y-2">{children}</div>}
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
  const t = useTranslations("admin.integrations");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [saving, setSaving] = useState(false);

  // editable
  const [aiProvider, setAiProvider] = useState("anthropic");
  const [aiModel, setAiModel] = useState("");
  const [obsUrl, setObsUrl] = useState("");
  const [goveeDeviceId, setGoveeDeviceId] = useState("");
  const [goveeDeviceModel, setGoveeDeviceModel] = useState("");
  const [xUsername, setXUsername] = useState("");
  // secrets — empty unless the admin types a new value; null = clear
  const [aiKey, setAiKey] = useState<string | null>("");
  const [sentry, setSentry] = useState<string | null>("");
  const [obsPass, setObsPass] = useState<string | null>("");
  const [goveeKey, setGoveeKey] = useState<string | null>("");
  const [xToken, setXToken] = useState<string | null>("");

  const load = useCallback(async () => {
    try {
      const d = await apiGet<Meta>("/api/admin/integrations");
      setMeta(d); setAiProvider(d.aiProvider); setAiModel(d.aiModel); setObsUrl(d.obsWebsocketUrl);
      setGoveeDeviceId(d.goveeDeviceId); setGoveeDeviceModel(d.goveeDeviceModel);
      setXUsername(d.xUsername);
    } catch { /* keep current */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { aiProvider, aiModel, obsWebsocketUrl: obsUrl, goveeDeviceId, goveeDeviceModel, xUsername };
      // Only send a field when it changed: a typed value sets it, explicit null clears.
      const touched = (v: string | null) => v === null || (typeof v === "string" && v.trim().length > 0);
      const fields: Array<[string, string | null]> = [["aiApiKey", aiKey], ["sentryDsn", sentry], ["obsWebsocketPassword", obsPass], ["goveeApiKey", goveeKey], ["xApiToken", xToken]];
      for (const [k, v] of fields) if (touched(v)) body[k] = v;

      await apiPost("/api/admin/integrations", body);
      onToast("ok", t("saved"));
      setAiKey(""); setSentry(""); setObsPass(""); setGoveeKey(""); setXToken(""); // clear inputs; reload shows masked state
      await load();
      onSuccess();
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
    } finally { setSaving(false); }
  }

  if (!meta) {
    return (
      <SectionCard title={t("title")} icon={Plug}>
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      </SectionCard>
    );
  }

  const aiProviderLabel = AI_PROVIDERS.find(([v]) => v === meta.aiProvider)?.[1] ?? meta.aiProvider;
  const obsConfigured = meta.hasObsPassword || meta.obsWebsocketUrl.trim().length > 0;
  const goveeConfigured = meta.hasGoveeApiKey || meta.goveeDeviceId.trim().length > 0;
  const xConfigured = meta.hasXToken || meta.xUsername.trim().length > 0;

  return (
    <SectionCard title={t("title")} icon={Plug}>
      <p className="text-zinc-500 text-xs mb-4 leading-relaxed">
        {t.rich("intro", {
          b: (c) => <strong className="text-zinc-300">{c}</strong>,
          muted: (c) => <span className="text-zinc-600">{c}</span>,
        })}
      </p>
      <p className="text-zinc-600 text-[10px] mb-3">{t("clickHint")}</p>

      {/* AI — unlocks the bot persona + !imagine (F4) */}
      <IntegrationCard title={t("aiTitle")} configured={meta.hasAiKey} statusLabel={meta.hasAiKey ? aiProviderLabel : undefined}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-[11px] text-zinc-400">{t("provider")}
            <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)} className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white outline-hidden focus:border-green-600">
              {AI_PROVIDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-zinc-400">{t("modelLabel")}
            <input value={aiModel} onChange={(e) => setAiModel(e.target.value)} placeholder={t("modelPh")} className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-green-600" />
          </label>
        </div>
        <SecretField label={t("aiKeyLabel")} has={meta.hasAiKey} preview={meta.aiKeyPreview} value={aiKey ?? ""} onChange={setAiKey} onClear={() => setAiKey(null)} placeholder={t("aiKeyPh")} />
        <p className="text-[10px] text-zinc-600">{t.rich("aiHint", { code: (c) => <code className="text-zinc-400">{c}</code> })}</p>
      </IntegrationCard>

      {/* Sentry */}
      <IntegrationCard title={t("sentryTitle")} configured={meta.hasSentry}>
        <SecretField label="DSN" has={meta.hasSentry} preview={meta.sentryPreview} value={sentry ?? ""} onChange={setSentry} onClear={() => setSentry(null)} placeholder={t("sentryPh")} />
      </IntegrationCard>

      {/* OBS WebSocket */}
      <IntegrationCard title={t("obsTitle")} configured={obsConfigured} statusLabel={obsConfigured ? t("configured") : undefined}>
        <label className="text-[11px] text-zinc-400 block">{t("addressLabel")}
          <input value={obsUrl} onChange={(e) => setObsUrl(e.target.value)} placeholder="ws://localhost:4455" className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-green-600" />
        </label>
        <SecretField label={t("passwordLabel")} has={meta.hasObsPassword} preview={meta.obsPasswordPreview} value={obsPass ?? ""} onChange={setObsPass} onClear={() => setObsPass(null)} placeholder={t("obsPassPh")} />
      </IntegrationCard>

      {/* Govee lighting (per-tenant) — drives smart lights from alerts; rules live in the Govee section */}
      <IntegrationCard title={t("goveeTitle")} configured={goveeConfigured} statusLabel={goveeConfigured ? t("configured") : undefined}>
        <SecretField label={t("goveeApiKeyLabel")} has={meta.hasGoveeApiKey} preview={meta.goveeApiKeyPreview} value={goveeKey ?? ""} onChange={setGoveeKey} onClear={() => setGoveeKey(null)} placeholder={t("goveeApiKeyPh")} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-[11px] text-zinc-400">{t("goveeDeviceIdLabel")}
            <input value={goveeDeviceId} onChange={(e) => setGoveeDeviceId(e.target.value)} placeholder={t("goveeDeviceIdPh")} className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-green-600" />
          </label>
          <label className="text-[11px] text-zinc-400">{t("goveeDeviceModelLabel")}
            <input value={goveeDeviceModel} onChange={(e) => setGoveeDeviceModel(e.target.value)} placeholder={t("goveeDeviceModelPh")} className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-green-600" />
          </label>
        </div>
        <p className="text-[10px] text-zinc-600">{t("goveeHint")}</p>
      </IntegrationCard>

      {/* X (Twitter) — paste an app Bearer token + @handle → follower count + latest posts on the portal (#752) */}
      <IntegrationCard title={t("xTitle")} configured={xConfigured} statusLabel={xConfigured ? (meta.xUsername ? `@${meta.xUsername}` : t("configured")) : undefined}>
        <label className="text-[11px] text-zinc-400 block">{t("xUsernameLabel")}
          <input value={xUsername} onChange={(e) => setXUsername(e.target.value)} placeholder={t("xUsernamePh")} className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-green-600" />
        </label>
        <SecretField label={t("xTokenLabel")} has={meta.hasXToken} preview={meta.xTokenPreview} value={xToken ?? ""} onChange={setXToken} onClear={() => setXToken(null)} placeholder={t("xTokenPh")} />
        <p className="text-[10px] text-zinc-600">{t("xHint")}</p>
      </IntegrationCard>

      <button
        onClick={save}
        disabled={saving || pending}
        className="w-full mt-1 px-4 py-2.5 bg-green-700 hover:bg-green-600 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        {t("saveBtn")}
      </button>
    </SectionCard>
  );
}

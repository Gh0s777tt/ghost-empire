"use client";
// src/components/admin/sections/TwoFactor.tsx
// Opt-in TOTP enrollment for the signed-in admin. Setup reveals the secret +
// otpauth URI once (manual entry into Google Authenticator / Authy / etc.), then a
// confirming code enables it. While enabled, a code is required to disable.
// Backed by /api/admin/2fa; secret is encrypted at rest server-side.
import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, Loader2, KeyRound, Copy, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

export function TwoFactorManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.twoFactor");
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try { const d = await apiGet<{ enabled: boolean }>("/api/admin/2fa"); setEnabled(d.enabled); }
    catch { /* leave default */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function startSetup() {
    setBusy(true);
    try { setSetup(await apiPost<{ secret: string; otpauthUri: string; qrDataUrl: string }>("/api/admin/2fa", { action: "setup" })); }
    catch (e) { onToast("err", e instanceof ApiError ? e.message : t("err")); }
    finally { setBusy(false); }
  }

  async function confirm(action: "enable" | "disable") {
    setBusy(true);
    try {
      await apiPost("/api/admin/2fa", { action, code: code.replace(/\s/g, "") });
      onToast("ok", action === "enable" ? t("enabledMsg") : t("disabledMsg"));
      setSetup(null); setCode(""); await load();
    } catch (e) { onToast("err", e instanceof ApiError ? e.message : t("err")); }
    finally { setBusy(false); }
  }

  function copySecret() {
    if (!setup) return;
    void navigator.clipboard?.writeText(setup.secret.replace(/\s/g, "")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const codeInput = (
    <input
      value={code}
      inputMode="numeric"
      maxLength={7}
      placeholder={t("codePlaceholder")}
      onChange={(e) => setCode(e.target.value.replace(/[^0-9 ]/g, ""))}
      className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white tracking-[0.3em] font-mono text-center outline-hidden focus:border-red-600"
    />
  );

  return (
    <SectionCard title={t("title")} icon={ShieldCheck}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro")}</p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : enabled ? (
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 text-sm font-bold text-emerald-300 border border-emerald-800/60 bg-emerald-950/30 px-3 py-1.5 rounded-lg">
            <ShieldCheck className="w-4 h-4" /> {t("statusOn")}
          </div>
          <div className="border border-zinc-900 bg-black/20 rounded-lg p-3 space-y-2">
            <div className="text-[11px] text-zinc-400">{t("disableHint")}</div>
            {codeInput}
            <button onClick={() => void confirm("disable")} disabled={busy || code.replace(/\s/g, "").length !== 6}
              className="w-full px-3 py-2 rounded-lg text-[10px] font-bold tracking-widest uppercase border border-red-700 text-red-300 hover:border-red-500 disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} {t("disableBtn")}
            </button>
          </div>
        </div>
      ) : setup ? (
        <div className="space-y-3">
          <div className="text-sm text-zinc-300">{t("setupTitle")}</div>
          <p className="text-[11px] text-zinc-500">{t("setupHint")}</p>
          {setup.qrDataUrl && (
            <div className="flex flex-col items-center gap-1.5">
              <img src={setup.qrDataUrl} alt={t("qrAlt")} width={200} height={200} className="rounded-lg border border-zinc-800 bg-white p-2" />
              <span className="text-[10px] text-zinc-500">{t("qrHint")}</span>
            </div>
          )}
          <div className="border border-zinc-800 bg-black/40 rounded-lg p-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("secretLabel")}</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-amber-300 tracking-wider break-all">{setup.secret}</code>
              <button onClick={copySecret} title={t("copyBtn")} className="shrink-0 w-7 h-7 inline-flex items-center justify-center border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 rounded">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="text-[10px] text-zinc-600 font-mono break-all mt-2">{setup.otpauthUri}</div>
          </div>
          <div className="border border-zinc-900 bg-black/20 rounded-lg p-3 space-y-2">
            <div className="text-[11px] text-zinc-400 inline-flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" /> {t("confirmHint")}</div>
            {codeInput}
            <button onClick={() => void confirm("enable")} disabled={busy || code.replace(/\s/g, "").length !== 6}
              className="w-full px-3 py-2 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} {t("enableBtn")}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => void startSetup()} disabled={busy}
          className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center justify-center gap-2">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} {t("startBtn")}
        </button>
      )}
    </SectionCard>
  );
}

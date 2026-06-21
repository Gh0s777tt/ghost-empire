"use client";
// src/components/profile/ShippingProfileCard.tsx
// Self-contained profile card (#audit3): the user's shipping/contact PII for physical
// rewards. Collapsed by default; loads on first open. All values are encrypted at rest
// server-side (lib/crypto). Saving requires an explicit consent checkbox; the trash
// button is GDPR erasure. Mirrors the standalone-card pattern of PushToggle/PasskeyManager.
import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Package, Loader2, Trash2, ChevronDown, ShieldCheck } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type Form = {
  fullName: string; phone: string; email: string; addressLine: string;
  city: string; postalCode: string; country: string; parcelLocker: string;
};
const EMPTY: Form = { fullName: "", phone: "", email: "", addressLine: "", city: "", postalCode: "", country: "", parcelLocker: "" };
type GetResp = { hasProfile: boolean } & Partial<Record<keyof Form, string | null>>;

const FIELDS: { key: keyof Form; span2?: boolean }[] = [
  { key: "fullName", span2: true },
  { key: "phone" },
  { key: "email" },
  { key: "addressLine", span2: true },
  { key: "city" },
  { key: "postalCode" },
  { key: "country" },
  { key: "parcelLocker", span2: true },
];

export function ShippingProfileCard() {
  const t = useTranslations("shipping");
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [f, setF] = useState<Form>(EMPTY);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<GetResp>("/api/profile/shipping");
      if (d.hasProfile) {
        setHasProfile(true);
        setConsent(true); // already consented when a row exists
        setF((p) => ({
          ...p,
          ...Object.fromEntries(FIELDS.map(({ key }) => [key, d[key] ?? ""])),
        }) as Form);
      }
    } catch { /* leave empty */ } finally { setLoaded(true); }
  }, []);
  useEffect(() => { if (open && !loaded) void load(); }, [open, loaded, load]);

  const set = (k: keyof Form) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!consent) { setMsg({ kind: "err", text: t("consentRequired") }); return; }
    setBusy(true); setMsg(null);
    try {
      await apiPost("/api/profile/shipping", { ...f, consent: true }, { method: "PUT" });
      setHasProfile(true);
      setMsg({ kind: "ok", text: t("saved") });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : t("err") });
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm(t("deleteConfirm"))) return;
    setBusy(true); setMsg(null);
    try {
      await apiPost("/api/profile/shipping", {}, { method: "DELETE" });
      setF(EMPTY); setConsent(false); setHasProfile(false);
      setMsg({ kind: "ok", text: t("deleted") });
    } catch { setMsg({ kind: "err", text: t("err") }); }
    finally { setBusy(false); }
  }

  return (
    <div className="border border-zinc-800 bg-zinc-950/60 rounded-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 text-start hover:bg-white/[0.02] transition-colors rounded-xl"
      >
        <Package className="w-5 h-5 text-red-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white">{t("title")}</div>
          <div className="text-[11px] text-zinc-500">{hasProfile ? t("statusSet") : t("statusNone")}</div>
        </div>
        <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[11px] text-zinc-500 flex items-start gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
            {t("privacyNote")}
          </p>
          {!loaded ? (
            <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("loading")}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {FIELDS.map(({ key, span2 }) => (
                  <div key={key} className={span2 ? "col-span-2" : ""}>
                    <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t(`f_${key}`)}</label>
                    <input
                      value={f[key]}
                      onChange={(e) => set(key)(e.target.value)}
                      placeholder={key === "country" ? "PL" : undefined}
                      maxLength={key === "country" ? 2 : 200}
                      className="w-full border border-zinc-800 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600"
                    />
                  </div>
                ))}
              </div>
              <label className="flex items-start gap-2 text-[11px] text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 shrink-0" />
                <span>{t("consent")}</span>
              </label>
              {msg && (
                <div role={msg.kind === "ok" ? "status" : "alert"} className={`text-xs ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={busy}
                  className="px-3 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {t("save")}
                </button>
                {hasProfile && (
                  <button
                    type="button"
                    onClick={() => void remove()}
                    disabled={busy}
                    className="px-3 py-2 border border-zinc-800 hover:border-red-700 text-zinc-400 hover:text-red-400 disabled:opacity-40 text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {t("delete")}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

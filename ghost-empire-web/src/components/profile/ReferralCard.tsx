"use client";
// src/components/profile/ReferralCard.tsx
// Invite-a-friend loop on the profile: shows the user's shareable link + how many
// they've referred, and (once) lets them claim a friend's code — both get GT.
// Self-fetches /api/referral. Pre-fills the claim field from a ?ref= link.
import { useState, useEffect, useCallback } from "react";
import { Gift, Copy, Check, Users, Loader2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { emitBalance } from "@/lib/balance-bus";
import { useTenantBranding } from "@/components/TenantBranding";

type RefData = { code: string; reward: number; referralCount: number; claimed: boolean };

export function ReferralCard() {
  const t = useTranslations("profile");
  const nf = useLocale();
  const { tokenSymbol } = useTenantBranding();
  const sym = tokenSymbol || "GT";
  const [data, setData] = useState<RefData | null>(null);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ k: "ok" | "err"; m: string } | null>(null);

  const load = useCallback(async () => {
    try { setData(await apiGet<RefData>("/api/referral")); } catch { /* leave empty */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Pre-fill the claim field if the user arrived via a ?ref= link.
  useEffect(() => {
    const ref = new URL(window.location.href).searchParams.get("ref");
    if (ref) setCode(ref.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
  }, []);

  function flash(k: "ok" | "err", m: string) { setToast({ k, m }); setTimeout(() => setToast(null), 2800); }

  function copyLink() {
    if (!data) return;
    const link = `${window.location.origin}/?ref=${data.code}`;
    void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  async function claim() {
    if (busy || !code) return;
    setBusy(true);
    try {
      const r = await apiPost<{ reward: number; newBalance: number }>("/api/referral", { code });
      emitBalance(r.newBalance);
      flash("ok", t("refClaimed", { n: r.reward.toLocaleString(nf) }));
      setCode("");
      await load();
    } catch (e) { flash("err", e instanceof ApiError ? e.message : t("refErr")); }
    setBusy(false);
  }

  if (!data) return null;

  return (
    <div className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-4">
      <div className="flex items-center gap-2 mb-2">
        <Gift className="w-4 h-4 text-red-500" />
        <h2 className="font-display text-base text-white tracking-wider">{t("refTitle")}</h2>
      </div>
      <p className="text-zinc-400 text-xs mb-3">{t("refIntro", { n: data.reward.toLocaleString(nf), sym })}</p>

      {toast && (
        <div className={`mb-3 text-xs px-3 py-2 rounded-lg border ${toast.k === "ok" ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-300" : "border-red-800/60 bg-red-950/30 text-red-300"}`}>
          {toast.m}
        </div>
      )}

      {/* My code + copy link */}
      <div className="flex items-center gap-2 mb-2">
        <code className="flex-1 text-lg font-mono font-bold tracking-[0.25em] text-amber-300 bg-black/40 border border-zinc-800 rounded px-3 py-2 text-center">{data.code}</code>
        <button onClick={copyLink} title={t("refCopyLink")} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 border border-zinc-700 text-zinc-300 hover:border-zinc-500 rounded text-xs">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} {copied ? t("refCopied") : t("refCopyLink")}
        </button>
      </div>
      <div className="text-[11px] text-zinc-500 mb-3 inline-flex items-center gap-1.5">
        <Users className="w-3 h-3" /> {t("refCount", { n: data.referralCount.toLocaleString(nf) })}
        {data.referralCount > 0 && <span className="text-zinc-600">· +{(data.referralCount * data.reward).toLocaleString(nf)} {sym}</span>}
      </div>

      {/* Claim a friend's code (once) */}
      {data.claimed ? (
        <p className="text-[11px] text-zinc-600">{t("refAlreadyClaimed")}</p>
      ) : (
        <div className="flex gap-2">
          <input
            value={code}
            maxLength={6}
            placeholder={t("refClaimPlaceholder")}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") void claim(); }}
            className="flex-1 bg-black/60 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm font-mono tracking-[0.2em] uppercase focus:outline-none focus:border-zinc-500"
          />
          <button onClick={() => void claim()} disabled={busy || code.length !== 6}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 inline-flex items-center gap-2" style={{ background: "var(--brand)" }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />} {t("refClaimBtn")}
          </button>
        </div>
      )}
    </div>
  );
}

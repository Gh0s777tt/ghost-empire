"use client";
// src/components/profile/DonationClaimCard.tsx
// "I donated but got nothing" — the recovery path for a tip sent WITHOUT the GE-code (#self-claim).
// The viewer states what they paid (amount + currency + date); the server accepts it only when
// those facts identify exactly one unmatched donation on this portal, and files a PENDING claim.
// It never credits here: the streamer approves in the admin queue (donor facts are guessable, so
// the human stays in the loop — see lib/donation-claim.ts). Copy is inline PL/EN like the other
// recent surfaces, so it needs no locale-file changes.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { HelpCircle, Loader2, Check } from "lucide-react";
import { apiPost, ApiError } from "@/lib/api-client";
export function DonationClaimCard() {
  const t = useTranslations("profile.donationClaim");
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PLN");
  const [donatedOn, setDonatedOn] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      await apiPost("/api/support/claim", {
        amount: Number(amount.replace(",", ".")),
        currency: currency.trim().toUpperCase(),
        donatedOn,
        evidence: evidence.trim() || undefined,
      });
      setMsg({ kind: "ok", text: t("done") });
      setAmount(""); setEvidence("");
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : t("err") });
    } finally {
      setBusy(false);
    }
  }

  const ready = Number(amount.replace(",", ".")) > 0 && !!donatedOn;

  return (
    <div className="border border-zinc-800 bg-zinc-950/60 rounded-xl p-4">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 text-left">
        <HelpCircle className="w-4 h-4 text-zinc-500 shrink-0" />
        <span className="text-sm font-semibold text-white flex-1">{t("title")}</span>
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{open ? "–" : "+"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-zinc-500">{t("intro")}</p>
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-1">
              <span className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("amount")}</span>
              <input
                value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-red-500"
              />
            </label>
            <label className="col-span-1">
              <span className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("currency")}</span>
              <input
                value={currency} maxLength={8} onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white text-center uppercase outline-hidden focus:border-red-500"
              />
            </label>
            <label className="col-span-1">
              <span className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("date")}</span>
              <input
                type="date" value={donatedOn} onChange={(e) => setDonatedOn(e.target.value)}
                className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white outline-hidden focus:border-red-500"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("evidence")}</span>
            <input
              value={evidence} maxLength={500} placeholder={t("evidencePh")} onChange={(e) => setEvidence(e.target.value)}
              className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white outline-hidden focus:border-red-500 placeholder:text-zinc-700"
            />
          </label>
          {msg && (
            <p className={`text-xs ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
          )}
          <button
            onClick={() => void submit()}
            disabled={busy || !ready}
            className="w-full px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {t("submit")}
          </button>
        </div>
      )}
    </div>
  );
}

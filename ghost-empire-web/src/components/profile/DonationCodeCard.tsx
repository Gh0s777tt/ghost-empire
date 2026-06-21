"use client";
// src/components/profile/DonationCodeCard.tsx
// Shows the user their personal donation code (#audit3) + how to use it: put it in your
// tip message so a Streamlabs donation credits GT to you (verified, vs the removed
// spoofable name-match). Self-fetching; lazily minted server-side on first read.
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Ticket, Copy, Check, Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api-client";

export function DonationCodeCard() {
  const t = useTranslations("donationCode");
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiGet<{ code: string }>("/api/profile/donation-code").then((d) => setCode(d.code)).catch(() => {});
  }, []);

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked — the code is visible to copy manually */ }
  }

  return (
    <div className="border border-zinc-800 bg-zinc-950/60 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <Ticket className="w-5 h-5 text-red-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white">{t("title")}</div>
          <div className="text-[11px] text-zinc-500">{t("desc")}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 font-mono text-lg text-white bg-black/40 border border-zinc-800 rounded px-3 py-2 text-center tracking-widest">
          {code ?? <Loader2 className="w-4 h-4 animate-spin inline" />}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!code}
          aria-label={t("copy")}
          title={t("copy")}
          className="inline-flex items-center justify-center w-10 h-10 shrink-0 border border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white rounded disabled:opacity-40"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

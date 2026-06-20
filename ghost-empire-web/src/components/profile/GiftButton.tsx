"use client";
// src/components/profile/GiftButton.tsx
// "Send GT" on a viewer's public profile (#553) — opens a tiny amount field and posts
// to /api/gift. Shown only to logged-in viewers on someone else's profile.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Gift, Loader2, Check } from "lucide-react";
import { apiPost } from "@/lib/api-client";

export function GiftButton({ toUsername }: { toUsername: string }) {
  const t = useTranslations("gift");
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    if (!(+amount > 0) || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiPost<{ ok: boolean; reason?: string }>("/api/gift", { toUsername, amount: +amount });
      if (r.ok) {
        setSent(true);
        setAmount("");
        setTimeout(() => { setSent(false); setOpen(false); }, 1800);
      } else {
        setMsg(t(`err_${r.reason ?? "error"}`));
      }
    } catch {
      setMsg(t("err_error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-block">
      <button onClick={() => setOpen((v) => !v)} className="px-2 py-0.5 border border-zinc-800 text-zinc-400 hover:text-white hover:border-emerald-700 rounded text-[11px] inline-flex items-center gap-1 transition-colors">
        <Gift className="w-3 h-3" /> {t("send")}
      </button>
      {open && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            value={amount}
            inputMode="numeric"
            placeholder={t("amountPh")}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
            className="w-24 border border-zinc-700 bg-black/40 px-2 py-1 text-xs text-white font-mono outline-hidden focus:border-emerald-600 rounded"
          />
          <button onClick={() => void send()} disabled={busy || !(+amount > 0)} className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-semibold rounded disabled:opacity-50 inline-flex items-center gap-1">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : sent ? <Check className="w-3 h-3" /> : <Gift className="w-3 h-3" />} {sent ? t("sent") : t("confirm")}
          </button>
        </div>
      )}
      {msg && <div className="mt-1 text-[11px] text-amber-300">{msg}</div>}
    </div>
  );
}

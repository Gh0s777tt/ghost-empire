"use client";
// src/components/profile/AccentPicker.tsx
// Inline accent picker on the user's own profile (#546): a row of color swatches that
// tint their public profile (avatar ring + name glow). Saving persists via
// /api/profile/accent and refreshes. The "✕" swatch clears back to the brand accent.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { PROFILE_ACCENTS } from "@/lib/profile-accents";
import { apiPost } from "@/lib/api-client";

export function AccentPicker({ initialAccent }: { initialAccent: string | null }) {
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const router = useRouter();
  const [accent, setAccent] = useState(initialAccent ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function change(next: string) {
    const prev = accent;
    setAccent(next);
    setBusy(true);
    setErr(false);
    try {
      await apiPost("/api/profile/accent", { accent: next });
      router.refresh();
    } catch {
      setAccent(prev); // revert on failure — and tell the user why (was silent). #audit-v2
      setErr(true);
      setTimeout(() => setErr(false), 2500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] uppercase tracking-widest text-zinc-600">{t("accentLabel")}</span>
      <button
        onClick={() => void change("")}
        disabled={busy}
        title={t("accentNone")}
        aria-label={t("accentNone")}
        className={`w-5 h-5 rounded-full border flex items-center justify-center text-zinc-500 hover:text-white disabled:opacity-50 ${!accent ? "border-white" : "border-zinc-700"}`}
      >
        <X className="w-2.5 h-2.5" />
      </button>
      {PROFILE_ACCENTS.map((a) => (
        <button
          key={a.key}
          onClick={() => void change(a.key)}
          disabled={busy}
          title={t("accentSwatch", { name: a.key })}
          aria-label={t("accentSwatch", { name: a.key })}
          className={`w-5 h-5 rounded-full border flex items-center justify-center transition-transform hover:scale-110 disabled:opacity-50 ${accent === a.key ? "border-white" : "border-transparent"}`}
          style={{ background: a.color }}
        >
          {accent === a.key && <Check className="w-2.5 h-2.5 text-black/80" />}
        </button>
      ))}
      {err && <span role="alert" className="text-[10px] text-red-400">{tc("errorTitle")}</span>}
    </div>
  );
}

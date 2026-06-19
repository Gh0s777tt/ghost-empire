"use client";
// src/components/profile/ProfileShareRow.tsx
// Quick-share buttons on the public profile (#526) — spread a profile link to
// socials. Mirrors the /support share row.
import { useState } from "react";
import { Share2, Copy, Check } from "lucide-react";
import { useTranslations } from "next-intl";

const TARGETS: { key: string; label: string; href: (u: string, text: string) => string }[] = [
  { key: "telegram", label: "Telegram", href: (u, t) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { key: "x", label: "X", href: (u, t) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { key: "whatsapp", label: "WhatsApp", href: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}` },
  { key: "reddit", label: "Reddit", href: (u, t) => `https://www.reddit.com/submit?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}` },
];

export function ProfileShareRow({ url, name }: { url: string; name: string }) {
  const t = useTranslations("userProfile");
  const [copied, setCopied] = useState(false);
  const text = t("shareText", { name });
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] text-zinc-600 uppercase tracking-widest inline-flex items-center gap-1"><Share2 className="w-3 h-3" /> {t("share")}</span>
      {TARGETS.map((s) => (
        <a key={s.key} href={s.href(url, text)} target="_blank" rel="noreferrer" className="px-2 py-0.5 border border-zinc-800 text-zinc-400 hover:text-white hover:border-red-700 rounded text-[11px] transition-colors">{s.label}</a>
      ))}
      <button onClick={copy} className="px-2 py-0.5 border border-zinc-800 text-zinc-400 hover:text-white hover:border-red-700 rounded text-[11px] inline-flex items-center gap-1 transition-colors">
        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} {t("copyLink")}
      </button>
    </div>
  );
}

"use client";
// src/components/profile/ProfileShareRow.tsx
// Quick-share buttons on the public profile (#526) — spread a profile link to
// socials. Mirrors the /support share row. The optional QR (#527) is generated
// server-side and revealed in a small panel with a PNG download.
import { useState } from "react";
import { Share2, Copy, Check, QrCode, Download } from "lucide-react";
import { useTranslations } from "next-intl";

const TARGETS: { key: string; label: string; href: (u: string, text: string) => string }[] = [
  { key: "telegram", label: "Telegram", href: (u, t) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { key: "x", label: "X", href: (u, t) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { key: "whatsapp", label: "WhatsApp", href: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}` },
  { key: "reddit", label: "Reddit", href: (u, t) => `https://www.reddit.com/submit?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}` },
];

const PILL = "px-2 py-0.5 border border-zinc-800 text-zinc-400 hover:text-white hover:border-red-700 rounded text-[11px] inline-flex items-center gap-1 transition-colors";

export function ProfileShareRow({ url, name, qr, handle }: { url: string; name: string; qr?: string | null; handle?: string | null }) {
  const t = useTranslations("userProfile");
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const text = t("shareText", { name });
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-zinc-600 uppercase tracking-widest inline-flex items-center gap-1"><Share2 className="w-3 h-3" /> {t("share")}</span>
        {TARGETS.map((s) => (
          <a key={s.key} href={s.href(url, text)} target="_blank" rel="noreferrer" className={PILL}>{s.label}</a>
        ))}
        <button onClick={copy} className={PILL}>
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} {t("copyLink")}
        </button>
        {qr && (
          <button onClick={() => setShowQr((v) => !v)} aria-expanded={showQr} className={PILL}>
            <QrCode className="w-3 h-3" /> {t("qr")}
          </button>
        )}
      </div>
      {qr && showQr && (
        <div className="inline-flex flex-col items-center gap-1.5 border border-zinc-800 bg-black/40 p-3 rounded">
          <img src={qr} alt={t("qrAlt", { name })} width={160} height={160} className="rounded bg-white" />
          <a download={`${handle || "profile"}-qr.png`} href={qr} className={PILL}>
            <Download className="w-3 h-3" /> {t("qrDownload")}
          </a>
        </div>
      )}
    </div>
  );
}

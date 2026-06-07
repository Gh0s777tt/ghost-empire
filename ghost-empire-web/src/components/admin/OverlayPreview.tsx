"use client";
// src/components/admin/OverlayPreview.tsx
// Reusable "how it looks in OBS" block for admin sections: a checkerboard preview
// box (caller supplies the sample render) + the ready-to-paste OBS Browser Source
// URL with a copy button. Fetches the shared overlay token itself.
import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { useTranslations } from "next-intl";

export function OverlayPreview({
  path,
  children,
  note,
}: {
  path: string; // e.g. "/overlay/goals"
  children: React.ReactNode; // sample render (shared overlay component)
  note?: string;
}) {
  const t = useTranslations("admin.overlayPreview");
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/overlay-token")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setToken(d?.token ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = token ? `${origin}${path}?token=${token}` : null;

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block">
        {t("previewLabel")}
      </label>
      <div
        className="border border-zinc-800 rounded-sm p-6 overflow-hidden flex flex-col gap-2"
        style={{ background: "repeating-conic-gradient(#18181b 0% 25%, #0a0a0a 0% 50%) 50% / 24px 24px" }}
      >
        {children}
      </div>
      {url ? (
        <div className="flex gap-2">
          <input
            readOnly
            value={url}
            className="flex-1 bg-black border border-zinc-800 px-3 py-2 text-xs text-zinc-300 font-mono truncate"
          />
          <button
            onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="px-3 border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-all"
            title={t("copyTitle")}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-zinc-600">{t("loadingUrl")}</p>
      )}
      {note && <p className="text-[11px] text-zinc-600 leading-relaxed">{note}</p>}
    </div>
  );
}

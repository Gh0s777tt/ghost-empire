"use client";
// src/components/admin/sections/SupportPreview.tsx
// Live preview of the public /support (tips & payments) page right inside the admin Payments
// section (#702), so the owner sees exactly how the payment-link page looks as they edit it.
// Same-origin iframe → the real rendered page with the current methods; refresh after edits.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, ExternalLink, RefreshCw, Monitor } from "lucide-react";
import { SectionCard } from "../shared";

export function SupportPreview() {
  const t = useTranslations("admin");
  const [show, setShow] = useState(true);
  const [nonce, setNonce] = useState(0); // bump to reload the iframe after editing methods

  return (
    <SectionCard title={t("supportPreviewTitle")} icon={Eye}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="cine-tile px-3 py-1.5 text-[11px] uppercase tracking-widest text-zinc-300 inline-flex items-center gap-1.5"
        >
          <Monitor className="w-3.5 h-3.5" /> {show ? t("supportPreviewHide") : t("supportPreviewShow")}
        </button>
        {show && (
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            className="cine-tile px-3 py-1.5 text-[11px] uppercase tracking-widest text-zinc-300 inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> {t("supportPreviewRefresh")}
          </button>
        )}
        <a
          href="/support"
          target="_blank"
          rel="noreferrer"
          className="cine-tile px-3 py-1.5 text-[11px] uppercase tracking-widest text-zinc-300 inline-flex items-center gap-1.5 ms-auto"
        >
          <ExternalLink className="w-3.5 h-3.5" /> {t("supportPreviewOpen")}
        </a>
      </div>
      {show && (
        <div className="border border-zinc-800 bg-black overflow-hidden" style={{ height: 620 }}>
          <iframe
            key={nonce}
            src="/support"
            title={t("supportPreviewTitle")}
            loading="lazy"
            className="w-full h-full"
            style={{ border: 0 }}
          />
        </div>
      )}
      <p className="text-[10px] font-mono text-zinc-600 mt-2 leading-snug">{t("supportPreviewNote")}</p>
    </SectionCard>
  );
}

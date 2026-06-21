"use client";
// src/components/profile/DataExportCard.tsx
// GDPR "download my data" card (#audit3 — Art. 15/20). One button: fetches
// /api/profile/export and triggers a client-side download of the JSON file. Pairs with
// the shipping erasure (DELETE) so the profile offers both export and deletion.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Loader2, ShieldCheck } from "lucide-react";

export function DataExportCard() {
  const t = useTranslations("dataExport");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/profile/export", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] || "ghost-empire-data.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErr(t("err"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-zinc-800 bg-zinc-950/60 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white">{t("title")}</div>
          <div className="text-[11px] text-zinc-500">{t("subtitle")}</div>
        </div>
        <button
          type="button"
          onClick={() => void download()}
          disabled={busy}
          className="min-h-[40px] px-3 py-2 border border-zinc-800 hover:border-emerald-700 text-zinc-300 hover:text-emerald-400 disabled:opacity-40 text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5 rounded-lg shrink-0"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {t("button")}
        </button>
      </div>
      {err && (
        <div role="alert" className="text-xs text-red-400 mt-2">
          {err}
        </div>
      )}
    </div>
  );
}

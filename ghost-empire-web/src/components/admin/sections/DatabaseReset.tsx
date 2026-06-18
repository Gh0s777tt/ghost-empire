"use client";
// src/components/admin/sections/DatabaseReset.tsx — lazily-loaded danger-zone DB reset.
import { useState } from "react";
import { signOut } from "next-auth/react";
import { AlertTriangle, Trash2, Loader2, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { apiPost, ApiError } from "@/lib/api-client";

export function DatabaseResetCard({
  onToast,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.databaseReset");
  // Backend-matched confirm token (api/admin/reset-database checks it literally) — stays literal.
  const PHRASE = "USUŃ WSZYSTKO";
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const armed = confirm.trim() === PHRASE;

  async function submit() {
    if (!armed) return;
    if (!window.confirm(t("lastWarning"))) return;
    setBusy(true);
    try {
      const data = await apiPost<{ deletedUsers: number }>("/api/admin/reset-database", { confirm: confirm.trim() });
      onToast("ok", t("resetDone", { count: data.deletedUsers }));
      // The acting admin's account is gone too — sign out and back to landing.
      setTimeout(() => signOut({ callbackUrl: "/welcome" }), 1800);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0) onToast("err", err.message || t("err"));
      else onToast("err", t("netErr"));
      setBusy(false);
    }
  }

  return (
    <SectionCard title={t("title")} icon={AlertTriangle}>
      {/* Backup — grab a copy before doing anything destructive */}
      <div className="mb-3 border border-zinc-800 bg-black/30 p-4">
        <p className="text-xs text-zinc-200 font-bold mb-1 flex items-center gap-2">
          <Download className="w-4 h-4 text-green-400" /> {t("backupTitle")}
        </p>
        <p className="text-[11px] text-zinc-500 leading-relaxed mb-2.5">
          {t.rich("backupDesc", { b: (c) => <strong className="text-zinc-300">{c}</strong> })}
        </p>
        <a
          href="/api/admin/backup"
          className="inline-flex items-center gap-2 px-4 py-2 border border-zinc-700 hover:border-green-600 text-green-300 text-xs font-bold tracking-widest uppercase transition-all"
        >
          <Download className="w-3.5 h-3.5" /> {t("downloadBackup")}
        </a>
      </div>

      <div className="space-y-3 border border-red-800 bg-red-950/20 p-4">
        <p className="text-sm text-red-300 font-bold flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> {t("dangerZone")}
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          {t.rich("dangerDesc1", { b: (c) => <strong className="text-white">{c}</strong> })}
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          {t.rich("dangerDesc2", { b: (c) => <strong className="text-green-300">{c}</strong> })}
        </p>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            {t.rich("unlockLabel", { red: (c) => <span className="text-red-400 font-bold">{c}</span>, p: PHRASE })}
          </label>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={PHRASE}
            className="w-full bg-black border border-zinc-800 px-3 py-2 text-sm text-white focus:border-red-500 outline-hidden"
          />
        </div>
        <button
          onClick={submit}
          disabled={busy || !armed}
          className="w-full px-4 py-2.5 bg-red-700 hover:bg-red-600 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          {t("resetBtn")}
        </button>
      </div>
    </SectionCard>
  );
}

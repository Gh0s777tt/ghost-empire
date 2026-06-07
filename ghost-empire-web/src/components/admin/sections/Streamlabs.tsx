"use client";
// src/components/admin/sections/Streamlabs.tsx — lazily-loaded Streamlabs donations manager.
import { useState } from "react";
import { Link as LinkIcon, Loader2, Zap } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { SectionCard } from "../shared";
import type { StreamlabsConnectionData, UnmatchedDonation } from "../types";

export function StreamlabsManager({
  connection, unmatchedDonations, onToast, onSuccess, pending,
}: {
  connection: StreamlabsConnectionData;
  unmatchedDonations: UnmatchedDonation[];
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.streamlabs");
  const nf = useLocale() === "en" ? "en-US" : "pl-PL";
  const [busy, setBusy] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Record<string, string>>({});

  async function action(act: "sync" | "disconnect") {
    if (act === "disconnect" && !confirm(t("disconnectConfirm"))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/streamlabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: act }),
      });
      const data = await res.json();
      if (!res.ok) onToast("err", data.error ?? t("err"));
      else {
        if (act === "sync") {
          onToast(
            "ok",
            `Sync: fetched ${data.fetched ?? 0}, matched ${data.matched ?? 0}, unmatched ${data.unmatched ?? 0}`,
          );
        } else onToast("ok", t("disconnected"));
        onSuccess();
      }
    } finally { setBusy(false); }
  }

  async function matchDonation(donationId: string, action: "assign" | "skip") {
    const target = assignTarget[donationId];
    if (action === "assign" && !target) {
      onToast("err", t("enterTarget"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/donations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ donationId, action, userTarget: target }),
      });
      const data = await res.json();
      if (!res.ok) onToast("err", data.error ?? t("err"));
      else {
        if (action === "assign") onToast("ok", t("matched", { gt: String(data.tokensGranted), user: data.user }));
        else onToast("ok", t("skipped"));
        setAssignTarget((s) => { const copy = { ...s }; delete copy[donationId]; return copy; });
        onSuccess();
      }
    } finally { setBusy(false); }
  }

  return (
    <SectionCard title={t("title")} icon={LinkIcon}>
      {/* Connection status */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
        {connection.connected ? (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-green-300 mb-0.5">
                ● {t("connected")} {connection.streamlabsUsername && `(${connection.streamlabsUsername})`}
              </div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                {connection.lastPolledAt
                  ? t("lastSync", { date: new Date(connection.lastPolledAt).toLocaleString(nf, { dateStyle: "short", timeStyle: "short" }) })
                  : t("neverSynced")}
              </div>
            </div>
            <button
              onClick={() => action("sync")}
              disabled={busy || pending}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              Sync now
            </button>
            <button
              onClick={() => action("disconnect")}
              disabled={busy || pending}
              className="px-3 py-1.5 border border-red-700 hover:border-red-500 text-red-400 text-[10px] font-bold tracking-widest uppercase disabled:opacity-50"
            >
              {t("disconnectBtn")}
            </button>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-zinc-400 text-sm mb-3">
              {t("notConnectedDesc")}
            </p>
            {/* /api/auth/streamlabs is an API route doing a server-side OAuth redirect, not a Next page; <a> is correct here */}
            <a
              href="/api/auth/streamlabs"
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              {t("connectBtn")}
            </a>
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mt-2">
              {t("connectHint")}
            </p>
          </div>
        )}
      </div>

      {/* Unmatched donations */}
      {connection.connected && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              {t("unmatchedTitle", { count: unmatchedDonations.length })}
            </span>
            {unmatchedDonations.length > 0 && (
              <span className="text-[9px] text-zinc-600 font-mono">
                {t("unmatchedHint")}
              </span>
            )}
          </div>

          {unmatchedDonations.length === 0 ? (
            <p className="text-zinc-500 text-sm py-2 text-center">
              {t("noUnmatched")}
            </p>
          ) : (
            <div className="space-y-1.5">
              {unmatchedDonations.map((d) => (
                <div key={d.id} className="border border-orange-900/50 bg-orange-950/10 p-2.5">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-orange-300">
                      {(d.amountGrosze / 100).toFixed(2)} {d.currency}
                    </span>
                    <span className="text-sm text-white font-medium">{d.donorName}</span>
                    <span className="text-[10px] font-mono text-zinc-500 ml-auto">
                      {new Date(d.donatedAt).toLocaleString(nf, { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </div>
                  {d.message && (
                    <div className="text-xs text-zinc-400 italic mb-2">"{d.message}"</div>
                  )}
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder={t("targetPh")}
                      value={assignTarget[d.id] ?? ""}
                      onChange={(e) => setAssignTarget((s) => ({ ...s, [d.id]: e.target.value }))}
                      className="flex-1 border border-zinc-800 bg-black/30 px-2 py-1 text-xs text-white font-mono outline-hidden focus:border-red-600 placeholder:text-zinc-700"
                    />
                    <button
                      onClick={() => matchDonation(d.id, "assign")}
                      disabled={busy}
                      className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50"
                    >
                      {t("assignBtn")}
                    </button>
                    <button
                      onClick={() => matchDonation(d.id, "skip")}
                      disabled={busy}
                      className="px-3 py-1 border border-zinc-700 hover:border-red-500 text-zinc-400 hover:text-red-400 text-[10px] font-bold tracking-widest uppercase"
                    >
                      {t("skipBtn")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

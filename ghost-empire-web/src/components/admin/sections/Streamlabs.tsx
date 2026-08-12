"use client";
// src/components/admin/sections/Streamlabs.tsx — lazily-loaded Streamlabs donations manager.
import { useEffect, useState } from "react";
import { Link as LinkIcon, Loader2, Zap } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { SectionCard } from "../shared";
import { apiPost, ApiError } from "@/lib/api-client";
import type { StreamlabsConnectionData, UnmatchedDonation } from "../types";

// Read-side shape of GET /api/admin/donations — tenant-scoped aggregate for the panel header.
type DonationStats = {
  count: number;
  totalPln: number;
  byProvider: { source: string; count: number; pln: number }[];
};

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
  const nf = useLocale();
  const isPl = nf.startsWith("pl");
  const [busy, setBusy] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<DonationStats | null>(null);

  // Header stats live on a separate GET (tenant-scoped aggregate) than the section-data payload that
  // feeds `unmatchedDonations`. Re-fetch whenever that queue reference changes — every successful
  // sync/assign/skip calls `onSuccess()`, which reloads section data and hands us a fresh array — so
  // the header stays in sync without a second manual refresh wire.
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/donations")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { stats?: DonationStats } | null) => { if (alive && d?.stats) setStats(d.stats); })
      .catch(() => { /* header is non-critical — a failed stats read never blocks reconciling */ });
    return () => { alive = false; };
  }, [unmatchedDonations]);

  async function action(act: "sync" | "disconnect") {
    if (act === "disconnect" && !confirm(t("disconnectConfirm"))) return;
    setBusy(true);
    try {
      const data = await apiPost<{ fetched?: number; matched?: number; unmatched?: number }>("/api/admin/streamlabs", { action: act });
      if (act === "sync") {
        onToast(
          "ok",
          t("syncResult", { fetched: data.fetched ?? 0, matched: data.matched ?? 0, unmatched: data.unmatched ?? 0 }),
        );
      } else onToast("ok", t("disconnected"));
      onSuccess();
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
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
              {t("syncBtn")}
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

      {/* Donations stats header (this tenant only). Provider-agnostic — renders whenever the portal
          has ANY money-in, so a Ko-fi/Tipply/custom streamer sees their totals even without a
          Streamlabs OAuth connection. Labels follow the file's existing inline isPl pattern (no new
          i18n keys); provider names come straight from the enum-ish `source` value. PLN here is the
          operator's real settlement currency (admin-only surface), NOT the per-tenant virtual token —
          so it is not a white-label leak. */}
      {stats && stats.count > 0 && (
        <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-0.5">
                {isPl ? "Łącznie (PLN)" : "Total (PLN)"}
              </div>
              <div className="text-lg font-bold text-green-300">
                {stats.totalPln.toLocaleString(nf, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-0.5">
                {isPl ? "Donejty" : "Donations"}
              </div>
              <div className="text-lg font-bold text-white">{stats.count.toLocaleString(nf)}</div>
            </div>
          </div>
          {stats.byProvider.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {stats.byProvider.map((p) => (
                <span
                  key={p.source}
                  className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 border border-zinc-800 px-1.5 py-0.5"
                >
                  {p.source} · {p.count.toLocaleString(nf)} · {p.pln.toLocaleString(nf, { maximumFractionDigits: 0 })} PLN
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Unmatched donations. Decoupled from `connection.connected` (#reconcile-provider-agnostic):
          the queue is populated provider-agnostically — Ko-fi/Tipply/custom enqueue unverified rows
          too, not just Streamlabs — so it must render whenever THIS tenant has unmatched rows, even
          with no Streamlabs OAuth connection. The Streamlabs-specific connect UI stays above where it
          belongs. Still shows the connected empty-state (🎉) for a connected streamer with none. */}
      {(connection.connected || unmatchedDonations.length > 0) && (
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
                  {/* Viewer self-claims (#self-claim). Deliberately styled as a WARNING, not an
                      endorsement: amounts are public on /support, so anyone can assert any figure.
                      Verify against your provider's dashboard (donor name above) before assigning. */}
                  {!!d.claims?.length && (
                    <div className="mb-2 border border-amber-900/60 bg-amber-950/20 p-2">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400 mb-1">
                        {d.claims.length > 1
                          ? (isPl ? `⚠ ${d.claims.length} osoby zgłaszają tę wpłatę` : `⚠ ${d.claims.length} people claim this payment`)
                          : (isPl ? "Zgłoszenie widza (niezweryfikowane)" : "Viewer claim (unverified)")}
                      </div>
                      {d.claims.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setAssignTarget((s) => ({ ...s, [d.id]: c.userId }))}
                          className="w-full text-left px-1.5 py-1 hover:bg-amber-900/20 transition-colors"
                        >
                          <span className="text-xs text-white font-medium">{c.name}</span>
                          {c.evidence && <span className="block text-[11px] text-zinc-400 truncate">„{c.evidence}”</span>}
                        </button>
                      ))}
                      <p className="text-[10px] text-zinc-500 mt-1 leading-snug">
                        {isPl
                          ? "Kwota i data są publiczne — to NIE jest dowód. Porównaj z panelem dostawcy płatności (imię darczyńcy wyżej), zanim przypiszesz."
                          : "Amount and date are public — this is NOT proof. Check your payment provider (donor name above) before assigning."}
                      </p>
                    </div>
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

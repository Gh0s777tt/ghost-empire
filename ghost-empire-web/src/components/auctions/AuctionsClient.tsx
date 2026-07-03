"use client";
// src/components/auctions/AuctionsClient.tsx
// Auction House (#762) — viewers bid GT on perks/items; highest bid at the deadline wins
// and their GT is burned (the sink). Data + actions via /api/auctions. Admins (canManage)
// also get a create form + per-auction cancel. Live countdown + light polling keep the
// board fresh while a bidding war is on.
import { useState, useEffect, useCallback } from "react";
import { Loader2, Gavel, Crown, Clock, Trophy, Ban, Plus, Coins } from "lucide-react";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { emitBalance } from "@/lib/balance-bus";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { useTenantBranding } from "@/components/TenantBranding";
import { ErrorState } from "@/components/EmptyState";
import { displayStatus } from "@/lib/auctions";

type Auction = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  minBid: number;
  currentBid: number | null;
  nextMinBid: number;
  status: string;
  endsAt: string;
  bidCount: number;
  highBidderName: string | null;
  winnerName: string | null;
  winningBid: number | null;
  youAreHighBidder: boolean;
};
type Data = { auctions: Auction[]; balance: number | null };

const DURATIONS = [
  { key: "1h", ms: 60 * 60_000 },
  { key: "6h", ms: 6 * 60 * 60_000 },
  { key: "12h", ms: 12 * 60 * 60_000 },
  { key: "24h", ms: 24 * 60 * 60_000 },
  { key: "3d", ms: 3 * 24 * 60 * 60_000 },
  { key: "7d", ms: 7 * 24 * 60 * 60_000 },
] as const;

function timeLeftLabel(endsAt: string, now: number, t: (k: string, v?: Record<string, number>) => string): string {
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return t("ended");
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return t("endsD", { d, h });
  if (h > 0) return t("endsH", { h, m });
  return t("endsM", { m, s: sec });
}

export function AuctionsClient({ isAuthenticated, canManage }: { isAuthenticated: boolean; canManage: boolean }) {
  const t = useTranslations("auctions");
  const tc = useTranslations("common");
  const fmt = useLocaleFmt();
  const { tokenSymbol } = useTenantBranding();
  const sym = tokenSymbol || "GT";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [bids, setBids] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());

  // Create form (admins only)
  const [cTitle, setCTitle] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [cImage, setCImage] = useState("");
  const [cMinBid, setCMinBid] = useState("");
  const [cDuration, setCDuration] = useState<(typeof DURATIONS)[number]["key"]>("24h");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try { setData(await apiGet<Data>("/api/auctions")); setError(false); }
    catch { setError(true); /* keep any current data (poll failure) */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Tick the countdown every second + poll the board every 20s so competing bids show up.
  // `load` is stable (useCallback []), so this effect mounts the timers once.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => void load(), 20_000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [load]);

  function flash(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3000);
  }

  async function bid(a: Auction) {
    if (!isAuthenticated) { void signIn(); return; }
    const raw = (bids[a.id] ?? "").trim();
    const amount = raw ? parseInt(raw, 10) : a.nextMinBid;
    if (!Number.isFinite(amount) || amount <= 0) { flash("err", t("errAmount")); return; }
    setBusy(a.id);
    try {
      const r = await apiPost<{ balance: number; currentBid: number }>("/api/auctions", { action: "bid", auctionId: a.id, amount });
      emitBalance(r.balance);
      flash("ok", t("bidPlaced"));
      setBids((b) => ({ ...b, [a.id]: "" }));
      await load();
    } catch (err) {
      flash("err", err instanceof ApiError ? err.message : t("errGeneric"));
      await load(); // refresh nextMinBid if we were outbid in the meantime
    } finally {
      setBusy(null);
    }
  }

  async function createAuction() {
    const minBid = parseInt(cMinBid || "0", 10);
    const durationMs = DURATIONS.find((d) => d.key === cDuration)?.ms ?? 0;
    setBusy("create");
    try {
      await apiPost("/api/auctions", { action: "create", title: cTitle.trim(), description: cDesc.trim(), imageUrl: cImage.trim(), minBid, durationMs });
      flash("ok", t("created"));
      setCTitle(""); setCDesc(""); setCImage(""); setCMinBid(""); setShowCreate(false);
      await load();
    } catch (err) {
      flash("err", err instanceof ApiError ? err.message : t("errGeneric"));
    } finally {
      setBusy(null);
    }
  }

  async function cancelAuction(a: Auction) {
    if (!confirm(t("cancelConfirm"))) return;
    setBusy(a.id);
    try {
      await apiPost("/api/auctions", { action: "cancel", auctionId: a.id });
      flash("ok", t("cancelled"));
      await load();
    } catch (err) {
      flash("err", err instanceof ApiError ? err.message : t("errGeneric"));
    } finally {
      setBusy(null);
    }
  }

  const auctions = data?.auctions ?? [];
  const live = auctions.filter((a) => displayStatus(a, now) === "live");
  const past = auctions.filter((a) => displayStatus(a, now) !== "live");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Gavel className="w-7 h-7 text-amber-400" />
        <h1 className="font-display text-3xl sm:text-4xl text-white tracking-wide">{t("title")}</h1>
      </div>
      <p className="text-sm text-zinc-400 mb-5">{t("subtitle", { sym })}</p>

      {data?.balance != null && (
        <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 border border-zinc-800 bg-black/30 text-sm">
          <Coins className="w-4 h-4 text-amber-400" />
          <span className="text-zinc-400">{t("yourBalance")}</span>
          <span className="font-bold text-white">{fmt(data.balance)} {sym}</span>
        </div>
      )}

      {/* Admin: create */}
      {canManage && (
        <div className="mb-6 border border-amber-900/40 bg-amber-950/10 p-4">
          {!showCreate ? (
            <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-amber-400 hover:text-amber-300">
              <Plus className="w-4 h-4" /> {t("createTitle")}
            </button>
          ) : (
            <div className="space-y-2">
              <h3 className="font-display text-lg text-white">{t("createTitle")}</h3>
              <input value={cTitle} onChange={(e) => setCTitle(e.target.value)} placeholder={t("fTitle")} maxLength={80}
                className="w-full bg-black/40 border border-zinc-700 px-3 py-2 text-sm text-white" />
              <textarea value={cDesc} onChange={(e) => setCDesc(e.target.value)} placeholder={t("fDesc")} maxLength={300} rows={2}
                className="w-full bg-black/40 border border-zinc-700 px-3 py-2 text-sm text-white" />
              <input value={cImage} onChange={(e) => setCImage(e.target.value)} placeholder={t("fImage")} maxLength={500}
                className="w-full bg-black/40 border border-zinc-700 px-3 py-2 text-sm text-white" />
              <div className="flex flex-wrap gap-2">
                <input value={cMinBid} onChange={(e) => setCMinBid(e.target.value.replace(/[^0-9]/g, ""))} placeholder={t("fMinBid", { sym })} inputMode="numeric"
                  className="flex-1 min-w-[120px] bg-black/40 border border-zinc-700 px-3 py-2 text-sm text-white" />
                <select value={cDuration} onChange={(e) => setCDuration(e.target.value as (typeof DURATIONS)[number]["key"])}
                  className="bg-black/40 border border-zinc-700 px-3 py-2 text-sm text-white">
                  {DURATIONS.map((d) => <option key={d.key} value={d.key}>{t(`dur_${d.key}`)}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={createAuction} disabled={busy === "create" || !cTitle.trim() || !cMinBid}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold uppercase tracking-widest bg-amber-600 hover:bg-amber-500 text-black disabled:opacity-40">
                  {busy === "create" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gavel className="w-3 h-3" />} {t("createBtn")}
                </button>
                <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs font-mono uppercase tracking-widest text-zinc-500 hover:text-zinc-300">{t("cancelBtnSmall")}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm py-12 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}</div>
      ) : error && auctions.length === 0 ? (
        // A failed initial load used to fall through to the "empty" message (looked like there
        // were simply no auctions). Now it's an explicit error with retry (#783/A5).
        <ErrorState title={tc("errorTitle")} message={t("loadErr")} retryLabel={tc("retry")} onRetry={() => { setLoading(true); void load(); }} />
      ) : auctions.length === 0 ? (
        <div className="text-center text-zinc-500 text-sm py-12 border border-zinc-800/60 bg-black/20">{t("empty")}</div>
      ) : (
        <div className="space-y-6">
          {live.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500">{t("liveHeading")}</h2>
              {live.map((a) => (
                <AuctionCard key={a.id} a={a} now={now} sym={sym} fmt={fmt} t={t} busy={busy === a.id}
                  bidValue={bids[a.id] ?? ""} onBidChange={(v) => setBids((b) => ({ ...b, [a.id]: v }))}
                  onBid={() => bid(a)} canManage={canManage} onCancel={() => cancelAuction(a)} isAuthenticated={isAuthenticated} />
              ))}
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-600">{t("pastHeading")}</h2>
              {past.map((a) => (
                <AuctionCard key={a.id} a={a} now={now} sym={sym} fmt={fmt} t={t} busy={false}
                  bidValue="" onBidChange={() => {}} onBid={() => {}} canManage={false} onCancel={() => {}} isAuthenticated={isAuthenticated} />
              ))}
            </section>
          )}
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 text-sm font-medium border ${toast.kind === "ok" ? "bg-emerald-950 border-emerald-700 text-emerald-300" : "bg-red-950 border-red-700 text-red-300"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function AuctionCard({
  a, now, sym, fmt, t, busy, bidValue, onBidChange, onBid, canManage, onCancel, isAuthenticated,
}: {
  a: Auction; now: number; sym: string; fmt: (n: number) => string;
  t: (k: string, v?: Record<string, number | string>) => string; busy: boolean;
  bidValue: string; onBidChange: (v: string) => void; onBid: () => void;
  canManage: boolean; onCancel: () => void; isAuthenticated: boolean;
}) {
  const state = displayStatus(a, now);
  const isLive = state === "live";
  return (
    <div className={`border bg-black/30 overflow-hidden ${a.youAreHighBidder && isLive ? "border-amber-500" : "border-zinc-800"}`}>
      <div className="flex flex-col sm:flex-row">
        {a.imageUrl && (
          <img src={a.imageUrl} alt="" className="w-full sm:w-40 h-36 sm:h-auto object-cover bg-zinc-900" loading="lazy" decoding="async" />
        )}
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-xl text-white leading-tight">{a.title}</h3>
            {isLive ? (
              <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                <Clock className="w-3 h-3" /> {timeLeftLabel(a.endsAt, now, t)}
              </span>
            ) : state === "cancelled" ? (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-zinc-600">{t("statusCancelled")}</span>
            ) : (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-zinc-500">{t("statusEnded")}</span>
            )}
          </div>
          {a.description && <p className="text-sm text-zinc-400 mt-1">{a.description}</p>}

          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{a.currentBid != null ? t("currentBid") : t("startingBid")}</div>
              <div className="text-2xl font-bold text-white">{fmt(a.currentBid ?? a.minBid)} <span className="text-sm text-zinc-500">{sym}</span></div>
              {a.highBidderName && isLive && (
                <div className="text-[11px] text-zinc-500 mt-0.5 inline-flex items-center gap-1">
                  <Crown className="w-3 h-3 text-amber-500" /> {a.youAreHighBidder ? t("youLead") : t("leadBy", { name: a.highBidderName })}
                </div>
              )}
            </div>
            <div className="text-right text-[11px] text-zinc-600">{t("bidCount", { n: a.bidCount })}</div>
          </div>

          {/* Ended → winner; Live → bid controls */}
          {!isLive ? (
            state === "ended" && a.winnerName ? (
              <div className="mt-3 inline-flex items-center gap-1.5 text-sm text-amber-300 border border-amber-900/50 bg-amber-950/20 px-2.5 py-1">
                <Trophy className="w-4 h-4" /> {t("wonBy", { name: a.winnerName, amount: fmt(a.winningBid ?? 0), sym })}
              </div>
            ) : state === "ended" ? (
              <div className="mt-3 text-xs text-zinc-600">{t("noWinner")}</div>
            ) : null
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={bidValue}
                onChange={(e) => onBidChange(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder={`${fmt(a.nextMinBid)}+`}
                inputMode="numeric"
                className="w-32 bg-black/40 border border-zinc-700 px-3 py-2 text-sm text-white focus:border-amber-600 outline-none"
              />
              <button
                onClick={onBid}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-widest bg-amber-600 hover:bg-amber-500 text-black disabled:opacity-40"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gavel className="w-3.5 h-3.5" />}
                {isAuthenticated ? t("bidBtn") : t("signInToBid")}
              </button>
              <span className="text-[11px] text-zinc-600">{t("minNext", { amount: fmt(a.nextMinBid), sym })}</span>
              {canManage && (
                <button onClick={onCancel} disabled={busy} className="ms-auto inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-zinc-600 hover:text-red-400 disabled:opacity-40">
                  <Ban className="w-3 h-3" /> {t("cancelBtn")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

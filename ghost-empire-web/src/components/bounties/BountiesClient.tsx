"use client";
// src/components/bounties/BountiesClient.tsx
// Viewer Bounties (#679): viewers pool GT behind a challenge for the streamer. Anyone can
// open a bounty (with an initial pledge) or top up an existing one; pledges escrow GT. The
// streamer resolves in the admin panel — "completed" keeps the pool, "rejected" refunds all.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import HowItWorks from "@/components/HowItWorks";
import { emitBalance } from "@/lib/balance-bus";
import { Link } from "@/i18n/navigation";
import { Target, Coins, Plus, Loader2, History, Users, Trophy } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ToastProvider";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { useTenantBranding } from "@/components/TenantBranding";
import { apiPost, ApiError } from "@/lib/api-client";

const MIN_PLEDGE = 50;

type OpenBounty = {
  id: string;
  title: string;
  description: string | null;
  pooledGt: number;
  backers: number;
  creator: { name: string; image: string | null };
  createdAt: string;
  expiresAt: string | null;
  iBacked: boolean;
};

type RecentBounty = {
  id: string;
  title: string;
  status: string;
  pooledGt: number;
  backers: number;
  creator: { name: string; image: string | null };
  resolvedAt: string | null;
};

export function BountiesClient({
  isAuthenticated, myTokens, open, recent,
}: {
  isAuthenticated: boolean;
  myTokens: number;
  open: OpenBounty[];
  recent: RecentBounty[];
}) {
  const t = useTranslations("bounties");
  const fmt = useLocaleFmt();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const toast = useToast();
  const { tokenSymbol } = useTenantBranding();

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Target className="w-7 h-7 text-red-500" />
          <h1
            className="font-display text-4xl text-white tracking-wider"
            style={{ textShadow: "2px 0 0 rgba(229,9,20,0.6), -2px 0 0 rgba(139,0,0,0.4)" }}
          >
            {t("heading")}
          </h1>
        </div>
        <p className="text-zinc-500 text-sm max-w-2xl">
          {t.rich("subtitle", { b: (c) => <strong className="text-white">{c}</strong> })}
        </p>
        <HowItWorks>{t("help")}</HowItWorks>
      </div>

      {/* Balance */}
      {isAuthenticated && (
        <div className="border border-zinc-800 bg-zinc-950/70 p-3 flex items-center gap-3">
          <Coins className="w-5 h-5 text-yellow-500" />
          <div className="text-sm text-zinc-400">{t("balance")}</div>
          <div className="font-mono font-bold text-white text-lg tabular-nums">{fmt(myTokens)} <span className="text-xs text-zinc-500">{tokenSymbol}</span></div>
        </div>
      )}

      {!isAuthenticated && (
        <div className="border border-blue-700 bg-blue-950/30 p-4 text-sm text-blue-200">
          {t("loginPrompt")}{" "}
          <Link href="/auth/signin?callbackUrl=/bounties" className="text-white underline">{t("login")}</Link>
        </div>
      )}

      {/* Create a bounty */}
      {isAuthenticated && <CreateBountyForm myTokens={myTokens} onToast={toast.show} onSuccess={refresh} />}

      {/* Open bounties */}
      <section>
        <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-red-500" />
          {t("openTitle", { count: open.length })}
        </h2>
        {open.length === 0 ? (
          <EmptyState
            icon={<Target className="w-6 h-6" />}
            title={t("emptyTitle")}
            message={t("emptyMsg")}
          />
        ) : (
          <div className="space-y-4">
            {open.map((b) => (
              <OpenBountyCard
                key={b.id}
                bounty={b}
                isAuthenticated={isAuthenticated}
                myTokens={myTokens}
                onToast={toast.show}
                onSuccess={refresh}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recent / resolved */}
      {recent.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <History className="w-5 h-5 text-zinc-500" />
            {t("recentTitle")}
          </h2>
          <div className="space-y-2">
            {recent.map((b) => (
              <RecentBountyRow key={b.id} bounty={b} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CreateBountyForm({
  myTokens, onToast, onSuccess,
}: {
  myTokens: number;
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
}) {
  const t = useTranslations("bounties");
  const fmt = useLocaleFmt();
  const { tokenSymbol } = useTenantBranding();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pledgeInput, setPledgeInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = title.trim();
    if (trimmed.length < 3) { onToast("err", t("titleTooShort")); return; }
    const pledge = parseInt(pledgeInput, 10);
    if (!pledge || pledge < MIN_PLEDGE) { onToast("err", t("minPledge", { min: fmt(MIN_PLEDGE) })); return; }
    if (pledge > myTokens) { onToast("err", t("notEnough")); return; }

    setBusy(true);
    try {
      const data = await apiPost<{ newBalance: number }>("/api/bounties", {
        title: trimmed,
        description: description.trim() || undefined,
        initialPledge: pledge,
      });
      emitBalance(data.newBalance);
      onToast("ok", t("created", { balance: fmt(data.newBalance) }));
      setTitle(""); setDescription(""); setPledgeInput("");
      onSuccess();
    } catch (err) {
      onToast("err", err instanceof ApiError ? err.message : t("err"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border border-zinc-800 bg-zinc-950/70 p-5 card-ghost-red">
      <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2 uppercase tracking-widest">
        <Plus className="w-4 h-4 text-red-500" />
        {t("createTitle")}
      </h2>
      <div className="space-y-3">
        <input
          type="text"
          maxLength={120}
          placeholder={t("titlePlaceholder")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border border-zinc-700 bg-black/40 px-3 py-2 text-sm text-white outline-hidden focus:border-red-600"
        />
        <textarea
          maxLength={500}
          rows={2}
          placeholder={t("descPlaceholder")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border border-zinc-700 bg-black/40 px-3 py-2 text-sm text-white outline-hidden focus:border-red-600 resize-none"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("initialPledge")}</span>
          <input
            type="number"
            min={MIN_PLEDGE}
            max={myTokens}
            placeholder={tokenSymbol}
            value={pledgeInput}
            onChange={(e) => setPledgeInput(e.target.value)}
            className="w-28 border border-zinc-700 bg-black/40 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-red-600"
          />
          <div className="flex gap-1">
            {[100, 500, 1000, 5000].filter((v) => v <= myTokens).map((v) => (
              <button
                key={v}
                onClick={() => setPledgeInput(String(v))}
                className="text-[10px] font-mono text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 px-1.5 py-0.5"
              >
                {fmt(v)}
              </button>
            ))}
          </div>
          <button
            onClick={submit}
            disabled={busy || !title.trim() || !pledgeInput}
            className="ml-auto px-4 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-30 flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Target className="w-3 h-3" />}
            {t("createBtn")}
          </button>
        </div>
      </div>
    </section>
  );
}

function OpenBountyCard({
  bounty, isAuthenticated, myTokens, onToast, onSuccess,
}: {
  bounty: OpenBounty;
  isAuthenticated: boolean;
  myTokens: number;
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
}) {
  const t = useTranslations("bounties");
  const fmt = useLocaleFmt();
  const [pledgeInput, setPledgeInput] = useState("");
  const [busy, setBusy] = useState(false);
  const { tokenSymbol } = useTenantBranding();

  async function pledge() {
    const amount = parseInt(pledgeInput, 10);
    if (!amount || amount < MIN_PLEDGE) { onToast("err", t("minPledge", { min: fmt(MIN_PLEDGE) })); return; }
    if (amount > myTokens) { onToast("err", t("notEnough")); return; }

    setBusy(true);
    try {
      const data = await apiPost<{ newBalance: number; pooledGt: number }>("/api/bounties/pledge", {
        bountyId: bounty.id,
        amount,
      });
      emitBalance(data.newBalance);
      onToast("ok", t("pledged", { amount: fmt(amount), balance: fmt(data.newBalance) }));
      setPledgeInput("");
      onSuccess();
    } catch (err) {
      onToast("err", err instanceof ApiError ? err.message : t("err"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-red-900/60 bg-zinc-950/70 p-5" style={{ boxShadow: "0 8px 30px -14px rgba(229,9,20,0.4)" }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-white font-bold text-base sm:text-lg border-s-2 border-red-700 ps-2">{bounty.title}</h3>
          {bounty.description && <p className="text-zinc-400 text-sm mt-2 ps-2">{bounty.description}</p>}
        </div>
        <div className="text-end shrink-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("pooled")}</div>
          <div className="font-mono font-bold text-yellow-500 text-xl tabular-nums">{fmt(bounty.pooledGt)} {tokenSymbol}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-zinc-500 mb-3 flex-wrap">
        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {bounty.backers} {t("backers", { count: bounty.backers })}</span>
        <span>{t("by", { name: bounty.creator.name })}</span>
        {bounty.iBacked && (
          <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-green-700 bg-green-950/40 text-green-300">
            {t("youBacked")}
          </span>
        )}
      </div>

      {/* Pledge form */}
      {isAuthenticated && (
        <div className="border-t border-zinc-800 pt-3 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("addPledge")}</span>
          <input
            type="number"
            min={MIN_PLEDGE}
            max={myTokens}
            placeholder={tokenSymbol}
            value={pledgeInput}
            onChange={(e) => setPledgeInput(e.target.value)}
            className="w-28 border border-zinc-700 bg-black/40 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-red-600"
          />
          <div className="flex gap-1">
            {[100, 500, 1000].filter((v) => v <= myTokens).map((v) => (
              <button
                key={v}
                onClick={() => setPledgeInput(String(v))}
                className="text-[10px] font-mono text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 px-1.5 py-0.5"
              >
                {fmt(v)}
              </button>
            ))}
          </div>
          <button
            onClick={pledge}
            disabled={busy || !pledgeInput}
            className={cn(
              "ml-auto px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-30 flex items-center gap-1.5",
            )}
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Coins className="w-3 h-3" />}
            {t("backBtn")}
          </button>
        </div>
      )}
    </div>
  );
}

function RecentBountyRow({ bounty }: { bounty: RecentBounty }) {
  const t = useTranslations("bounties");
  const fmt = useLocaleFmt();
  const { tokenSymbol } = useTenantBranding();
  const completed = bounty.status === "completed";

  return (
    <div className="border border-zinc-800 bg-zinc-950/40 p-3 text-sm">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-white truncate flex-1">{bounty.title}</div>
        {completed ? (
          <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-green-700 bg-green-950/40 text-green-300">{t("statusCompleted")}</span>
        ) : (
          <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-zinc-700 text-zinc-400">{t(bounty.status === "expired" ? "statusExpired" : "statusRejected")}</span>
        )}
      </div>
      <div className="text-xs text-zinc-500 flex flex-wrap items-center gap-3">
        <span>{t("by", { name: bounty.creator.name })}</span>
        <span>{t("pooled")}: <span className="text-zinc-300 font-mono">{fmt(bounty.pooledGt)} {tokenSymbol}</span></span>
        <span>{bounty.backers} {t("backers", { count: bounty.backers })}</span>
      </div>
    </div>
  );
}

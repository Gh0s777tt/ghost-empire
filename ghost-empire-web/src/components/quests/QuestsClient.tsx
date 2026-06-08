"use client";
// src/components/quests/QuestsClient.tsx
import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import {
  Zap, Check, Loader2, MessageCircle, Mic2, Gift, Flame, X, Clock,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { useLocaleFmt } from "@/lib/use-locale-fmt";

type UserTask = {
  id: string;
  taskId: string;
  progress: number;
  done: boolean;
  claimed: boolean;
  claimedAt: string | null;
  task: {
    code: string;
    text: string;
    textEn: string | null;
    target: number;
    reward: number;
    bonusReward: number;
    triggerType: string;
  };
};

const TRIGGER_META: Record<string, { icon: typeof MessageCircle; color: string }> = {
  messages:      { icon: MessageCircle, color: "#5865F2" },
  voice_minutes: { icon: Mic2,          color: "#9146FF" },
  drop_code:     { icon: Gift,          color: "#FF4500" },
  shop_purchase: { icon: Gift,          color: "#10b981" },
  manual:        { icon: Zap,           color: "#a855f7" },
};

function secondsUntilMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  return Math.floor((tomorrow.getTime() - now.getTime()) / 1000);
}

function formatHMS(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function QuestsClient({
  tasks: initialTasks,
  streak,
  balance,
}: {
  tasks: UserTask[];
  streak: number;
  balance: number;
}) {
  const t = useTranslations("quests");
  const fmt = useLocaleFmt();
  const router = useRouter();
  const { update: refreshSession } = useSession();
  const [tasks, setTasks] = useState(initialTasks);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [resetIn, setResetIn] = useState(() => secondsUntilMidnight());

  useEffect(() => {
    const t = setInterval(() => setResetIn(secondsUntilMidnight()), 1000);
    return () => clearInterval(t);
  }, []);

  const completedCount = tasks.filter((t) => t.progress >= t.task.target).length;
  const claimedCount = tasks.filter((t) => t.claimed).length;
  const totalClaimableTokens = tasks
    .filter((t) => t.progress >= t.task.target && !t.claimed)
    .reduce((sum, t) => sum + t.task.reward, 0);
  const totalReward = tasks.reduce((sum, t) => sum + t.task.reward, 0);

  function showToast(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4500);
  }

  async function claim(taskId: string) {
    setBusyId(taskId);
    try {
      const res = await fetch("/api/tasks/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast("err", data.error ?? t("err"));
        return;
      }
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) =>
          t.taskId === taskId
            ? { ...t, claimed: true, claimedAt: new Date().toISOString() }
            : t,
        ),
      );
      showToast("ok", t("claimedToast", { reward: fmt(data.reward), balance: fmt(data.newBalance) }));
      await refreshSession();
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Zap className="w-6 h-6 text-orange-500" />
            <h1
              className="font-display text-4xl text-white tracking-wider"
              style={{ textShadow: "2px 0 0 rgba(255,69,0,0.7), -2px 0 0 rgba(139,0,0,0.4)" }}
            >
              {t("title")}
            </h1>
          </div>
          <p className="text-zinc-500 text-sm">
            {t("subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-3 border border-zinc-800 bg-zinc-950/80 px-4 py-2.5">
          <Clock className="w-4 h-4 text-orange-500" />
          <div className="leading-tight">
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              {t("resetIn")}
            </div>
            <div className="font-mono text-lg font-bold text-white tabular-nums">
              {formatHMS(resetIn)}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label={t("statDone")}
          value={`${completedCount} / ${tasks.length}`}
          emoji="✅"
          accent={completedCount === tasks.length && tasks.length > 0}
        />
        <StatTile
          label={t("statClaimed")}
          value={`${claimedCount} / ${tasks.length}`}
          emoji="🎁"
        />
        <StatTile
          label={t("statClaimable")}
          value={`${fmt(totalClaimableTokens)}`}
          suffix="GT"
          emoji="💰"
          accent={totalClaimableTokens > 0}
        />
        <StatTile
          label={t("statStreak")}
          value={streak.toString()}
          suffix={t("streakUnit", { count: streak })}
          emoji="🔥"
        />
      </div>

      {/* All claimed banner */}
      {tasks.length > 0 && claimedCount === tasks.length && (
        <div
          className="border-2 border-green-700 bg-green-950/30 p-4 flex items-center gap-3"
          style={{
            clipPath:
              "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
          }}
        >
          <div className="text-3xl">🎉</div>
          <div>
            <div className="font-bold text-green-300 text-sm">{t("allDoneTitle")}</div>
            <div className="text-zinc-400 text-xs">
              {t("allDoneMsg", { total: fmt(totalReward) })}
            </div>
          </div>
        </div>
      )}

      {/* Tasks */}
      {tasks.length === 0 ? (
        <EmptyState
          icon={<Zap className="w-6 h-6" />}
          title={t("emptyTitle")}
          message={t("emptyMsg")}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tasks.map((t) => (
            <QuestCard
              key={t.id}
              userTask={t}
              busy={busyId === t.taskId || pending}
              onClaim={() => claim(t.taskId)}
            />
          ))}
        </div>
      )}

      {/* How it works */}
      <div className="border border-zinc-800 bg-zinc-950/50 p-5 mt-8">
        <h3 className="font-display text-base text-white tracking-wider mb-3">{t("howTitle")}</h3>
        <ul className="text-xs text-zinc-400 space-y-1.5">
          <li className="flex gap-2">
            <span className="text-orange-500 shrink-0">▸</span>
            {t("how1")}
          </li>
          <li className="flex gap-2">
            <span className="text-orange-500 shrink-0">▸</span>
            {t("how2")}
          </li>
          <li className="flex gap-2">
            <span className="text-orange-500 shrink-0">▸</span>
            {t.rich("how3", { b: (c) => <strong className="text-white">{c}</strong> })}
          </li>
          <li className="flex gap-2">
            <span className="text-orange-500 shrink-0">▸</span>
            {t("how4")}
          </li>
        </ul>
      </div>

      {toast && (
        <div
          className={cn(
            "fixed bottom-6 end-6 z-50 max-w-md border px-4 py-3 flex items-center gap-3 shadow-2xl",
            toast.kind === "ok"
              ? "border-green-700 bg-green-950/90 text-green-200"
              : "border-red-700 bg-red-950/90 text-red-200",
          )}
        >
          {toast.kind === "ok" ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          <span className="text-sm">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

function StatTile({
  label, value, suffix, emoji, accent,
}: {
  label: string; value: string; suffix?: string; emoji: string; accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "border bg-zinc-950/70 backdrop-blur-xs p-3",
        accent ? "border-orange-700 bg-orange-950/20" : "border-zinc-800",
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base">{emoji}</span>
        <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
          {label}
        </span>
      </div>
      <div className="font-mono text-xl font-bold text-white tabular-nums">
        {value}
        {suffix && <span className="text-zinc-500 text-xs ms-1">{suffix}</span>}
      </div>
    </div>
  );
}

function QuestCard({
  userTask,
  busy,
  onClaim,
}: {
  userTask: UserTask;
  busy: boolean;
  onClaim: () => void;
}) {
  const t = useTranslations("quests");
  const locale = useLocale();
  const fmt = useLocaleFmt();
  const { task, progress, claimed } = userTask;
  const done = progress >= task.target;
  const ratio = Math.min(100, (progress / task.target) * 100);
  const meta = TRIGGER_META[task.triggerType] ?? TRIGGER_META.manual;
  const Icon = meta.icon;
  const unitMap: Record<string, string> = {
    messages: t("unitMessages"),
    voice_minutes: t("unitVoice"),
    drop_code: t("unitDrop"),
    shop_purchase: t("unitPurchase"),
  };
  const unit = unitMap[task.triggerType] ?? "";
  const isEn = locale === "en";
  const title = isEn && task.textEn ? task.textEn : task.text;
  const subtitle = isEn ? null : task.textEn;

  const status: "claimed" | "claimable" | "in_progress" = claimed
    ? "claimed"
    : done
      ? "claimable"
      : "in_progress";

  return (
    <div
      className={cn(
        "border bg-zinc-950/80 backdrop-blur-xs p-4 flex flex-col transition-all",
        status === "claimed" && "border-zinc-800 opacity-60",
        status === "claimable" && "border-green-700 bg-green-950/10",
        status === "in_progress" && "border-zinc-800",
      )}
      style={{
        clipPath:
          "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-10 h-10 shrink-0 flex items-center justify-center"
          style={{ background: meta.color + "20", border: `1px solid ${meta.color}50` }}
        >
          <Icon className="w-4 h-4" style={{ color: meta.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">
            {task.code.replace("daily_", "").toUpperCase()}
          </div>
          <h3 className="text-white text-sm font-bold leading-tight">{title}</h3>
          {subtitle && (
            <p className="text-zinc-600 text-[10px] mt-0.5 italic">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest mb-1.5">
          <span className="text-zinc-500">{t("progress")}</span>
          <span className={status === "claimable" ? "text-green-300" : "text-white"}>
            {fmt(Math.min(progress, task.target))} / {fmt(task.target)}{" "}
            <span className="text-zinc-500">{unit}</span>
          </span>
        </div>
        <div className="h-2 bg-zinc-900 border border-zinc-800 overflow-hidden">
          <div
            className="h-full transition-all"
            style={{
              width: `${ratio}%`,
              background:
                status === "claimable"
                  ? "linear-gradient(90deg, #10b981, #34d399)"
                  : `linear-gradient(90deg, ${meta.color}, ${meta.color}aa)`,
            }}
          />
        </div>
      </div>

      {/* Reward */}
      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest mb-3">
        <span className="text-zinc-500">{t("reward")}</span>
        <span className="text-white text-sm normal-case font-bold tabular-nums">
          {fmt(task.reward)} GT
          {task.bonusReward > 0 && (
            <span className="text-orange-400 text-xs ms-1.5">{t("bonus", { bonus: fmt(task.bonusReward) })}</span>
          )}
        </span>
      </div>

      {/* Action */}
      <div className="mt-auto">
        {status === "claimed" ? (
          <button
            disabled
            className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-600 text-xs font-bold tracking-widest uppercase cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Check className="w-3.5 h-3.5" />
            {t("claimed")}
          </button>
        ) : status === "claimable" ? (
          <button
            onClick={onClaim}
            disabled={busy}
            className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gift className="w-3.5 h-3.5" />}
            Claim {fmt(task.reward)} GT
          </button>
        ) : (
          <div className="w-full px-4 py-2.5 border border-zinc-800 bg-zinc-950 text-zinc-500 text-xs font-bold tracking-widest uppercase text-center">
            {t("inProgress", { remaining: fmt(task.target - progress), unit })}
          </div>
        )}
      </div>
    </div>
  );
}

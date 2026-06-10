"use client";
// src/components/drops/DropRedeemBox.tsx
import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Gift, Sparkles, Loader2, Check, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { emitBalance } from "@/lib/balance-bus";

type RedeemResult =
  | {
      ok: true;
      code: string;
      reward: number;
      bonusReward: number;
      totalReward: number;
      gotBonus: boolean;
      bonusSlotsLeft: number;
      newBalance: number;
    }
  | { error: string };

export function DropRedeemBox({
  variant = "full",
  isAuthenticated,
}: {
  variant?: "full" | "compact";
  isAuthenticated: boolean;
}) {
  const t = useTranslations("drops");
  const router = useRouter();
  const { update: refreshSession } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<RedeemResult | null>(null);

  async function submit() {
    if (!code.trim() || busy) return;
    setBusy(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/drops/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data: RedeemResult = await res.json();
      setLastResult(data);
      if (res.ok && "ok" in data) {
        setCode("");
        emitBalance(data.newBalance);
        await refreshSession();
        startTransition(() => router.refresh());
        // Auto-clear success message after a while
        setTimeout(() => setLastResult(null), 8000);
      } else {
        // Clear error after 5s
        setTimeout(() => setLastResult(null), 5000);
      }
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  if (!isAuthenticated) {
    return (
      <div
        className={cn(
          "border border-zinc-800 bg-zinc-950/80 backdrop-blur-xs p-5 text-center",
          variant === "compact" && "p-4",
        )}
        style={{
          clipPath:
            "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
        }}
      >
        <Gift className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
        <p className="text-zinc-400 text-sm mb-3">
          {t("loginPrompt")}
        </p>
        <button
          onClick={() => signIn()}
          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase"
        >
          {t("login")}
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border-2 border-orange-700 bg-linear-to-br from-orange-950/30 to-red-950/20 backdrop-blur-xs p-5 sm:p-6",
        variant === "compact" && "p-4",
      )}
      style={{
        clipPath:
          "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Gift className="w-4 h-4 text-orange-400" />
        <h2 className="font-display text-lg sm:text-xl text-white tracking-wider">
          DROP CODE
        </h2>
        <Zap className="w-4 h-4 text-orange-400 animate-pulse" />
      </div>
      {variant === "full" && (
        <p className="text-zinc-400 text-xs mb-4">
          {t("hint")}
        </p>
      )}

      <div className="flex gap-2 mb-3">
        <input
          ref={inputRef}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 24))}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="GHOST24"
          disabled={busy}
          className="flex-1 min-w-0 bg-black/50 border-2 border-zinc-800 focus:border-orange-500 px-4 py-3 text-lg sm:text-2xl text-white font-mono tracking-[0.3em] uppercase outline-hidden placeholder:text-zinc-700 placeholder:tracking-normal disabled:opacity-50 transition-colors"
        />
        <button
          onClick={submit}
          disabled={busy || !code.trim()}
          className="px-4 sm:px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white text-xs sm:text-sm font-bold tracking-widest uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {variant === "full" ? "REDEEM" : "GO"}
        </button>
      </div>

      {/* Result feedback */}
      {lastResult && (
        <ResultMessage result={lastResult} />
      )}

      {variant === "full" && !lastResult && (
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          <span>{t("footer")}</span>
        </div>
      )}
    </div>
  );
}

function ResultMessage({ result }: { result: RedeemResult }) {
  const t = useTranslations("drops");
  const fmt = useLocaleFmt();
  if ("error" in result) {
    return (
      <div className="border border-red-700 bg-red-950/40 px-3 py-2 flex items-start gap-2">
        <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <span className="text-red-200 text-sm">{result.error}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border-2 px-3 py-3 flex items-start gap-3",
        result.gotBonus
          ? "border-yellow-500 bg-yellow-950/30 shadow-lg shadow-yellow-500/20"
          : "border-green-700 bg-green-950/30",
      )}
    >
      <div className="text-2xl shrink-0">
        {result.gotBonus ? "🌟" : "🎁"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Check className={cn("w-4 h-4 shrink-0", result.gotBonus ? "text-yellow-400" : "text-green-400")} />
          <span className={cn("font-bold text-sm", result.gotBonus ? "text-yellow-200" : "text-green-200")}>
            {result.gotBonus ? t("bonus") : t("success")} +{fmt(result.totalReward)} GT
          </span>
        </div>
        <div className="text-xs text-zinc-400 mt-0.5">
          {t("code")} <span className="font-mono text-white">{result.code}</span>
          {result.gotBonus && (
            <>
              {" · "}
              {t("breakdown", { reward: fmt(result.reward), bonus: fmt(result.bonusReward) })}
            </>
          )}
          {" · "}
          {t("balance")} <span className="text-white font-mono">{fmt(result.newBalance)} GT</span>
        </div>
        {!result.gotBonus && result.bonusSlotsLeft === 0 && (
          <div className="text-[10px] text-zinc-500 mt-1">
            {t("bonusGone")}
          </div>
        )}
      </div>
    </div>
  );
}

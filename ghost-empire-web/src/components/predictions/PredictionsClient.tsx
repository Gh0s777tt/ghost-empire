"use client";
// src/components/predictions/PredictionsClient.tsx
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Dice5, Coins, Trophy, Clock, Check, X, Loader2, History } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { fmt, cn } from "@/lib/utils";

type ActivePrediction = {
  id: string;
  question: string;
  status: string;
  options: Array<{ index: number; label: string; totalWagered: number; wagerCount: number }>;
  totalPot: number;
  opensAt: string;
  closesAt: string | null;
  myEntry: { optionIndex: number; tokensWagered: number } | null;
};

type RecentPrediction = {
  id: string;
  question: string;
  status: string;
  options: string[];
  resolvedOptionIndex: number | null;
  totalPot: number;
  resolvedAt: string | null;
  myResult: {
    optionIndex: number;
    tokensWagered: number;
    payout: number;
    won: boolean;
  } | null;
};

export function PredictionsClient({
  isAuthenticated, myTokens, active, recent,
}: {
  isAuthenticated: boolean;
  myTokens: number;
  active: ActivePrediction[];
  recent: RecentPrediction[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  function showToast(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4500);
  }
  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Dice5 className="w-7 h-7 text-red-500" />
          <h1
            className="font-display text-4xl text-white tracking-wider"
            style={{ textShadow: "2px 0 0 rgba(229,9,20,0.6), -2px 0 0 rgba(139,0,0,0.4)" }}
          >
            PREDICTIONS
          </h1>
        </div>
        <p className="text-zinc-500 text-sm max-w-2xl">
          Obstawiaj wydarzenia streamowe za Ghost Tokens. Wygrywająca opcja dzieli między siebie <strong className="text-white">całą pulę</strong> (włącznie ze stawkami przegranych) proporcjonalnie do wpłaconych GT.
        </p>
      </div>

      {/* Balance */}
      {isAuthenticated && (
        <div className="border border-zinc-800 bg-zinc-950/70 p-3 flex items-center gap-3">
          <Coins className="w-5 h-5 text-yellow-500" />
          <div className="text-sm text-zinc-400">Twoje saldo:</div>
          <div className="font-mono font-bold text-white text-lg tabular-nums">{fmt(myTokens)} <span className="text-xs text-zinc-500">GT</span></div>
        </div>
      )}

      {!isAuthenticated && (
        <div className="border border-blue-700 bg-blue-950/30 p-4 text-sm text-blue-200">
          Zaloguj się żeby móc obstawiać zakłady.{" "}
          <Link href="/auth/signin?callbackUrl=/predictions" className="text-white underline">Login</Link>
        </div>
      )}

      {/* Active predictions */}
      <section>
        <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-red-500" />
          Aktywne zakłady ({active.length})
        </h2>
        {active.length === 0 ? (
          <EmptyState
            icon={<Dice5 className="w-6 h-6" />}
            title="Brak aktywnych zakładów"
            message="Streamer doda nowy zakład, gdy będzie hyped 🎲"
          />
        ) : (
          <div className="space-y-4">
            {active.map((p) => (
              <ActivePredictionCard
                key={p.id}
                prediction={p}
                isAuthenticated={isAuthenticated}
                myTokens={myTokens}
                onToast={showToast}
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
            Ostatnie wyniki
          </h2>
          <div className="space-y-2">
            {recent.map((p) => (
              <RecentPredictionRow key={p.id} prediction={p} />
            ))}
          </div>
        </section>
      )}

      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 max-w-md border px-4 py-3 flex items-center gap-3 shadow-2xl",
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

function ActivePredictionCard({
  prediction, isAuthenticated, myTokens, onToast, onSuccess,
}: {
  prediction: ActivePrediction;
  isAuthenticated: boolean;
  myTokens: number;
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
}) {
  const [pickedOption, setPickedOption] = useState<number | null>(prediction.myEntry?.optionIndex ?? null);
  const [wagerInput, setWagerInput] = useState("");
  const [busy, setBusy] = useState(false);

  const isLocked = prediction.status === "locked" || (prediction.closesAt && new Date(prediction.closesAt) < new Date());
  const alreadyWagered = prediction.myEntry !== null;

  async function submit() {
    if (pickedOption === null) { onToast("err", "Wybierz opcję"); return; }
    const wager = parseInt(wagerInput, 10);
    if (!wager || wager < 10) { onToast("err", "Min stawka: 10 GT"); return; }
    if (wager > myTokens) { onToast("err", "Za mało GT"); return; }

    setBusy(true);
    try {
      const res = await fetch(`/api/predictions/${prediction.id}/wager`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionIndex: pickedOption, tokensWagered: wager }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast("err", data.error ?? "Błąd");
      } else {
        onToast("ok", `Obstawiono ${wager} GT. Saldo: ${data.newBalance} GT`);
        setWagerInput("");
        onSuccess();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-zinc-800 bg-zinc-950/70 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <h3 className="text-white font-bold text-base sm:text-lg flex-1">{prediction.question}</h3>
        <div className="text-right shrink-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Pula</div>
          <div className="font-mono font-bold text-yellow-500 text-lg tabular-nums">{fmt(prediction.totalPot)} GT</div>
        </div>
      </div>

      {isLocked && (
        <div className="border border-orange-900 bg-orange-950/20 px-3 py-2 mb-3 text-xs text-orange-200 flex items-center gap-2">
          <Clock className="w-3.5 h-3.5" />
          Zakład zamknięty — czeka na rozstrzygnięcie
        </div>
      )}

      {/* Option list */}
      <div className="space-y-2 mb-3">
        {prediction.options.map((o) => {
          const pct = prediction.totalPot > 0 ? (o.totalWagered / prediction.totalPot) * 100 : 0;
          const isMine = prediction.myEntry?.optionIndex === o.index;
          const isPicked = pickedOption === o.index;
          return (
            <button
              key={o.index}
              onClick={() => !alreadyWagered && !isLocked && setPickedOption(o.index)}
              disabled={alreadyWagered || isLocked || !isAuthenticated}
              className={cn(
                "w-full text-left border bg-black/30 p-3 transition-all relative overflow-hidden",
                isPicked && !alreadyWagered ? "border-red-600 bg-red-950/20" :
                isMine ? "border-green-700 bg-green-950/15" :
                "border-zinc-800",
                !alreadyWagered && !isLocked && isAuthenticated && "hover:border-zinc-600 cursor-pointer",
                (alreadyWagered || isLocked || !isAuthenticated) && "cursor-default",
              )}
            >
              {/* Pot share bar background */}
              <div
                className="absolute inset-y-0 left-0 opacity-15"
                style={{ width: `${pct}%`, background: isMine ? "#10b981" : "#E50914" }}
              />
              <div className="relative flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                    #{o.index + 1}
                  </span>
                  <span className="text-white font-medium text-sm truncate">{o.label}</span>
                  {isMine && (
                    <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-green-700 bg-green-950/40 text-green-300 shrink-0">
                      Twoja
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-xs text-white tabular-nums">{fmt(o.totalWagered)} GT</div>
                  <div className="text-[10px] text-zinc-500">{o.wagerCount} {o.wagerCount === 1 ? "wager" : "wagers"} · {pct.toFixed(0)}%</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Wager form */}
      {isAuthenticated && !alreadyWagered && !isLocked && (
        <div className="border-t border-zinc-800 pt-3 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Stawka:</span>
          <input
            type="number"
            min={10}
            max={myTokens}
            placeholder="GT"
            value={wagerInput}
            onChange={(e) => setWagerInput(e.target.value)}
            className="w-28 border border-zinc-700 bg-black/40 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-red-600"
          />
          <div className="flex gap-1">
            {[100, 500, 1000, 5000].filter((v) => v <= myTokens).map((v) => (
              <button
                key={v}
                onClick={() => setWagerInput(String(v))}
                className="text-[10px] font-mono text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 px-1.5 py-0.5"
              >
                {fmt(v)}
              </button>
            ))}
            {myTokens >= 10 && (
              <button
                onClick={() => setWagerInput(String(myTokens))}
                className="text-[10px] font-mono text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 px-1.5 py-0.5"
              >
                ALL
              </button>
            )}
          </div>
          <button
            onClick={submit}
            disabled={busy || pickedOption === null || !wagerInput}
            className="ml-auto px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-30 flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Coins className="w-3 h-3" />}
            Obstaw
          </button>
        </div>
      )}

      {alreadyWagered && (
        <div className="border-t border-zinc-800 pt-3 text-xs text-zinc-400">
          Obstawiłeś <strong className="text-green-400">{fmt(prediction.myEntry!.tokensWagered)} GT</strong> na opcję #{prediction.myEntry!.optionIndex + 1}. Czekaj na rozstrzygnięcie.
        </div>
      )}
    </div>
  );
}

function RecentPredictionRow({ prediction }: { prediction: RecentPrediction }) {
  const isCancelled = prediction.status === "cancelled";
  const winningLabel =
    prediction.resolvedOptionIndex != null ? prediction.options[prediction.resolvedOptionIndex] : null;

  return (
    <div className="border border-zinc-800 bg-zinc-950/40 p-3 text-sm">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-white truncate flex-1">{prediction.question}</div>
        {isCancelled ? (
          <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-zinc-700 text-zinc-400">CANCELLED</span>
        ) : (
          <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-green-700 bg-green-950/40 text-green-300">RESOLVED</span>
        )}
      </div>
      <div className="text-xs text-zinc-500 flex flex-wrap items-center gap-3">
        {winningLabel && !isCancelled && (
          <span>Wygrana opcja: <strong className="text-green-300">{winningLabel}</strong></span>
        )}
        <span>Pula: <span className="text-zinc-300 font-mono">{fmt(prediction.totalPot)} GT</span></span>
        {prediction.myResult && (
          <span className={cn(
            "font-mono",
            prediction.myResult.won ? "text-green-400" : "text-red-400",
          )}>
            Ty: {prediction.myResult.won ? `+${fmt(prediction.myResult.payout - prediction.myResult.tokensWagered)}` : `-${fmt(prediction.myResult.tokensWagered)}`} GT
          </span>
        )}
      </div>
    </div>
  );
}

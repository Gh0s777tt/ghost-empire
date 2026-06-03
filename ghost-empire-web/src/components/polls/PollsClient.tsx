"use client";
// src/components/polls/PollsClient.tsx
import { useState } from "react";
import { signIn } from "next-auth/react";
import { BarChart3, Check, Loader2, X } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { cn, fmt } from "@/lib/utils";

type Poll = {
  id: string;
  question: string;
  options: string[];
  status: string;
  counts: number[];
  total: number;
  yourVote: number | null;
};

export function PollsClient({
  polls: initial,
  isAuthenticated,
}: {
  polls: Poll[];
  isAuthenticated: boolean;
}) {
  const [polls, setPolls] = useState<Poll[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  async function vote(pollId: string, optionIndex: number) {
    setBusy(pollId);
    try {
      const res = await fetch("/api/polls/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pollId, optionIndex }),
      });
      const d = await res.json();
      if (!res.ok) { setToast({ kind: "err", msg: d.error ?? "Błąd" }); return; }
      setPolls((ps) => ps.map((p) => (p.id === pollId ? { ...p, counts: d.counts, total: d.total, yourVote: d.yourVote } : p)));
      setToast({ kind: "ok", msg: "Głos zapisany!" });
    } catch {
      setToast({ kind: "err", msg: "Błąd sieci" });
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <BarChart3 className="w-6 h-6 text-red-500" />
        <h1 className="font-display text-4xl text-white tracking-wider"
          style={{ textShadow: "2px 0 0 rgba(229,9,20,0.6), -2px 0 0 rgba(139,0,0,0.4)" }}>
          ANKIETY
        </h1>
      </div>
      <p className="text-zinc-500 text-sm">Głosuj w decyzjach społeczności. Możesz zmienić swój głos, dopóki ankieta jest otwarta.</p>

      {polls.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="w-6 h-6" />}
          title="Brak ankiet"
          message="Aktualnie nie ma żadnych ankiet. Zajrzyj później!"
        />
      ) : (
        <div className="space-y-4">
          {polls.map((p) => {
            const open = p.status === "open";
            const voted = p.yourVote != null;
            const showResults = voted || !open || !isAuthenticated;
            const isBusy = busy === p.id;
            return (
              <div key={p.id} className={cn("border bg-zinc-950/70 backdrop-blur-xs p-5", open ? "border-zinc-800" : "border-zinc-900")}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h2 className="text-white font-bold text-base leading-snug">{p.question}</h2>
                  {!open && (
                    <span className="text-[9px] font-mono uppercase tracking-widest px-2 py-1 border border-zinc-700 text-zinc-500 shrink-0">
                      Zamknięta
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {p.options.map((opt, i) => {
                    const count = p.counts[i] ?? 0;
                    const pct = p.total > 0 ? (count / p.total) * 100 : 0;
                    const mine = p.yourVote === i;
                    const clickable = open && isAuthenticated && !isBusy;
                    return (
                      <button
                        key={i}
                        onClick={() => clickable && vote(p.id, i)}
                        disabled={!clickable}
                        className={cn(
                          "relative w-full text-left border overflow-hidden transition-all",
                          mine ? "border-red-500" : "border-zinc-800",
                          clickable ? "hover:border-red-600/60 cursor-pointer" : "cursor-default",
                        )}
                      >
                        {showResults && (
                          <div
                            className={cn("absolute inset-y-0 left-0 transition-all", mine ? "bg-red-600/30" : "bg-zinc-800/50")}
                            style={{ width: `${pct}%` }}
                          />
                        )}
                        <div className="relative flex items-center justify-between gap-2 px-3 py-2.5">
                          <span className="text-sm text-white flex items-center gap-2">
                            {mine && <Check className="w-3.5 h-3.5 text-red-400" />}
                            {opt}
                          </span>
                          {showResults && (
                            <span className="text-[11px] font-mono text-zinc-400 tabular-nums shrink-0">
                              {pct.toFixed(0)}% · {fmt(count)}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mt-3 text-[11px] font-mono text-zinc-600">
                  <span>{fmt(p.total)} głosów</span>
                  {!isAuthenticated && open && (
                    <button onClick={() => signIn()} className="text-red-400 hover:text-red-300 uppercase tracking-widest">
                      Zaloguj, by głosować
                    </button>
                  )}
                  {isAuthenticated && open && voted && <span>Możesz zmienić głos</span>}
                  {isBusy && <Loader2 className="w-3 h-3 animate-spin" />}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div className={cn(
          "fixed bottom-6 right-6 z-50 max-w-md border px-4 py-3 flex items-center gap-3 shadow-2xl",
          toast.kind === "ok" ? "border-green-700 bg-green-950/90 text-green-200" : "border-red-700 bg-red-950/90 text-red-200",
        )}>
          {toast.kind === "ok" ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          <span className="text-sm">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

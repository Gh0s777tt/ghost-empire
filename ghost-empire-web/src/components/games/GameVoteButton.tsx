"use client";
// src/components/games/GameVoteButton.tsx
// One free "play this next" vote per viewer per portal (#audit3). A viewer has a SINGLE
// active vote, so after toggling we router.refresh() to re-pull the server-rendered counts
// + the user's current pick — that keeps every card consistent when the vote moves.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ThumbsUp, Loader2 } from "lucide-react";

export function GameVoteButton({ gameId, voted }: { gameId: string; voted: boolean }) {
  const t = useTranslations("games");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await fetch("/api/games/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: voted ? null : gameId }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={voted}
      className={`mt-1 w-full inline-flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-widest border transition-colors disabled:opacity-50 ${
        voted ? "border-red-600 bg-red-600/20 text-red-300" : "border-zinc-700 text-zinc-400 hover:border-red-600 hover:text-red-300"
      }`}
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
      {voted ? t("voted") : t("vote")}
    </button>
  );
}

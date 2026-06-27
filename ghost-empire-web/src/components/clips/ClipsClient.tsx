"use client";
// src/components/clips/ClipsClient.tsx
// Clip of the Week — the streamer's recent Twitch clips with community voting.
// Anyone can watch + see counts; logged-in users cast one vote per week (changeable).
// Data via /api/clips.
import { useState, useEffect, useCallback } from "react";
import { Loader2, Crown, Film, Eye, Check, ThumbsUp } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import HowItWorks from "@/components/HowItWorks";
import { signIn } from "next-auth/react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { ErrorState } from "@/components/EmptyState";

type Clip = { id: string; title: string; url: string; thumbnailUrl: string; creator: string; views: number; votes: number };
type Data = { week: string; authenticated: boolean; myVote: string | null; leaderId: string | null; clips: Clip[] };

export function ClipsClient({ isAuthenticated }: { isAuthenticated: boolean }) {
  const t = useTranslations("clips");
  const tc = useTranslations("common");
  const nf = useLocale();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(false);
    try { setData(await apiGet<Data>("/api/clips")); }
    catch { setErr(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function vote(clipId: string) {
    if (!isAuthenticated) { void signIn(); return; }
    setBusy(clipId);
    try {
      const r = await apiPost<{ myVote: string; counts: Record<string, number> }>("/api/clips", { clipId });
      setData((d) => d ? {
        ...d,
        myVote: r.myVote,
        clips: d.clips.map((c) => ({ ...c, votes: r.counts[c.id] ?? 0 })),
        leaderId: topId(d.clips.map((c) => ({ id: c.id, votes: r.counts[c.id] ?? 0 }))),
      } : d);
    } catch (e) {
      setToast(e instanceof ApiError ? e.message : t("errGeneric"));
      setTimeout(() => setToast(null), 2800);
    }
    setBusy(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2"><Film className="w-6 h-6 text-red-500" /> {t("title")}</h1>
      <p className="text-zinc-500 text-sm mb-6">{t("subtitle")}</p>
      <div className="mb-6 -mt-3"><HowItWorks>{t("help")}</HowItWorks></div>

      {toast && <div className="mb-4 text-sm px-3 py-2 rounded-lg border border-red-800/60 bg-red-950/30 text-red-300">{toast}</div>}

      {loading ? (
        <div className="text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}</div>
      ) : err ? (
        <ErrorState title={tc("errorTitle")} message={t("errGeneric")} retryLabel={tc("retry")} onRetry={() => { setLoading(true); void load(); }} />
      ) : !data || data.clips.length === 0 ? (
        <div className="border border-zinc-900 bg-black/20 rounded-xl p-8 text-center">
          <Film className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
          <p className="text-zinc-400 text-sm">{t("empty")}</p>
          <p className="text-zinc-600 text-xs mt-1">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.clips.map((c) => {
            const isLeader = c.id === data.leaderId;
            const mine = c.id === data.myVote;
            return (
              <div key={c.id} className={`border rounded-xl overflow-hidden bg-black/30 ${isLeader ? "border-amber-600/70" : "border-zinc-800"}`}>
                <a href={c.url} target="_blank" rel="noreferrer" className="block relative aspect-video bg-zinc-900 group">
                  <img src={c.thumbnailUrl} alt="" className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
                  {isLeader && (
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500 text-black text-[10px] font-bold tracking-widest uppercase">
                      <Crown className="w-3 h-3" /> {t("leader")}
                    </span>
                  )}
                  <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 text-zinc-300 text-[10px] font-mono">
                    <Eye className="w-3 h-3" /> {c.views.toLocaleString(nf)}
                  </span>
                </a>
                <div className="p-3">
                  <div className="text-sm text-white font-semibold truncate" title={c.title}>{c.title}</div>
                  <div className="text-[11px] text-zinc-500 mb-2.5">{t("by", { name: c.creator })}</div>
                  <button
                    onClick={() => void vote(c.id)}
                    disabled={busy !== null}
                    className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold tracking-widest uppercase transition-colors disabled:opacity-50 ${
                      mine ? "bg-emerald-700 text-white" : "border border-zinc-700 text-zinc-200 hover:border-zinc-500"
                    }`}
                  >
                    {busy === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : mine ? <Check className="w-3.5 h-3.5" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                    {mine ? t("voted") : t("voteBtn")} · {c.votes.toLocaleString(nf)}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isAuthenticated && data && data.clips.length > 0 && (
        <p className="text-[11px] text-zinc-600 mt-4 text-center">{t("loginToVote")}</p>
      )}
    </div>
  );
}

/** Id of the clip with the most votes (>0), else null. */
function topId(items: Array<{ id: string; votes: number }>): string | null {
  let best: { id: string; votes: number } | null = null;
  for (const it of items) if (it.votes > 0 && (!best || it.votes > best.votes)) best = it;
  return best?.id ?? null;
}

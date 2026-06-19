"use client";
// src/components/trivia/TriviaClient.tsx
// Trivia/quiz (#523): answer questions for GT, one attempt each. The correct answer
// is only revealed after you answer (the API hides it until then). Data via /api/trivia.
import { useState, useEffect, useCallback } from "react";
import { Loader2, Brain, Check, X, Coins, Trophy } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { signIn } from "next-auth/react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { useTenantBranding } from "@/components/TenantBranding";

type Q = {
  id: string; question: string; options: string[]; reward: number; category: string | null;
  myAnswer: { optionIndex: number; correct: boolean } | null; correctIndex?: number;
};
type Data = { authenticated: boolean; balance: number; questions: Q[] };

export function TriviaClient({ isAuthenticated }: { isAuthenticated: boolean }) {
  const t = useTranslations("trivia");
  const nf = useLocale();
  const { tokenSymbol } = useTenantBranding();
  const sym = tokenSymbol || "GT";
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await apiGet<Data>("/api/trivia")); } catch { /* leave */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 2800); }

  async function answer(q: Q, optionIndex: number) {
    if (!isAuthenticated) { void signIn(); return; }
    if (q.myAnswer || busy) return;
    setBusy(q.id);
    try {
      const r = await apiPost<{ correct: boolean; correctIndex: number; reward: number; newBalance?: number }>("/api/trivia", { questionId: q.id, optionIndex });
      setData((d) => d ? {
        ...d,
        balance: r.newBalance ?? d.balance,
        questions: d.questions.map((x) => x.id === q.id ? { ...x, myAnswer: { optionIndex, correct: r.correct }, correctIndex: r.correctIndex } : x),
      } : d);
      flash(r.correct ? t("correct", { reward: r.reward, sym }) : t("wrong"));
    } catch (e) {
      flash(e instanceof ApiError ? e.message : t("err"));
    }
    setBusy(null);
  }

  const answered = data?.questions.filter((q) => q.myAnswer).length ?? 0;
  const total = data?.questions.length ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Brain className="w-6 h-6 text-red-500" /> {t("title")}</h1>
        {data?.authenticated && (
          <span className="text-sm font-mono text-amber-300 inline-flex items-center gap-1 tabular-nums"><Coins className="w-4 h-4" /> {data.balance.toLocaleString(nf)} {sym}</span>
        )}
      </div>
      <p className="text-zinc-500 text-sm mb-6">{t("subtitle")} {total > 0 && <span className="text-zinc-600">· {answered}/{total}</span>}</p>

      {toast && <div className="mb-4 text-sm px-3 py-2 rounded-lg border border-red-800/60 bg-red-950/30 text-red-200">{toast}</div>}

      {loading ? (
        <div className="text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}</div>
      ) : !data || data.questions.length === 0 ? (
        <div className="border border-zinc-900 bg-black/20 rounded-xl p-8 text-center">
          <Brain className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
          <p className="text-zinc-400 text-sm">{t("empty")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.questions.map((q) => {
            const done = !!q.myAnswer;
            return (
              <div key={q.id} className="border border-zinc-800 bg-black/30 rounded-xl p-4">
                {q.category && <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1">{q.category}</div>}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <p className="text-white font-semibold">{q.question}</p>
                  <span className="text-[11px] font-mono text-amber-300 shrink-0 inline-flex items-center gap-0.5"><Coins className="w-3 h-3" /> {q.reward.toLocaleString(nf)}</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {q.options.map((opt, i) => {
                    const isCorrect = done && q.correctIndex === i;
                    const isMyWrong = done && q.myAnswer?.optionIndex === i && !q.myAnswer.correct;
                    return (
                      <button
                        key={i}
                        onClick={() => void answer(q, i)}
                        disabled={done || busy === q.id}
                        className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors inline-flex items-center gap-2 ${
                          isCorrect ? "border-emerald-600 bg-emerald-950/30 text-emerald-200"
                          : isMyWrong ? "border-red-700 bg-red-950/30 text-red-200"
                          : done ? "border-zinc-800 text-zinc-500"
                          : "border-zinc-700 text-zinc-200 hover:border-red-600 hover:text-white"
                        }`}
                      >
                        {busy === q.id ? <span className="w-4 h-4 shrink-0" /> : isCorrect ? <Check className="w-4 h-4 shrink-0" /> : isMyWrong ? <X className="w-4 h-4 shrink-0" /> : <span className="w-4 h-4 shrink-0 text-zinc-600 text-xs font-mono">{String.fromCharCode(65 + i)}</span>}
                        <span className="flex-1">{opt}</span>
                      </button>
                    );
                  })}
                </div>
                {done && (
                  <div className={`mt-2 text-xs inline-flex items-center gap-1.5 ${q.myAnswer!.correct ? "text-emerald-400" : "text-zinc-500"}`}>
                    {q.myAnswer!.correct ? <><Trophy className="w-3.5 h-3.5" /> {t("answeredCorrect")}</> : t("answeredWrong")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isAuthenticated && data && data.questions.length > 0 && (
        <p className="text-[11px] text-zinc-600 mt-4 text-center">{t("loginToPlay")}</p>
      )}
    </div>
  );
}

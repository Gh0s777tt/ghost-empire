"use client";
// src/components/admin/sections/Trivia.tsx
// Manage the trivia question bank (#523): question + 2–6 options + the correct one +
// GT reward. Viewers answer at /trivia. Data via /api/admin/trivia.
import { useState, useEffect, useCallback } from "react";
import { Brain, Loader2, Trash2, Plus, Eye, EyeOff, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type Question = { id: string; question: string; options: string[]; correctIndex: number; reward: number; category: string | null; active: boolean; answers: number };

export function TriviaManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.trivia");
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<Question[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // create form
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [correct, setCorrect] = useState(0);
  const [reward, setReward] = useState("100");
  const [category, setCategory] = useState("");

  const load = useCallback(async () => {
    try { setList((await apiGet<{ questions: Question[] }>("/api/admin/trivia")).questions); }
    catch { /* keep */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function call(action: string, payload: Record<string, unknown>): Promise<boolean> {
    try { await apiPost("/api/admin/trivia", { action, ...payload }); return true; }
    catch (e) { onToast("err", e instanceof ApiError ? e.message : t("err")); return false; }
  }

  async function create() {
    setBusy("create");
    if (await call("create", { question: question.trim(), options: options.map((o) => o.trim()), correctIndex: correct, reward: +reward || 0, category: category.trim() })) {
      onToast("ok", t("created"));
      setQuestion(""); setOptions(["", ""]); setCorrect(0); setReward("100"); setCategory("");
      await load();
    }
    setBusy(null);
  }
  async function toggle(q: Question) { setBusy(q.id); if (await call("update", { id: q.id, active: !q.active })) await load(); setBusy(null); }
  async function remove(q: Question) {
    if (!confirm(t("deleteConfirm"))) return;
    setBusy(q.id); if (await call("delete", { id: q.id })) { onToast("ok", t("deleted")); await load(); } setBusy(null);
  }

  const setOpt = (i: number, v: string) => setOptions((o) => o.map((x, j) => (j === i ? v : x)));
  const addOpt = () => setOptions((o) => (o.length < 6 ? [...o, ""] : o));
  const removeOpt = (i: number) => setOptions((o) => {
    if (o.length <= 2) return o;
    const next = o.filter((_, j) => j !== i);
    if (correct >= next.length) setCorrect(next.length - 1);
    return next;
  });
  const canCreate = question.trim() && options.filter((o) => o.trim()).length >= 2;

  return (
    <SectionCard title={t("title")} icon={Brain}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro")}</p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : (
        <div className="space-y-2 mb-4">
          {list.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">{t("empty")}</div>
          ) : list.map((q) => (
            <div key={q.id} className={`border p-2.5 ${q.active ? "border-zinc-800 bg-black/30" : "border-zinc-900 bg-black/20 opacity-60"}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white">{q.question}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    {q.options.map((o, i) => <span key={i} className={i === q.correctIndex ? "text-emerald-400" : ""}>{i > 0 && " · "}{o}</span>)}
                  </div>
                  <div className="text-[10px] text-zinc-600 font-mono mt-0.5">{q.reward} GT · {t("answersCount", { n: q.answers })}{q.category ? ` · ${q.category}` : ""}</div>
                </div>
                <button onClick={() => toggle(q)} disabled={busy === q.id} title={q.active ? t("disable") : t("enable")} className="shrink-0 text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center">{q.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}</button>
                <button onClick={() => remove(q)} disabled={busy === q.id} title={t("deleteTitle")} className="shrink-0 text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-6 h-6 flex items-center justify-center"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border border-zinc-800 bg-black/30 p-3 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("addTitle")}</div>
        <input value={question} maxLength={500} placeholder={t("questionPh")} onChange={(e) => setQuestion(e.target.value)} className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
        <div className="space-y-1.5">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <button type="button" onClick={() => setCorrect(i)} title={t("markCorrect")} className={`shrink-0 w-6 h-6 flex items-center justify-center border rounded-full ${correct === i ? "border-emerald-600 text-emerald-400" : "border-zinc-700 text-zinc-600 hover:text-white"}`}>{correct === i ? <Check className="w-3 h-3" /> : <span className="text-[10px] font-mono">{String.fromCharCode(65 + i)}</span>}</button>
              <input value={o} maxLength={200} placeholder={t("optionPh", { n: i + 1 })} onChange={(e) => setOpt(i, e.target.value)} className="flex-1 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
              {options.length > 2 && <button type="button" onClick={() => removeOpt(i)} className="shrink-0 text-zinc-600 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          {options.length < 6 && <button type="button" onClick={addOpt} className="text-[11px] text-zinc-400 hover:text-white inline-flex items-center gap-1"><Plus className="w-3 h-3" /> {t("addOption")}</button>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={reward} inputMode="numeric" placeholder="100" onChange={(e) => setReward(e.target.value.replace(/[^0-9]/g, ""))} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono tabular-nums outline-hidden focus:border-red-600" />
          <input value={category} maxLength={60} placeholder={t("categoryPh")} onChange={(e) => setCategory(e.target.value)} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
        </div>
        <button onClick={() => void create()} disabled={busy === "create" || !canCreate} className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy === "create" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} {t("addBtn")}
        </button>
      </div>
    </SectionCard>
  );
}

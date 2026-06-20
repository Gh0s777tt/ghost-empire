"use client";
// src/components/search/SearchClient.tsx
// Semantic search box (#554): submit a query → /api/search/semantic ranks the portal's
// content by meaning. Degrades to a clear "not configured" note when AI is dormant.
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Search, Loader2, Sparkles } from "lucide-react";
import { apiPost } from "@/lib/api-client";
import { EmptyState } from "@/components/EmptyState";

type Result = { title: string; type: "page" | "achievement" | "shop"; href: string; score: number };

export function SearchClient() {
  const t = useTranslations("search");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [dormant, setDormant] = useState(false);

  async function run() {
    const query = q.trim();
    if (query.length < 3 || busy) return;
    setBusy(true);
    setDormant(false);
    try {
      const r = await apiPost<{ results: Result[]; dormant: boolean }>("/api/search/semantic", { q: query });
      setResults(r.results);
      setDormant(!!r.dormant);
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Sparkles className="w-6 h-6 text-amber-400" /> {t("title")}</h1>
      <p className="text-zinc-500 text-sm mt-1 mb-5">{t("subtitle")}</p>

      <form onSubmit={(e) => { e.preventDefault(); void run(); }} className="flex gap-2 mb-5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("placeholder")}
          autoFocus
          className="flex-1 border border-zinc-700 bg-black/40 px-3 py-2 text-sm text-white outline-hidden focus:border-red-600 rounded-lg"
        />
        <button type="submit" disabled={busy || q.trim().length < 3} className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-xs font-bold tracking-widest uppercase rounded-lg disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} {t("go")}
        </button>
      </form>

      {dormant && <div className="text-xs text-zinc-400 border border-zinc-800 bg-black/30 rounded-lg px-3 py-3">{t("dormant")}</div>}

      {results && !dormant && (
        results.length === 0 ? (
          <EmptyState icon={<Search className="w-7 h-7" />} title={t("empty")} />
        ) : (
          <div className="space-y-1.5">
            {results.map((r, i) => (
              <button key={i} onClick={() => router.push(r.href)} className="w-full text-left flex items-center gap-2.5 border border-zinc-800 bg-black/30 hover:border-red-700 hover:bg-zinc-900 rounded-lg px-3 py-2.5 transition-colors">
                <Sparkles className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
                <span className="flex-1 text-sm text-zinc-200 truncate">{r.title}</span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 shrink-0">{t(`type_${r.type}`)}</span>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}

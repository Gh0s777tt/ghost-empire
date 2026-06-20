"use client";
// src/components/collectibles/CollectiblesClient.tsx
// Collection grid + GT pack opening (#551). Cards you own show in full colour with a
// ×qty badge; ones you don't are dimmed silhouettes. Opening a pack reveals the card.
import { useState, useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Loader2, Package, Sparkles } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api-client";
import { useTenantBranding } from "@/components/TenantBranding";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { RARITY_COLOR, normalizeRarity } from "@/lib/collectibles";

type Card = { id: string; name: string; description: string | null; rarity: string; emoji: string | null; imageUrl: string | null; qty: number };
type Data = { cards: Card[]; balance: number; packPrice: number; loggedIn: boolean };
type Reveal = { id: string; name: string; rarity: string; emoji: string | null; imageUrl: string | null };

export function CollectiblesClient() {
  const t = useTranslations("collectibles");
  const tc = useTranslations("common");
  const nf = useLocale();
  const { tokenSymbol } = useTenantBranding();
  const sym = tokenSymbol || "GT";
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Auto-dismissing error toast (replaces the old sticky amber banner, matches the
  // marketplace pattern). Success feedback is the card reveal animation below. #audit-v2
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showErr = (text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setMsg(text);
    toastTimer.current = setTimeout(() => setMsg(null), 3200);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  async function load() {
    try { setData(await apiGet<Data>("/api/collectibles")); } catch { /* keep */ } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function openPack() {
    setOpening(true); setMsg(null); setReveal(null);
    try {
      const r = await apiPost<{ ok: boolean; reason?: string; card?: Reveal; balance?: number }>("/api/collectibles/open-pack", {});
      if (r.ok && r.card) {
        const card = r.card;
        setReveal(card);
        setData((d) => (d ? { ...d, balance: r.balance ?? d.balance, cards: d.cards.map((c) => (c.id === card.id ? { ...c, qty: c.qty + 1 } : c)) } : d));
      } else {
        showErr(t(`err_${r.reason ?? "error"}`));
      }
    } catch {
      showErr(t("err_error"));
    } finally {
      setOpening(false);
    }
  }

  if (loading) return <div className="text-zinc-500 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}</div>;
  if (!data) return <ErrorState title={tc("errorTitle")} message={t("err_error")} retryLabel={tc("retry")} onRetry={() => { setLoading(true); void load(); }} />;

  const owned = data.cards.filter((c) => c.qty > 0).length;
  const canOpen = data.loggedIn && data.cards.length > 0 && data.balance >= data.packPrice;

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Sparkles className="w-6 h-6 text-amber-400" /> {t("title")}</h1>
        <p className="text-zinc-500 text-sm mt-1">{t("subtitle")}</p>
      </header>

      {data.cards.length === 0 ? (
        <EmptyState icon={<Package className="w-7 h-7" />} title={t("empty")} />
      ) : (
        <>
          {/* Pack opener */}
          <div className="border border-zinc-800 bg-black/30 rounded-xl p-4 mb-5 flex flex-wrap items-center gap-3">
            <Package className="w-8 h-8 text-amber-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-white font-semibold">{t("packTitle")}</div>
              <div className="text-xs text-zinc-500">{t("collected", { owned, total: data.cards.length })}{data.loggedIn ? ` · ${t("balance", { n: data.balance.toLocaleString(nf), sym })}` : ""}</div>
            </div>
            <button
              onClick={() => void openPack()}
              disabled={!canOpen || opening}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black text-xs font-bold tracking-widest uppercase rounded disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
            >
              {opening ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5" />} {t("openPack", { price: data.packPrice.toLocaleString(nf), sym })}
            </button>
          </div>

          {msg && <div role="alert" aria-live="assertive" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-semibold shadow-lg border bg-red-950/90 border-red-600 text-red-200">{msg}</div>}

          {reveal && (
            <div className="mb-5 flex flex-col items-center gap-2 border-2 rounded-xl p-5" style={{ borderColor: RARITY_COLOR[normalizeRarity(reveal.rarity)], background: `${RARITY_COLOR[normalizeRarity(reveal.rarity)]}14`, animation: "gerevealin 420ms cubic-bezier(0.22,1,0.36,1)" }}>
              <div className="text-[10px] uppercase tracking-widest text-zinc-400">{t("youGot")}</div>
              <div className="text-5xl">{reveal.imageUrl ? <img src={reveal.imageUrl} alt="" className="w-20 h-20 object-contain" /> : reveal.emoji || "🃏"}</div>
              <div className="text-lg font-bold text-white">{reveal.name}</div>
              <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: RARITY_COLOR[normalizeRarity(reveal.rarity)] }}>{t(`rarity_${normalizeRarity(reveal.rarity)}`)}</div>
              <style>{`@keyframes gerevealin { from { opacity:0; transform: scale(0.9) } to { opacity:1; transform:none } }`}</style>
            </div>
          )}

          {/* Collection grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {data.cards.map((c) => {
              const rc = RARITY_COLOR[normalizeRarity(c.rarity)];
              const have = c.qty > 0;
              return (
                <div key={c.id} className={`relative border rounded-xl p-3 flex flex-col items-center text-center transition-opacity ${have ? "bg-black/40" : "bg-black/20 opacity-50"}`} style={{ borderColor: have ? `${rc}88` : "#27272a" }}>
                  {c.qty > 1 && <span className="absolute top-1.5 right-1.5 text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-black/70 text-white border border-zinc-700">×{c.qty}</span>}
                  <div className="text-4xl mb-1.5 h-12 flex items-center justify-center">{have ? (c.imageUrl ? <img src={c.imageUrl} alt="" className="w-12 h-12 object-contain" /> : c.emoji || "🃏") : "❔"}</div>
                  <div className="text-xs font-semibold text-white truncate w-full">{have ? c.name : "???"}</div>
                  <div className="text-[9px] font-mono uppercase tracking-widest mt-0.5" style={{ color: have ? rc : "#52525b" }}>{t(`rarity_${normalizeRarity(c.rarity)}`)}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

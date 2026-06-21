"use client";
// src/components/market/MarketClient.tsx
// P2P card marketplace UI (#552): Browse + buy, Sell (list an owned card), My listings
// (cancel). All money/card moves go through the atomic /api/market POST actions.
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Loader2, Store, Tag, X, ShoppingCart } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api-client";
import { useTenantBranding } from "@/components/TenantBranding";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { RARITY_COLOR, normalizeRarity } from "@/lib/collectibles";
import { sellerProceeds } from "@/lib/market";

type Card = { id: string; name: string; rarity: string; emoji: string | null; imageUrl: string | null };
type Listing = { id: string; price: number; seller: string; sellerId: string; card: Card };
type MyListing = { id: string; price: number; card: Card };
type MyCard = { qty: number; card: Card };
type Data = { items: Listing[]; myListings: MyListing[]; myCards: MyCard[]; balance: number; loggedIn: boolean; currentUserId: string | null };

function Face({ card }: { card: Card }) {
  return card.imageUrl ? <img src={card.imageUrl} alt="" className="w-10 h-10 object-contain" /> : <span className="text-3xl leading-none">{card.emoji || "🃏"}</span>;
}

export function MarketClient() {
  const t = useTranslations("market");
  const tc = useTranslations("common");
  const nf = useLocale();
  const { tokenSymbol } = useTenantBranding();
  const sym = tokenSymbol || "GT";
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"browse" | "sell" | "mine">("browse");
  const [busy, setBusy] = useState<string | null>(null);
  // Auto-dismissing toast (emerald = success, red = error) replaces the old amber
  // banner so buy/list/cancel get a clear, non-sticky confirmation. #audit-UX
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sellCard, setSellCard] = useState("");
  const [sellPrice, setSellPrice] = useState("");

  const showToast = useCallback((kind: "ok" | "err", text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ kind, text });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const load = useCallback(async () => {
    try { setData(await apiGet<Data>("/api/market")); } catch { /* keep */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(key: string, action: string, payload: Record<string, unknown>, okMsg?: string): Promise<boolean> {
    setBusy(key);
    try {
      const r = await apiPost<{ ok: boolean; reason?: string }>("/api/market", { action, ...payload });
      if (!r.ok) { showToast("err", t(`err_${r.reason ?? "error"}`)); return false; }
      await load();
      if (okMsg) showToast("ok", okMsg);
      return true;
    } catch { showToast("err", t("err_error")); return false; } finally { setBusy(null); }
  }

  function buy(l: Listing) {
    if (!window.confirm(t("confirmBuy", { name: l.card.name, price: l.price.toLocaleString(nf), sym }))) return;
    void act(`buy-${l.id}`, "buy", { id: l.id }, t("bought"));
  }

  async function listCard() {
    if (!sellCard || !(+sellPrice > 0)) return;
    if (await act("list", "list", { collectibleId: sellCard, price: +sellPrice }, t("listed"))) { setSellCard(""); setSellPrice(""); setTab("mine"); }
  }

  if (loading) return <div className="text-zinc-500 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}</div>;
  if (!data) return <ErrorState title={tc("errorTitle")} message={t("err_error")} retryLabel={tc("retry")} onRetry={() => { setLoading(true); void load(); }} />;

  const tabs: { id: typeof tab; label: string }[] = [
    { id: "browse", label: t("tabBrowse") },
    { id: "sell", label: t("tabSell") },
    { id: "mine", label: t("tabMine") },
  ];

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Store className="w-6 h-6 text-amber-400" /> {t("title")}</h1>
        {data.loggedIn && <span className="text-xs font-mono text-zinc-400 border border-zinc-800 rounded px-2 py-1">{data.balance.toLocaleString(nf)} {sym}</span>}
      </header>

      <div className="flex items-center gap-1.5 mb-4">
        {tabs.map((x) => (
          <button key={x.id} onClick={() => setTab(x.id)} className={`px-3 py-1.5 text-xs border rounded ${tab === x.id ? "border-red-600 bg-red-950/40 text-white" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"}`}>{x.label}</button>
        ))}
      </div>

      {!data.loggedIn && <div className="mb-4 text-xs text-zinc-500">{t("signIn")}</div>}

      {tab === "browse" && (
        data.items.length === 0 ? <EmptyState icon={<Store className="w-7 h-7" />} title={t("empty")} /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {data.items.map((l) => {
              const rc = RARITY_COLOR[normalizeRarity(l.card.rarity)];
              const own = l.sellerId === data.currentUserId;
              const poor = data.balance < l.price;
              return (
                <div key={l.id} className="border rounded-xl p-3 flex flex-col items-center text-center bg-black/40" style={{ borderColor: `${rc}66` }}>
                  <div className="h-11 flex items-center justify-center mb-1"><Face card={l.card} /></div>
                  <div className="text-xs font-semibold text-white truncate w-full">{l.card.name}</div>
                  <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: rc }}>{t(`rarity_${normalizeRarity(l.card.rarity)}`)}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5 truncate w-full">{t("by", { name: l.seller })}</div>
                  <div className="text-sm font-bold text-amber-300 font-mono mt-1">{l.price.toLocaleString(nf)} {sym}</div>
                  <button
                    onClick={() => buy(l)}
                    disabled={!data.loggedIn || own || poor || busy === `buy-${l.id}`}
                    className="mt-2 w-full px-2 py-1.5 bg-amber-600 hover:bg-amber-500 text-black text-[11px] font-bold uppercase tracking-wide rounded disabled:opacity-40 inline-flex items-center justify-center gap-1"
                  >
                    {busy === `buy-${l.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShoppingCart className="w-3 h-3" />} {own ? t("yours") : poor ? t("poor") : t("buy")}
                  </button>
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === "sell" && (
        !data.loggedIn ? <EmptyState icon={<Store className="w-7 h-7" />} title={t("empty")} /> : data.myCards.length === 0 ? (
          <EmptyState icon={<Tag className="w-7 h-7" />} title={t("noCards")} />
        ) : (
          <div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-4">
              {data.myCards.map((c) => {
                const rc = RARITY_COLOR[normalizeRarity(c.card.rarity)];
                const active = sellCard === c.card.id;
                return (
                  <button key={c.card.id} onClick={() => setSellCard(c.card.id)} className={`relative border rounded-lg p-2 flex flex-col items-center ${active ? "border-red-500 bg-red-500/10" : "border-zinc-800 bg-black/30 hover:border-zinc-600"}`} style={active ? {} : { borderColor: `${rc}44` }}>
                    {c.qty > 1 && <span className="absolute top-1 right-1 text-[9px] font-bold font-mono px-1 rounded bg-black/70 text-white">×{c.qty}</span>}
                    <Face card={c.card} />
                    <span className="text-[10px] text-zinc-300 truncate w-full mt-1">{c.card.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 border border-zinc-800 bg-black/30 rounded-xl p-3">
              <input value={sellPrice} inputMode="numeric" placeholder={t("pricePh", { sym })} onChange={(e) => setSellPrice(e.target.value.replace(/[^0-9]/g, ""))} className="flex-1 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600" />
              <span className="text-[10px] text-zinc-500 shrink-0">{+sellPrice > 0 ? t("youGet", { n: sellerProceeds(+sellPrice).toLocaleString(nf), sym }) : ""}</span>
              <button onClick={() => void listCard()} disabled={!sellCard || !(+sellPrice > 0) || busy === "list"} className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase rounded disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0">
                {busy === "list" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Tag className="w-3 h-3" />} {t("listBtn")}
              </button>
            </div>
          </div>
        )
      )}

      {tab === "mine" && (
        !data.loggedIn || data.myListings.length === 0 ? (
          <EmptyState icon={<Tag className="w-7 h-7" />} title={t("noListings")} />
        ) : (
          <div className="space-y-2">
            {data.myListings.map((l) => (
              <div key={l.id} className="flex items-center gap-3 border border-zinc-800 bg-black/30 rounded-lg p-2.5">
                <Face card={l.card} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{l.card.name}</div>
                  <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: RARITY_COLOR[normalizeRarity(l.card.rarity)] }}>{t(`rarity_${normalizeRarity(l.card.rarity)}`)}</div>
                </div>
                <span className="text-sm font-bold text-amber-300 font-mono shrink-0">{l.price.toLocaleString(nf)} {sym}</span>
                <button onClick={() => void act(`cancel-${l.id}`, "cancel", { id: l.id }, t("cancelled"))} disabled={busy === `cancel-${l.id}`} title={t("cancel")} aria-label={t("cancel")} className="text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-10 h-10 flex items-center justify-center shrink-0">
                  {busy === `cancel-${l.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-semibold shadow-lg border animate-[getoastin_180ms_ease-out] ${toast.kind === "ok" ? "bg-emerald-950/90 border-emerald-600 text-emerald-200" : "bg-red-950/90 border-red-600 text-red-200"}`}
        >
          {toast.text}
          <style>{`@keyframes getoastin { from { opacity:0; transform: translate(-50%, 8px) } to { opacity:1; transform: translate(-50%, 0) } }`}</style>
        </div>
      )}
    </div>
  );
}

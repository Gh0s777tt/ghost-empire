"use client";
// src/components/shop/ShopClient.tsx
import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { ShoppingBag, Flame, Lock, Check, X, Loader2 } from "lucide-react";
import { fmt, cn } from "@/lib/utils";
import type { ShopItem } from "@prisma/client";

type UserContext = {
  tokens: number;
  level: number;
  subTiers: string[];
  maxSubMonths: number;
  achievements: string[]; // earned achievement codes
} | null;

const CATEGORIES = [
  { id: "all",        label: "WSZYSTKO",      emoji: "🌍" },
  { id: "games",      label: "GRY",           emoji: "🎮" },
  { id: "skins",      label: "SKINY",         emoji: "🎯" },
  { id: "subs",       label: "SUBY",          emoji: "💜" },
  { id: "cosmetic",   label: "COSMETIC",      emoji: "🎨" },
  { id: "experience", label: "EXPERIENCE",    emoji: "🎙️" },
] as const;

const TIER_RANK: Record<string, number> = { T1: 1, T2: 2, T3: 3, Prime: 1 };

type BuyResponse =
  | { ok: true; itemName: string; spent: number; newBalance: number; deliveryPending: boolean }
  | { error: string };

export function ShopClient({
  items,
  userContext,
  isAuthenticated,
  achievementNames = {},
}: {
  items: ShopItem[];
  userContext: UserContext;
  isAuthenticated: boolean;
  achievementNames?: Record<string, string>;
}) {
  const router = useRouter();
  const { update: refreshSession } = useSession();
  const [category, setCategory] = useState<string>("all");
  const [pending, startTransition] = useTransition();
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<ShopItem | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const visible = useMemo(
    () => (category === "all" ? items : items.filter((i) => i.category === category)),
    [items, category],
  );

  const balance = userContext?.tokens ?? 0;

  function meetsRequirements(item: ShopItem): { ok: boolean; reason?: string } {
    if (!userContext) return { ok: true };

    if (item.requiresMinLevel && userContext.level < item.requiresMinLevel) {
      return { ok: false, reason: `Wymagany LVL ${item.requiresMinLevel}` };
    }
    if (item.requiresSubTier === "DUAL") {
      if (userContext.subTiers.length < 2) {
        return { ok: false, reason: "Dual Supporter only" };
      }
    } else if (item.requiresSubTier) {
      const required = TIER_RANK[item.requiresSubTier] ?? 0;
      const ok = userContext.subTiers.some((t) => (TIER_RANK[t] ?? 0) >= required);
      if (!ok) return { ok: false, reason: `Wymagany ${item.requiresSubTier}` };
    }
    if (item.requiresMinMonths && userContext.maxSubMonths < item.requiresMinMonths) {
      return { ok: false, reason: `${item.requiresMinMonths}+ mc subskrypcji` };
    }
    if (item.requiresAchievement && !userContext.achievements.includes(item.requiresAchievement)) {
      return { ok: false, reason: `🔒 ${achievementNames[item.requiresAchievement] ?? "osiągnięcie"}` };
    }
    return { ok: true };
  }

  async function buy(item: ShopItem) {
    setBusyItem(item.id);
    try {
      const res = await fetch("/api/shop/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const data: BuyResponse = await res.json();
      if (!res.ok || "error" in data) {
        const err = "error" in data ? data.error : "Błąd zakupu";
        setToast({ kind: "err", msg: err });
        return;
      }
      setToast({
        kind: "ok",
        msg: data.deliveryPending
          ? `Kupione: ${data.itemName} — czeka na dostawę (ticket Discord)`
          : `Kupione: ${data.itemName} — gotowe!`,
      });
      await refreshSession();
      startTransition(() => router.refresh());
    } finally {
      setBusyItem(null);
      setConfirmItem(null);
      setTimeout(() => setToast(null), 4500);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <ShoppingBag className="w-6 h-6 text-red-500" />
            <h1
              className="font-display text-4xl text-white tracking-wider"
              style={{ textShadow: "2px 0 0 rgba(229,9,20,0.6), -2px 0 0 rgba(139,0,0,0.4)" }}
            >
              SKLEP
            </h1>
          </div>
          <p className="text-zinc-500 text-sm">
            Wymień Ghost Tokens na klucze, skiny, suby i nagrody niedostępne nigdzie indziej.
          </p>
        </div>

        {isAuthenticated && userContext && (
          <div className="flex items-center gap-3 border border-zinc-800 bg-zinc-950/80 px-4 py-2.5">
            <span className="text-xl">👻</span>
            <div className="leading-tight">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                Twój balans
              </div>
              <div className="font-mono text-xl font-bold text-white tabular-nums">
                {fmt(balance)} <span className="text-zinc-500 text-xs">GT</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const active = category === c.id;
          const count = c.id === "all" ? items.length : items.filter((i) => i.category === c.id).length;
          return (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                "px-3 py-2 border text-[11px] font-semibold tracking-widest uppercase flex items-center gap-2 transition-all",
                active
                  ? "border-red-500 bg-red-600/15 text-red-300"
                  : "border-zinc-800 bg-zinc-950/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700",
              )}
            >
              <span>{c.emoji}</span>
              <span>{c.label}</span>
              <span className="text-zinc-600 font-mono">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Items grid */}
      {visible.length === 0 ? (
        <div className="border border-zinc-800 bg-zinc-950/50 p-12 text-center">
          <p className="text-zinc-500">Brak itemów w tej kategorii.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((item) => {
            const req = meetsRequirements(item);
            const affordable = balance >= item.price;
            const inStock = item.stock !== 0;
            const canBuy = isAuthenticated && req.ok && affordable && inStock;
            const isBusy = busyItem === item.id || pending;

            return (
              <div
                key={item.id}
                className={cn(
                  "relative border bg-zinc-950/70 backdrop-blur-sm p-5 flex flex-col transition-all",
                  canBuy ? "border-zinc-800 hover:border-red-600/50" : "border-zinc-900",
                )}
                style={{
                  clipPath:
                    "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
                }}
              >
                {/* Top badges */}
                <div className="absolute top-3 right-3 flex gap-1.5 z-10">
                  {item.hot && (
                    <span className="bg-red-600 text-white text-[9px] font-bold tracking-widest uppercase px-2 py-1 flex items-center gap-1">
                      <Flame className="w-2.5 h-2.5" /> HOT
                    </span>
                  )}
                  {item.stock !== -1 && (
                    <span
                      className={cn(
                        "text-[9px] font-mono tracking-widest uppercase px-2 py-1 border",
                        item.stock === 0
                          ? "border-zinc-700 bg-zinc-900 text-zinc-600"
                          : item.stock <= 2
                            ? "border-orange-700 bg-orange-950/40 text-orange-300"
                            : "border-zinc-700 bg-zinc-950 text-zinc-400",
                      )}
                    >
                      {item.stock === 0 ? "BRAK" : `${item.stock}/${item.totalStock}`}
                    </span>
                  )}
                </div>

                {/* Icon + category */}
                <div className="flex items-start gap-3 mb-3">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="w-12 h-12 object-cover border border-zinc-800 flex-shrink-0" />
                  ) : (
                    <div className="text-4xl flex-shrink-0">{item.imageEmoji ?? "🎁"}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 mb-0.5">
                      {item.category}
                    </div>
                    <h3 className="text-white font-bold text-sm leading-tight">{item.name}</h3>
                  </div>
                </div>

                {/* Description */}
                <p className="text-zinc-500 text-xs leading-relaxed flex-1 mb-4 line-clamp-4">
                  {item.description}
                </p>

                {/* Requirements */}
                {(item.requiresSubTier || item.requiresMinLevel || item.requiresMinMonths || item.requiresAchievement) && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {item.requiresSubTier && (
                      <span className="text-[9px] font-mono tracking-widest uppercase px-2 py-1 border border-purple-900 bg-purple-950/30 text-purple-300 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        {item.requiresSubTier}
                      </span>
                    )}
                    {item.requiresMinLevel && (
                      <span className="text-[9px] font-mono tracking-widest uppercase px-2 py-1 border border-blue-900 bg-blue-950/30 text-blue-300">
                        LVL {item.requiresMinLevel}+
                      </span>
                    )}
                    {item.requiresMinMonths && (
                      <span className="text-[9px] font-mono tracking-widest uppercase px-2 py-1 border border-emerald-900 bg-emerald-950/30 text-emerald-300">
                        {item.requiresMinMonths}+ mc
                      </span>
                    )}
                    {item.requiresAchievement && (
                      <span className="text-[9px] font-mono tracking-widest uppercase px-2 py-1 border border-amber-900 bg-amber-950/30 text-amber-300 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        {achievementNames[item.requiresAchievement] ?? "Osiągnięcie"}
                      </span>
                    )}
                  </div>
                )}

                {/* Price + buy */}
                <div className="flex items-center justify-between gap-3 mt-auto pt-3 border-t border-zinc-900">
                  <div>
                    <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">
                      Cena
                    </div>
                    <div className="font-mono text-xl font-bold text-white tabular-nums">
                      {fmt(item.price)} <span className="text-zinc-500 text-xs">GT</span>
                    </div>
                  </div>

                  {!isAuthenticated ? (
                    <button
                      onClick={() => signIn()}
                      className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-bold tracking-widest uppercase transition-all"
                    >
                      Zaloguj
                    </button>
                  ) : !inStock ? (
                    <button
                      disabled
                      className="px-3 py-2 bg-zinc-900 border border-zinc-800 text-zinc-600 text-[10px] font-bold tracking-widest uppercase cursor-not-allowed"
                    >
                      Brak
                    </button>
                  ) : !req.ok ? (
                    <button
                      disabled
                      title={req.reason}
                      className="px-3 py-2 bg-purple-950/30 border border-purple-900 text-purple-400 text-[10px] font-bold tracking-widest uppercase cursor-not-allowed"
                    >
                      <Lock className="w-3 h-3 inline" /> {req.reason}
                    </button>
                  ) : !affordable ? (
                    <button
                      disabled
                      className="px-3 py-2 bg-zinc-900 border border-zinc-800 text-zinc-500 text-[10px] font-bold tracking-widest uppercase cursor-not-allowed"
                    >
                      Za mało GT
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmItem(item)}
                      disabled={isBusy}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold tracking-widest uppercase transition-all disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Kup"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm modal */}
      {confirmItem && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => busyItem === null && setConfirmItem(null)}
        >
          <div
            className="bg-zinc-950 border border-red-900/50 max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
            style={{
              clipPath:
                "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))",
            }}
          >
            <div className="flex items-start gap-4 mb-5">
              {confirmItem.imageUrl ? (
                <img src={confirmItem.imageUrl} alt="" className="w-16 h-16 object-cover border border-zinc-800 flex-shrink-0" />
              ) : (
                <div className="text-5xl">{confirmItem.imageEmoji ?? "🎁"}</div>
              )}
              <div>
                <h3 className="text-white font-bold mb-1">{confirmItem.name}</h3>
                <p className="text-zinc-500 text-xs leading-relaxed">{confirmItem.description}</p>
              </div>
            </div>

            <div className="border border-zinc-800 bg-black/40 p-3 mb-5 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-zinc-500">CENA</span>
                <span className="text-white">{fmt(confirmItem.price)} GT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">TWÓJ BALANS</span>
                <span className="text-white">{fmt(balance)} GT</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-zinc-800">
                <span className="text-zinc-500">PO ZAKUPIE</span>
                <span className="text-red-400 font-bold">
                  {fmt(Math.max(0, balance - confirmItem.price))} GT
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setConfirmItem(null)}
                disabled={busyItem === confirmItem.id}
                className="flex-1 px-4 py-2.5 border border-zinc-800 hover:border-zinc-700 text-zinc-400 text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50"
              >
                Anuluj
              </button>
              <button
                onClick={() => buy(confirmItem)}
                disabled={busyItem === confirmItem.id}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busyItem === confirmItem.id ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Kupowanie...
                  </>
                ) : (
                  "Potwierdź zakup"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
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

"use client";
// src/components/premium/PremiumClient.tsx
// Public "Go Premium" pricing page (#744): Free vs Premium comparison, a currency
// switcher (PLN/EUR/USD — backed by Stripe multi-currency prices), three billing
// periods (1/3/12 mo) and a 14-day free trial. The CTA starts a Stripe Checkout for
// the caller's own portal; 401 → sign in, 409 (no portal yet) → onboarding.
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { signIn } from "next-auth/react";
import { useRouter } from "@/i18n/navigation";
import { Sparkles, Check, Crown, Loader2, ShieldCheck } from "lucide-react";
import { apiPost, ApiError } from "@/lib/api-client";
import {
  PREMIUM_MONTHS, PREMIUM_PRICE, BILLING_CURRENCIES, type BillingCurrency,
  TRIAL_DAYS, formatMoney, perMonthMinor, savingsPercent, currencyForLocale,
} from "@/lib/premium";

const FREE_FEATURES = ["fEconomy", "fShop", "fRanking", "fEvents", "fProfiles"] as const;
const PREMIUM_FEATURES = ["pCasino", "pWheel", "pPredictions", "pOverlays", "pSongs", "pAi", "pBranding", "pWebhooks", "pFuture"] as const;
const CURRENCY_LABEL: Record<BillingCurrency, string> = { pln: "PLN zł", eur: "EUR €", usd: "USD $" };

export function PremiumClient() {
  const t = useTranslations("premium");
  const locale = useLocale();
  const router = useRouter();
  const [currency, setCurrency] = useState<BillingCurrency>(currencyForLocale(locale));
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(months: number) {
    if (busy) return;
    setBusy(months);
    setError(null);
    try {
      const res = await apiPost<{ ok: true; url: string }>("/api/billing/checkout", { plan: "elite", months, currency });
      // eslint-disable-next-line react-hooks/immutability -- navigation in a click handler (not render) is intentional (#733)
      window.location.href = res.url; // Stripe Checkout (external)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { void signIn(); return; }
      if (e instanceof ApiError && e.status === 409) { router.push("/onboarding"); return; }
      setError(e instanceof ApiError ? e.message : t("error"));
      setBusy(null);
    }
  }

  return (
    <div className="space-y-10">
      {/* Hero */}
      <header className="text-center space-y-3">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 border border-amber-600/50 bg-amber-500/10 text-amber-300 text-[10px] font-bold uppercase tracking-widest">
          <Sparkles className="w-3 h-3" /> {t("trialBadge", { days: TRIAL_DAYS })}
        </span>
        <h1 className="font-display text-4xl sm:text-5xl text-white tracking-wider flex items-center justify-center gap-3">
          <Crown className="w-9 h-9 text-amber-400" /> {t("title")}
        </h1>
        <p className="text-zinc-400 text-sm max-w-2xl mx-auto">{t("subtitle")}</p>
      </header>

      {/* Currency switcher */}
      <div className="flex items-center justify-center gap-2" role="group" aria-label={t("currencyLabel")}>
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">{t("currencyLabel")}</span>
        {BILLING_CURRENCIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCurrency(c)}
            aria-pressed={currency === c}
            className={`px-3 py-1.5 border text-xs font-mono uppercase tracking-widest transition-colors ${currency === c ? "border-amber-500 bg-amber-500/15 text-amber-200" : "border-zinc-800 text-zinc-500 hover:text-white"}`}
          >
            {CURRENCY_LABEL[c]}
          </button>
        ))}
      </div>

      {/* Pricing cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PREMIUM_MONTHS.map((m) => {
          const best = m === 12;
          const save = savingsPercent(currency, m);
          return (
            <div
              key={m}
              className={`relative border p-6 flex flex-col ${best ? "border-amber-500 bg-amber-950/10" : "border-zinc-800 bg-zinc-950/60"}`}
            >
              {best && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-amber-500 text-black text-[9px] font-bold uppercase tracking-widest">
                  {t("bestValue")}
                </span>
              )}
              <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-2">{t(`per_${m}` as "per_1")}</div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-3xl text-white">{formatMoney(perMonthMinor(currency, m), currency, locale)}</span>
                <span className="text-xs text-zinc-500">{t("perMonth")}</span>
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">
                {m === 1 ? t("billedMonthly") : t("billedTotal", { total: formatMoney(PREMIUM_PRICE[currency][m], currency, locale), months: m })}
              </div>
              {save > 0 && (
                <div className="mt-1 text-[11px] font-bold text-emerald-400">{t("save", { percent: save })}</div>
              )}
              {error && busy === m && <p className="text-xs text-red-400 mt-3">⚠️ {error}</p>}
              <button
                type="button"
                onClick={() => void start(m)}
                disabled={busy !== null}
                className={`mt-5 w-full py-2.5 text-xs font-bold uppercase tracking-widest inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${best ? "bg-amber-500 hover:bg-amber-400 text-black" : "bg-red-700 hover:bg-red-600 text-white"}`}
              >
                {busy === m ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {t("ctaTrial")}
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-center text-[11px] text-zinc-500">{t("trialNote", { days: TRIAL_DAYS })}</p>

      {/* Free vs Premium comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
        <div className="border border-zinc-800 bg-zinc-950/60 p-6">
          <div className="font-display text-xl text-white tracking-wider uppercase">{t("freeTitle")}</div>
          <p className="text-[11px] text-zinc-500 mt-1 mb-4">{t("freeTagline")}</p>
          <ul className="space-y-2">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                <Check className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" /> {t(f)}
              </li>
            ))}
          </ul>
        </div>
        <div className="border border-amber-600/50 bg-amber-950/10 p-6">
          <div className="font-display text-xl text-amber-200 tracking-wider uppercase flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" /> {t("premiumTitle")}
          </div>
          <p className="text-[11px] text-amber-300/70 mt-1 mb-4">{t("everythingInFree")}</p>
          <ul className="space-y-2">
            {PREMIUM_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-zinc-200">
                <Check className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" /> {t(f)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="text-center text-[10px] text-zinc-600 flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-3 h-3" /> {t("disclaimer")}
      </p>
    </div>
  );
}

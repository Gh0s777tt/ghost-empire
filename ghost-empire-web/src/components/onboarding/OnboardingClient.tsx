"use client";
// src/components/onboarding/OnboardingClient.tsx
// 3-step portal wizard: brand → currency → plan. Slug auto-derives from the
// name (still editable); everything is changeable later in the admin panel,
// so the wizard stays deliberately short.
import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Rocket, ChevronLeft, ChevronRight, Check, Loader2, PartyPopper, CreditCard, Building2 } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

type MyTenant = {
  slug: string; name: string; shortName: string | null; ownerHandle: string | null;
  tokenName: string; tokenSymbol: string; brandColor: string; logoUrl: string | null;
  plan: string; effectivePlan: string; planExpiresAt: string | null; users: number;
};

const PLANS = ["basic", "pro", "elite"] as const;
type Plan = (typeof PLANS)[number];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function OnboardingClient() {
  const t = useTranslations("onboarding");
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ slug: string; trialDays: number } | null>(null);
  // Billing (dry-wired Stripe): the activate button only shows once the env is
  // configured; until then the trial flow is the whole story.
  const [billingReady, setBillingReady] = useState(false);
  const [billingReturn, setBillingReturn] = useState<"success" | "cancelled" | null>(null);
  const [months, setMonths] = useState<1 | 3 | 6 | 12>(3);
  // Existing-owner mode: when the caller already has a portal, the page is a
  // self-service dashboard (status + branding edit) instead of the wizard.
  const [myPortal, setMyPortal] = useState<MyTenant | null | undefined>(undefined);
  useEffect(() => {
    apiGet<{ configured: boolean }>("/api/billing/checkout")
      .then((d) => setBillingReady(d.configured))
      .catch(() => setBillingReady(false));
    apiGet<{ tenant: MyTenant | null }>("/api/onboarding/my")
      .then((d) => setMyPortal(d.tenant))
      .catch(() => setMyPortal(null));
    const q = new URLSearchParams(window.location.search).get("billing");
    if (q === "success" || q === "cancelled") setBillingReturn(q);
  }, []);

  async function activate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ ok: true; url: string }>("/api/billing/checkout", { plan, months });
      window.location.href = res.url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error"));
      setBusy(false);
    }
  }

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [handle, setHandle] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [color, setColor] = useState("#E50914");
  const [plan, setPlan] = useState<Plan>("pro");

  const effSlug = slugTouched ? slug : slugify(name);
  const step1Ok = name.trim().length >= 3 && effSlug.length >= 3;

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ ok: true; slug: string; trialDays: number }>("/api/onboarding", {
        name, slug: effSlug, ownerHandle: handle, tokenName, tokenSymbol, brandColor: color, plan,
      });
      setDone({ slug: res.slug, trialDays: res.trialDays });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  if (billingReturn) {
    return (
      <div className={`border p-8 text-center space-y-4 ${billingReturn === "success" ? "border-green-800 bg-green-950/20" : "border-zinc-800 bg-zinc-950/50"}`}>
        <PartyPopper className={`w-10 h-10 mx-auto ${billingReturn === "success" ? "text-green-400" : "text-zinc-500"}`} />
        <h1 className="font-display text-3xl text-white tracking-wider">
          {billingReturn === "success" ? t("bSuccessTitle") : t("bCancelled")}
        </h1>
        {billingReturn === "success" && (
          <p className="text-zinc-300 text-sm max-w-md mx-auto">{t("bSuccessBody")}</p>
        )}
      </div>
    );
  }

  if (myPortal === undefined && !billingReturn) {
    return (
      <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> …
      </div>
    );
  }

  if (myPortal && !billingReturn && !done) {
    return (
      <MyPortalView
        portal={myPortal}
        billingReady={billingReady}
        onRefresh={() => apiGet<{ tenant: MyTenant | null }>("/api/onboarding/my").then((d) => setMyPortal(d.tenant)).catch(() => {})}
      />
    );
  }

  if (done) {
    return (
      <div className="border border-green-800 bg-green-950/20 p-8 text-center space-y-4">
        <PartyPopper className="w-10 h-10 text-green-400 mx-auto" />
        <h1 className="font-display text-3xl text-white tracking-wider">{t("doneTitle")}</h1>
        <p className="text-zinc-300 text-sm max-w-md mx-auto">
          {t("doneBody", { slug: done.slug, days: done.trialDays })}
        </p>
        <p className="text-zinc-500 text-xs max-w-md mx-auto">{t("doneNext")}</p>
        {billingReady && plan !== "basic" && (
          <div className="pt-2 space-y-3">
            <p className="text-zinc-400 text-xs max-w-md mx-auto">{t("bActivateHint")}</p>
            <div className="flex items-center justify-center gap-2">
              {([1, 3, 6, 12] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  className={`px-3 py-1.5 border text-xs font-mono uppercase tracking-widest transition-colors ${months === m ? "border-red-600 bg-red-950/40 text-white" : "border-zinc-800 text-zinc-500 hover:text-white"}`}
                >
                  {t("bMonths", { n: m })}
                </button>
              ))}
            </div>
            {error && <p className="text-sm text-red-400">⚠️ {error}</p>}
            <button
              type="button"
              onClick={() => void activate()}
              disabled={busy}
              className="px-5 py-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest inline-flex items-center gap-2 transition-colors"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              {t("bActivate")}
            </button>
          </div>
        )}
      </div>
    );
  }

  const input = "w-full border border-zinc-800 bg-black/30 px-3 py-2.5 text-sm text-white outline-hidden focus:border-red-600 placeholder:text-zinc-700";
  const label = "text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1";

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="font-display text-4xl text-white tracking-wider flex items-center justify-center gap-3">
          <Rocket className="w-8 h-8 text-red-500" /> {t("title")}
        </h1>
        <p className="text-zinc-400 text-sm max-w-xl mx-auto">{t("subtitle")}</p>
      </div>

      {/* stepper */}
      <div className="flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-widest">
        {[1, 2, 3].map((s) => (
          <span key={s} className={`px-3 py-1 border ${step === s ? "border-red-600 text-white bg-red-950/40" : step > s ? "border-green-800 text-green-400" : "border-zinc-800 text-zinc-600"}`}>
            {step > s ? "✓ " : ""}{t(`step${s}` as "step1")}
          </span>
        ))}
      </div>

      <div className="border border-zinc-800 bg-zinc-950/70 p-6 space-y-4">
        {step === 1 && (
          <>
            <div>
              <label className={label}>{t("name")}</label>
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="NEO ZONE" maxLength={60} />
            </div>
            <div>
              <label className={label}>{t("slug")}</label>
              <input
                className={`${input} font-mono`}
                value={effSlug}
                onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }}
                placeholder="neo-zone"
                maxLength={32}
              />
              <p className="text-[10px] text-zinc-600 mt-1 font-mono">{effSlug || "…"}.twoja-domena.com</p>
            </div>
            <div>
              <label className={label}>{t("handle")}</label>
              <input className={input} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="TwojNickNaTwitchu" maxLength={40} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={label}>{t("tokenName")}</label>
                <input className={input} value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="Neo Coins" maxLength={40} />
              </div>
              <div>
                <label className={label}>{t("tokenSymbol")}</label>
                <input className={`${input} font-mono`} value={tokenSymbol} onChange={(e) => setTokenSymbol(e.target.value)} placeholder="NC" maxLength={8} />
              </div>
            </div>
            <div>
              <label className={label}>{t("color")}</label>
              <div className="flex items-center gap-3">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 bg-transparent border border-zinc-800 cursor-pointer" aria-label={t("color")} />
                <span className="font-mono text-sm text-zinc-300">{color}</span>
              </div>
            </div>
            <p className="text-[11px] text-zinc-600">{t("brandHint")}</p>
          </>
        )}

        {step === 3 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {PLANS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlan(p)}
                  className={`border p-4 text-left transition-colors ${plan === p ? "border-red-600 bg-red-950/30" : "border-zinc-800 hover:border-zinc-600"}`}
                >
                  <div className="font-display text-lg text-white tracking-wider uppercase">{p}</div>
                  <div className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{t(`plan_${p}` as "plan_basic")}</div>
                </button>
              ))}
            </div>
            <div className="border border-zinc-800 bg-black/30 p-4 text-sm text-zinc-300 space-y-1">
              <div><span className="text-zinc-500">{t("name")}:</span> {name || "—"} <span className="text-zinc-600 font-mono">/{effSlug}</span></div>
              <div><span className="text-zinc-500">{t("tokenName")}:</span> {tokenName || "Ghost Tokens"} ({tokenSymbol || "GT"})</div>
              <div className="flex items-center gap-2"><span className="text-zinc-500">{t("color")}:</span> <span className="inline-block w-3.5 h-3.5 rounded-sm" style={{ background: color }} /> <span className="font-mono">{color}</span></div>
            </div>
            <p className="text-[11px] text-zinc-500">{t("trialNote")}</p>
            {error && <p className="text-sm text-red-400">⚠️ {error}</p>}
          </>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || busy}
            className="px-4 py-2 border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> {t("back")}
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 && !step1Ok}
              className="px-5 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 transition-colors"
            >
              {t("next")} <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !step1Ok}
              className="px-5 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 transition-colors"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {t("launch")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Self-service dashboard for an existing portal owner: status + branding edit
 *  + (when billing is live) subscription activation. */
function MyPortalView({ portal, billingReady, onRefresh }: {
  portal: MyTenant;
  billingReady: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [f, setF] = useState({
    name: portal.name,
    shortName: portal.shortName ?? "",
    ownerHandle: portal.ownerHandle ?? "",
    tokenName: portal.tokenName,
    tokenSymbol: portal.tokenSymbol,
    brandColor: portal.brandColor,
    logoUrl: portal.logoUrl ?? "",
  });
  const set = (k: keyof typeof f) => (v: string) => { setSaved(false); setF((p) => ({ ...p, [k]: v })); };

  const [subPlan, setSubPlan] = useState<"pro" | "elite">(portal.plan === "elite" ? "elite" : "pro");
  const [months, setMonths] = useState<1 | 3 | 6 | 12>(3);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/onboarding/my", f, { method: "PATCH" });
      setSaved(true);
      onRefresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ ok: true; url: string }>("/api/billing/checkout", { plan: subPlan, months });
      window.location.href = res.url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error"));
      setBusy(false);
    }
  }

  const degraded = portal.effectivePlan !== portal.plan;
  const input = "w-full border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-white outline-hidden focus:border-red-600 placeholder:text-zinc-700";
  const label = "text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1";

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="font-display text-4xl text-white tracking-wider flex items-center justify-center gap-3">
          <Building2 className="w-8 h-8 text-red-500" /> {t("myTitle")}
        </h1>
        <p className="text-zinc-400 text-sm">{t("mySubtitle")}</p>
      </div>

      {/* status */}
      <div className="border border-zinc-800 bg-zinc-950/70 p-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-3.5 h-3.5 rounded-sm" style={{ background: portal.brandColor }} />
          <span className="font-bold text-white">{portal.name}</span>
          <span className="font-mono text-zinc-500 text-xs">/{portal.slug}</span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 border border-zinc-700 text-zinc-300">{portal.plan}</span>
        {portal.planExpiresAt && (
          <span className={`text-xs font-mono ${degraded ? "text-red-400" : "text-zinc-500"}`}>
            {degraded ? t("myExpired") : t("myUntil", { date: formatDate(new Date(portal.planExpiresAt), locale) })}
          </span>
        )}
        <span className="text-xs font-mono text-zinc-500 ms-auto">👤 {portal.users} · {portal.tokenName} ({portal.tokenSymbol})</span>
      </div>

      {/* branding edit */}
      <div className="border border-zinc-800 bg-zinc-950/70 p-6 space-y-4">
        <h2 className="font-display text-lg text-white tracking-wider">{t("myBranding").toUpperCase()}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label className={label}>{t("name")}</label><input className={input} value={f.name} onChange={(e) => set("name")(e.target.value)} maxLength={60} /></div>
          <div><label className={label}>{t("handle")}</label><input className={input} value={f.ownerHandle} onChange={(e) => set("ownerHandle")(e.target.value)} maxLength={40} /></div>
          <div><label className={label}>{t("tokenName")}</label><input className={input} value={f.tokenName} onChange={(e) => set("tokenName")(e.target.value)} maxLength={40} /></div>
          <div><label className={label}>{t("tokenSymbol")}</label><input className={`${input} font-mono`} value={f.tokenSymbol} onChange={(e) => set("tokenSymbol")(e.target.value)} maxLength={8} /></div>
          <div>
            <label className={label}>{t("color")}</label>
            <div className="flex items-center gap-2">
              <input type="color" value={f.brandColor} onChange={(e) => set("brandColor")(e.target.value)} className="h-9 w-12 bg-transparent border border-zinc-800 cursor-pointer" aria-label={t("color")} />
              <span className="font-mono text-xs text-zinc-300">{f.brandColor}</span>
            </div>
          </div>
          <div><label className={label}>{t("myLogo")}</label><input className={input} value={f.logoUrl} onChange={(e) => set("logoUrl")(e.target.value)} placeholder="https://…/logo.png" maxLength={300} /></div>
        </div>
        {error && <p className="text-sm text-red-400">⚠️ {error}</p>}
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="px-5 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest inline-flex items-center gap-2 transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saved ? t("mySaved") : t("mySave")}
        </button>
      </div>

      {/* subscription */}
      {billingReady && (
        <div className="border border-zinc-800 bg-zinc-950/70 p-6 space-y-3">
          <h2 className="font-display text-lg text-white tracking-wider">{t("mySubscription").toUpperCase()}</h2>
          <p className="text-zinc-500 text-xs">{t("bActivateHint")}</p>
          <div className="flex flex-wrap items-center gap-2">
            {(["pro", "elite"] as const).map((p) => (
              <button key={p} type="button" onClick={() => setSubPlan(p)}
                className={`px-3 py-1.5 border text-xs font-mono uppercase tracking-widest transition-colors ${subPlan === p ? "border-red-600 bg-red-950/40 text-white" : "border-zinc-800 text-zinc-500 hover:text-white"}`}>
                {p}
              </button>
            ))}
            <span className="text-zinc-700">·</span>
            {([1, 3, 6, 12] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMonths(m)}
                className={`px-3 py-1.5 border text-xs font-mono uppercase tracking-widest transition-colors ${months === m ? "border-red-600 bg-red-950/40 text-white" : "border-zinc-800 text-zinc-500 hover:text-white"}`}>
                {t("bMonths", { n: m })}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void activate()}
            disabled={busy}
            className="px-5 py-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest inline-flex items-center gap-2 transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            {t("bActivate")}
          </button>
        </div>
      )}
    </div>
  );
}

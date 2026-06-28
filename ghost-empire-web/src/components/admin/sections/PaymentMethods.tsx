"use client";
// src/components/admin/sections/PaymentMethods.tsx
// Manage the real-money support methods shown on the public /support page (#514):
// payment links, crypto wallets, bank/IBAN. Per-tenant. Data via
// /api/admin/payment-methods.
import { useState, useEffect, useCallback } from "react";
import { Wallet, Loader2, Trash2, Plus, Eye, EyeOff, Star, ArrowUp, ArrowDown, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { PaymentLogo } from "@/components/PaymentLogo";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type Kind = "link" | "crypto" | "bank";
type Method = {
  id: string; kind: Kind; label: string; value: string; network: string | null;
  note: string | null; icon: string | null; featured: boolean; active: boolean; sortOrder: number; clicks: number;
};

const KIND_ICON: Record<Kind, string> = { link: "🔗", crypto: "🪙", bank: "🏦" };

export function PaymentMethodsManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.paymentMethods");
  const [loading, setLoading] = useState(true);
  const [methods, setMethods] = useState<Method[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // create form
  const [kind, setKind] = useState<Kind>("link");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [network, setNetwork] = useState("");
  const [note, setNote] = useState("");
  const [featured, setFeatured] = useState(false);
  // fundraising goal
  const [gTitle, setGTitle] = useState("");
  const [gTarget, setGTarget] = useState("");
  const [gCurrent, setGCurrent] = useState("0");
  const [gCurrency, setGCurrency] = useState("PLN");
  const [gActive, setGActive] = useState(false);
  // per-portal /support page copy (#742) — streamer's own words
  const [sHeading, setSHeading] = useState("");
  const [sIntro, setSIntro] = useState("");
  const [sThanks, setSThanks] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{
        methods: Method[];
        goal: { title: string; target: number; current: number; currency: string; active: boolean } | null;
        supportText?: { heading: string; intro: string; thanks: string };
      }>("/api/admin/payment-methods");
      setMethods(d.methods);
      if (d.goal) { setGTitle(d.goal.title); setGTarget(String(d.goal.target)); setGCurrent(String(d.goal.current)); setGCurrency(d.goal.currency); setGActive(d.goal.active); }
      if (d.supportText) { setSHeading(d.supportText.heading); setSIntro(d.supportText.intro); setSThanks(d.supportText.thanks); }
    } catch { /* keep */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function saveGoal() {
    setBusy("goal");
    if (await call("save-goal", { title: gTitle.trim(), target: +gTarget || 0, current: +gCurrent || 0, currency: gCurrency.trim(), active: gActive })) onToast("ok", t("goalSaved"));
    setBusy(null);
  }

  async function saveSupportText() {
    setBusy("text");
    if (await call("save-support-text", { supportHeading: sHeading.trim(), supportIntro: sIntro.trim(), supportThanks: sThanks.trim() })) onToast("ok", t("textSaved"));
    setBusy(null);
  }

  async function call(action: string, payload: Record<string, unknown>): Promise<boolean> {
    try { await apiPost("/api/admin/payment-methods", { action, ...payload }); return true; }
    catch (e) { onToast("err", e instanceof ApiError ? e.message : t("err")); return false; }
  }

  async function create() {
    setBusy("create");
    if (await call("create", { kind, label: label.trim(), value: value.trim(), network: network.trim(), note: note.trim(), featured })) {
      onToast("ok", t("created"));
      setLabel(""); setValue(""); setNetwork(""); setNote(""); setFeatured(false);
      await load();
    }
    setBusy(null);
  }
  async function patch(m: Method, data: Record<string, unknown>) {
    setBusy(m.id);
    if (await call("update", { id: m.id, kind: m.kind, label: m.label, value: m.value, network: m.network, note: m.note, featured: m.featured, active: m.active, ...data })) await load();
    setBusy(null);
  }
  async function remove(m: Method) {
    if (!confirm(t("deleteConfirm", { name: m.label }))) return;
    setBusy(m.id); if (await call("delete", { id: m.id })) { onToast("ok", t("deleted")); await load(); } setBusy(null);
  }
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= methods.length) return;
    const next = [...methods];
    [next[i], next[j]] = [next[j], next[i]];
    setMethods(next);
    await call("reorder", { ids: next.map((m) => m.id) });
  }

  const valuePh = kind === "link" ? t("phLink") : kind === "crypto" ? t("phCrypto") : t("phBank");
  const networkPh = kind === "crypto" ? t("phNetwork") : kind === "bank" ? t("phHolder") : "";

  return (
    <SectionCard title={t("title")} icon={Wallet}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro")} <a href="/support" target="_blank" rel="noreferrer" className="text-red-400 hover:text-red-300 inline-flex items-center gap-0.5">/support <ExternalLink className="w-3 h-3" /></a></p>

      {/* Per-portal page copy (#742) — streamer's own headline / intro / thank-you. Empty = template. */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">{t("textTitle")}</div>
        <div className="space-y-2">
          <input value={sHeading} maxLength={120} placeholder={t("textHeadingPh")} onChange={(e) => setSHeading(e.target.value)} className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
          <textarea value={sIntro} maxLength={600} rows={3} placeholder={t("textIntroPh")} onChange={(e) => setSIntro(e.target.value)} className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600 resize-y" />
          <input value={sThanks} maxLength={200} placeholder={t("textThanksPh")} onChange={(e) => setSThanks(e.target.value)} className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
        </div>
        <button onClick={() => void saveSupportText()} disabled={busy === "text"} className="mt-2 px-3 py-1.5 border border-zinc-700 text-zinc-200 hover:border-red-600 text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy === "text" ? <Loader2 className="w-3 h-3 animate-spin" /> : null} {t("textSave")}
        </button>
      </div>

      {/* Fundraising goal */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-4">
        <label className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2 cursor-pointer">
          <input type="checkbox" checked={gActive} onChange={(e) => setGActive(e.target.checked)} className="accent-red-600" /> {t("goalTitle")}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <input value={gTitle} maxLength={80} placeholder={t("goalNamePh")} onChange={(e) => setGTitle(e.target.value)} className="sm:col-span-2 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
          <input value={gCurrent} inputMode="numeric" placeholder={t("goalCurrentPh")} onChange={(e) => setGCurrent(e.target.value.replace(/[^0-9]/g, ""))} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono tabular-nums outline-hidden focus:border-red-600" />
          <div className="flex gap-2">
            <input value={gTarget} inputMode="numeric" placeholder={t("goalTargetPh")} onChange={(e) => setGTarget(e.target.value.replace(/[^0-9]/g, ""))} className="flex-1 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono tabular-nums outline-hidden focus:border-red-600" />
            <input value={gCurrency} maxLength={8} onChange={(e) => setGCurrency(e.target.value.toUpperCase())} className="w-16 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white text-center uppercase outline-hidden focus:border-red-600" />
          </div>
        </div>
        <button onClick={() => void saveGoal()} disabled={busy === "goal"} className="px-3 py-1.5 border border-zinc-700 text-zinc-200 hover:border-red-600 text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy === "goal" ? <Loader2 className="w-3 h-3 animate-spin" /> : null} {t("goalSave")}
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : (
        <div className="space-y-2 mb-4">
          {methods.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">{t("empty")}</div>
          ) : methods.map((m, i) => (
            <div key={m.id} className={`flex items-center gap-2 border p-2.5 ${m.active ? "border-zinc-800 bg-black/30" : "border-zinc-900 bg-black/20 opacity-60"}`}>
              <div className="flex flex-col shrink-0">
                <button onClick={() => void move(i, -1)} disabled={i === 0} className="text-zinc-600 hover:text-white disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
                <button onClick={() => void move(i, 1)} disabled={i === methods.length - 1} className="text-zinc-600 hover:text-white disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
              </div>
              <PaymentLogo kind={m.kind} network={m.network} label={m.label} icon={m.icon} size={26} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate flex items-center gap-1.5">
                  {m.label}
                  {m.network && <span className="text-[10px] font-mono text-zinc-500">{m.network}</span>}
                  {m.featured && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                  {m.clicks > 0 && <span className="text-[10px] font-mono text-zinc-500" title={t("clicksTitle")}>👆 {m.clicks}</span>}
                </div>
                <div className="text-[10px] text-zinc-600 font-mono truncate">{m.value}</div>
              </div>
              <button onClick={() => void patch(m, { featured: !m.featured })} disabled={busy === m.id} title={t("featuredTitle")} className={`shrink-0 border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center ${m.featured ? "text-amber-400" : "text-zinc-600 hover:text-white"}`}><Star className="w-3 h-3" /></button>
              <button onClick={() => void patch(m, { active: !m.active })} disabled={busy === m.id} title={m.active ? t("disable") : t("enable")} className="shrink-0 text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center">{m.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}</button>
              <button onClick={() => void remove(m)} disabled={busy === m.id} title={t("deleteTitle")} className="shrink-0 text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-6 h-6 flex items-center justify-center"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}

      <div className="border border-zinc-800 bg-black/30 p-3 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("addTitle")}</div>
        <div className="flex gap-1.5">
          {(["link", "crypto", "bank"] as Kind[]).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={`flex-1 px-2 py-1.5 text-[11px] font-bold tracking-wide border transition-colors ${kind === k ? "border-red-600 bg-red-950/40 text-white" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"}`}>
              {KIND_ICON[k]} {t(`kind_${k}`)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={label} maxLength={60} placeholder={t("phLabel")} onChange={(e) => setLabel(e.target.value)} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
          {kind !== "link" && (
            <input value={network} maxLength={60} placeholder={networkPh} onChange={(e) => setNetwork(e.target.value)} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
          )}
        </div>
        <input value={value} placeholder={valuePh} onChange={(e) => setValue(e.target.value)} className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600" />
        <input value={note} maxLength={200} placeholder={t("phNote")} onChange={(e) => setNote(e.target.value)} className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="accent-amber-500" /> {t("featuredLabel")}
          </label>
          <button onClick={() => void create()} disabled={busy === "create" || !label.trim() || !value.trim()} className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center gap-1.5">
            {busy === "create" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} {t("addBtn")}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

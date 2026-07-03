"use client";
// src/components/admin/sections/Tenants.tsx
// Admin-of-admins (SaaS Phase 6): the platform owner's tenant manager — list
// portals, provision a new one, edit branding / plan. Visible ONLY to the
// permanent-admin email (gated server-side by requirePlatformOwner; the nav
// entry itself is gated via the isPlatformOwner prop).
import { useCallback, useEffect, useState } from "react";
import { Building2, Plus, Loader2, Pencil, Check, X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { SectionCard, FieldInput } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { BG_PRESETS, bgPresetValue, bgPresetId } from "@/lib/bg-presets";

type TenantRow = {
  id: string; slug: string; name: string; shortName: string | null;
  brandColor: string; logoUrl: string | null; ownerHandle: string | null;
  tokenName: string; tokenSymbol: string; companionDefaultName: string | null; bgImageUrl: string | null;
  socialLinks: { platform: string; url: string }[] | null;
  supportAlertMode: string;
  timezone: string | null;
  domain: string | null;
  plan: string; planExpiresAt: string | null; createdAt: string; users: number;
  setupCompletedAt: string | null; newUsers7d: number; stuck: boolean;
};

const PLANS = ["basic", "pro", "elite"] as const;

export function TenantsManager({ onToast }: {
  onToast: (kind: "ok" | "err", msg: string) => void;
  onSuccess?: () => void;
  pending?: boolean;
}) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [rows, setRows] = useState<TenantRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ tenants: TenantRow[] }>("/api/admin/tenants");
      setRows(d.tenants);
    } catch (e) {
      onToast("err", e instanceof ApiError ? e.message : t("loadError"));
      setRows([]);
    }
  }, [onToast, t]);
  useEffect(() => { void load(); }, [load]);

  // --- create form ---
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [plan, setPlan] = useState<string>("pro");

  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      await apiPost("/api/admin/tenants", { slug, name, plan });
      onToast("ok", t("tntCreated", { slug }));
      setSlug(""); setName("");
      await load();
    } catch (e) {
      onToast("err", e instanceof ApiError ? e.message : t("tntError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard title={t("tntListTitle")} icon={Building2}>
        {rows === null ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> {t("loadingSection")}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-zinc-500 text-sm">{t("tntEmpty")}</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <TenantCard key={r.id} row={r} onToast={onToast} onSaved={load} locale={locale} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={t("tntCreateTitle")} icon={Plus}>
        <p className="text-zinc-500 text-xs mb-3">{t("tntCreateHint")}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FieldInput label={t("tntSlug")} value={slug} onChange={setSlug} placeholder="neo-zone" />
          <FieldInput label={t("tntName")} value={name} onChange={setName} placeholder="NEO ZONE" />
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("tntPlan")}</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-white font-mono outline-hidden focus:border-red-600"
            >
              {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <button
          onClick={() => void create()}
          disabled={busy || !slug.trim() || !name.trim()}
          className="mt-3 px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          {t("tntCreateBtn")}
        </button>
      </SectionCard>
    </div>
  );
}

function TenantCard({ row, onToast, onSaved, locale }: {
  row: TenantRow;
  onToast: (kind: "ok" | "err", msg: string) => void;
  onSaved: () => Promise<void> | void;
  locale: string;
}) {
  const t = useTranslations("admin");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: row.name,
    shortName: row.shortName ?? "",
    ownerHandle: row.ownerHandle ?? "",
    tokenName: row.tokenName,
    tokenSymbol: row.tokenSymbol,
    brandColor: row.brandColor,
    logoUrl: row.logoUrl ?? "",
    companionDefaultName: row.companionDefaultName ?? "",
    bgImageUrl: row.bgImageUrl ?? "",
    supportAlertMode: row.supportAlertMode ?? "none",
    timezone: row.timezone ?? "",
    domain: row.domain ?? "",
    plan: row.plan,
    planExpiresAt: row.planExpiresAt ? row.planExpiresAt.slice(0, 10) : "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  // Portal social links edited as "platform url" lines (one per line); parsed on save.
  const [socialLinksText, setSocialLinksText] = useState(
    (row.socialLinks ?? []).map((s) => `${s.platform} ${s.url}`).join("\n"),
  );

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const socialLinks = socialLinksText
        .split("\n")
        .map((line) => line.trim().split(/\s+/))
        .filter((parts) => parts.length >= 2 && parts[0] && parts[1])
        .map((parts) => ({ platform: parts[0], url: parts[1] }));
      await apiPost(`/api/admin/tenants/${row.id}`, {
        ...f,
        ownerHandle: f.ownerHandle, // "" → null server-side
        logoUrl: f.logoUrl,
        socialLinks,
        planExpiresAt: f.planExpiresAt ? new Date(f.planExpiresAt + "T23:59:59Z").toISOString() : null,
      }, { method: "PATCH" });
      onToast("ok", t("tntSaved", { slug: row.slug }));
      setEditing(false);
      await onSaved();
    } catch (e) {
      onToast("err", e instanceof ApiError ? e.message : t("tntError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-zinc-800 bg-black/30 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-block w-3.5 h-3.5 rounded-sm shrink-0" style={{ background: row.brandColor }} />
        <span className="font-mono text-sm text-white font-bold">{row.name}</span>
        <span className="text-[10px] font-mono text-zinc-500">/{row.slug}</span>
        <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-zinc-700 text-zinc-300">{row.plan}</span>
        {row.planExpiresAt && (
          <span className="text-[10px] font-mono text-zinc-500">{t("tntUntil")} {formatDate(new Date(row.planExpiresAt), locale)}</span>
        )}
        <span className="text-[10px] font-mono text-zinc-500 ms-auto">👤 {row.users} · {row.tokenName} ({row.tokenSymbol})</span>
        <button
          onClick={() => setEditing((e) => !e)}
          className="text-zinc-400 hover:text-white transition-colors"
          aria-label={t("tntEdit")}
        >
          {editing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
        </button>
      </div>

      {/* C3 — per-portal activation readout for the operator: age, joins this week, setup status,
          and a "stuck" flag so a portal that needs a nudge stands out (#787). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[10px] font-mono text-zinc-500">
        <span>{t("tntCreated")} {formatDate(new Date(row.createdAt), locale)}</span>
        {row.newUsers7d > 0 && <span className="text-emerald-400">+{row.newUsers7d} {t("tntNew7d")}</span>}
        <span className={row.setupCompletedAt ? "text-emerald-500" : "text-amber-400"}>{row.setupCompletedAt ? `✓ ${t("tntSetupOk")}` : `⚠ ${t("tntSetupPending")}`}</span>
        {row.stuck && <span className="px-1.5 py-0.5 bg-amber-950/40 border border-amber-800/50 text-amber-300 uppercase tracking-widest">{t("tntStuck")}</span>}
      </div>

      {editing && (
        <div className="mt-3 pt-3 border-t border-zinc-800 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FieldInput label={t("tntName")} value={f.name} onChange={set("name")} />
            <FieldInput label={t("tntShortName")} value={f.shortName} onChange={set("shortName")} />
            <FieldInput label={t("tntOwner")} value={f.ownerHandle} onChange={set("ownerHandle")} placeholder="Gh0s77tt" />
            <FieldInput label={t("tntTokenName")} value={f.tokenName} onChange={set("tokenName")} placeholder="Ghost Tokens" />
            <FieldInput label={t("tntTokenSymbol")} value={f.tokenSymbol} onChange={set("tokenSymbol")} placeholder="GT" />
            <FieldInput label={t("tntColor")} value={f.brandColor} onChange={set("brandColor")} placeholder="#E50914" />
            <FieldInput label={t("tntLogo")} value={f.logoUrl} onChange={set("logoUrl")} placeholder="https://…/logo.png" />
            <FieldInput label={t("tntCompanionName")} value={f.companionDefaultName} onChange={set("companionDefaultName")} placeholder="Widmo" />
            <FieldInput label={t("tntTimezone")} value={f.timezone} onChange={set("timezone")} placeholder="Europe/Warsaw" />
            <FieldInput label={t("tntDomain")} value={f.domain} onChange={set("domain")} placeholder="empire-forge.com" />
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("tntBgPreset")}</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <button
                  type="button"
                  onClick={() => set("bgImageUrl")("")}
                  className={`px-2 py-1 text-[10px] font-bold uppercase tracking-widest border ${!f.bgImageUrl ? "border-red-500 text-red-300" : "border-zinc-800 text-zinc-500 hover:border-zinc-600"}`}
                >
                  {t("tntBgNone")}
                </button>
                {BG_PRESETS.map((p) => {
                  const active = bgPresetId(f.bgImageUrl) === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => set("bgImageUrl")(bgPresetValue(p.id))}
                      title={p.label}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-widest border ${active ? "border-red-500 text-white" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"}`}
                    >
                      <span className="w-4 h-4 rounded-sm border border-white/10 shrink-0" style={{ backgroundImage: p.css }} />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <FieldInput label={t("tntBgImage")} value={f.bgImageUrl} onChange={set("bgImageUrl")} placeholder="https://…/bg.jpg" />
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("tntPlan")}</label>
              <select
                value={f.plan}
                onChange={(e) => set("plan")(e.target.value)}
                className="w-full border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-white font-mono outline-hidden focus:border-red-600"
              >
                {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <FieldInput label={t("tntExpiry")} value={f.planExpiresAt} onChange={set("planExpiresAt")} type="date" />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("tntSocialLinks")}</label>
            <textarea
              value={socialLinksText}
              onChange={(e) => setSocialLinksText(e.target.value)}
              rows={3}
              placeholder={"twitch https://twitch.tv/you\nkick https://kick.com/you"}
              className="w-full border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-white font-mono outline-hidden focus:border-red-600 resize-y"
            />
            <p className="text-[10px] text-zinc-600 mt-1">{t("tntSocialLinksHint")}</p>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("tntSupportAlert")}</label>
            <select
              value={f.supportAlertMode}
              onChange={(e) => set("supportAlertMode")(e.target.value)}
              className="w-full border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-white font-mono outline-hidden focus:border-red-600"
            >
              <option value="none">{t("tntSupportAlertNone")}</option>
              <option value="bell">{t("tntSupportAlertBell")}</option>
              <option value="overlay">{t("tntSupportAlertOverlay")}</option>
              <option value="both">{t("tntSupportAlertBoth")}</option>
            </select>
          </div>
          <button
            onClick={() => void save()}
            disabled={busy}
            className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {t("tntSave")}
          </button>
        </div>
      )}
    </div>
  );
}

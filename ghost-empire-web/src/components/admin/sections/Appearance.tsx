"use client";
// src/components/admin/sections/Appearance.tsx
// Self-serve portal branding for the tenant OWNER (#785/C1). The branding form used to live ONLY
// on the hidden /onboarding "My Portal" page (DISCOVERY_REPORT: a streamer-admin had NO branding
// surface in the panel at all). This relocates it into the admin panel — where a streamer actually
// looks — reusing the owner-scoped, Elite-gated PATCH /api/onboarding/my. The Elite requirement is
// shown UPFRONT (a locked banner + a disabled save), so there's no more "fill the form → 403 on
// save" trap. A non-owner (e.g. a portal the platform operator runs) sees a note instead.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Palette, Loader2, Check, ExternalLink, Lock } from "lucide-react";
import { apiGet, apiPatch, ApiError } from "@/lib/api-client";
import { SectionCard, FieldInput } from "../shared";

type MyTenant = {
  slug: string; name: string; shortName: string | null; ownerHandle: string | null;
  tokenName: string; tokenSymbol: string; brandColor: string; logoUrl: string | null;
  plan: string; effectivePlan: string;
};

export function AppearanceManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void; onSuccess?: () => void; pending?: boolean }) {
  const t = useTranslations("admin.appearance");
  const [tenant, setTenant] = useState<MyTenant | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [handle, setHandle] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [color, setColor] = useState("#E50914");
  const [logoUrl, setLogoUrl] = useState("");

  useEffect(() => {
    apiGet<{ tenant: MyTenant | null }>("/api/onboarding/my")
      .then((d) => {
        setTenant(d.tenant);
        if (d.tenant) {
          setName(d.tenant.name);
          setShortName(d.tenant.shortName ?? "");
          setHandle(d.tenant.ownerHandle ?? "");
          setTokenName(d.tenant.tokenName);
          setTokenSymbol(d.tenant.tokenSymbol);
          setColor(d.tenant.brandColor);
          setLogoUrl(d.tenant.logoUrl ?? "");
        }
      })
      .catch(() => setTenant(null));
  }, []);

  if (tenant === undefined) {
    return (
      <SectionCard title={t("title")} icon={Palette}>
        <div className="text-zinc-500 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}</div>
      </SectionCard>
    );
  }
  if (!tenant) {
    return (
      <SectionCard title={t("title")} icon={Palette}>
        <p className="text-zinc-500 text-sm">{t("notOwner")}</p>
      </SectionCard>
    );
  }

  // custom_branding is an Elite feature — surface that UPFRONT rather than 403-ing on save.
  const canBrand = tenant.effectivePlan === "elite";

  async function save() {
    setSaving(true);
    try {
      await apiPatch("/api/onboarding/my", {
        name, shortName, ownerHandle: handle, tokenName, tokenSymbol, brandColor: color, logoUrl: logoUrl.trim() || null,
      });
      onToast("ok", t("saved"));
    } catch (e) {
      onToast("err", e instanceof ApiError ? e.message : t("saveErr"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title={t("title")} icon={Palette}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro")}</p>

      {!canBrand && (
        <div className="mb-4 border border-amber-900/40 bg-amber-950/20 px-3 py-2.5 flex items-start gap-2">
          <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-[12px] text-amber-200/90">
            {t("eliteNote")}{" "}
            <a href="/premium" className="underline inline-flex items-center gap-0.5">{t("eliteCta")} <ExternalLink className="w-3 h-3" /></a>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <FieldInput label={t("name")} value={name} onChange={setName} />
          <FieldInput label={t("shortName")} value={shortName} onChange={setShortName} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FieldInput label={t("tokenName")} value={tokenName} onChange={setTokenName} />
          <FieldInput label={t("tokenSymbol")} value={tokenSymbol} onChange={setTokenSymbol} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("color")}</label>
            <div className="flex items-center gap-2">
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#E50914"} onChange={(e) => setColor(e.target.value)} className="w-9 h-9 bg-transparent border border-zinc-800 shrink-0" aria-label={t("color")} />
              <input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1 min-w-0 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-red-500" />
            </div>
          </div>
          <FieldInput label={t("handle")} value={handle} onChange={setHandle} placeholder="@nick" />
        </div>
        <FieldInput label={t("logoUrl")} value={logoUrl} onChange={setLogoUrl} placeholder="https://…" />
        {logoUrl.trim() && <img src={logoUrl} alt="" className="w-16 h-16 object-contain border border-zinc-800 bg-black rounded" loading="lazy" decoding="async" />}
      </div>

      <button
        onClick={() => void save()}
        disabled={saving || !canBrand || !name.trim()}
        className="w-full mt-4 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        {canBrand ? t("saveBtn") : t("eliteBtn")}
      </button>
    </SectionCard>
  );
}

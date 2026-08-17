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
import { Palette, Loader2, Check, ExternalLink, Lock, X, Plus } from "lucide-react";
import { apiGet, apiPatch, ApiError } from "@/lib/api-client";
import { BG_PRESETS, bgPresetId, bgPresetValue, resolveBgPresetCss } from "@/lib/bg-presets";
import { SectionCard, FieldInput } from "../shared";
import { contrastRatio, wcagLevel, PORTAL_FONTS } from "@/lib/brand-palette";
import { MediaUploadButton } from "../MediaUploadButton";
import { useTenantBranding } from "@/components/TenantBranding";

type MyTenant = {
  slug: string; name: string; shortName: string | null; ownerHandle: string | null;
  tokenName: string; tokenSymbol: string; brandColor: string; surfaceColor: string | null; textColor: string | null; fontFamily: string | null; logoUrl: string | null;
  bgImageUrl: string | null;
  socialLinks: unknown;
  timezone: string | null;
  companionDefaultName: string | null;
  supportAlertMode: string | null;
  plan: string; effectivePlan: string;
};

// Lustro allowlisty z /api/onboarding/my — serwer i tak odsiewa, ale wybór z listy oszczędza
// streamerowi zapisu, który zostałby po cichu odrzucony.
const SOCIAL_PLATFORMS = ["discord", "twitch", "kick", "youtube", "tiktok", "instagram", "x"] as const;

/** Obronny parser socjali: kolumna to JSON, więc nie zakładamy kształtu wiersza. */
function parseSocials(v: unknown): Array<{ platform: string; url: string }> {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is { platform: string; url: string } =>
      !!x && typeof x === "object" && typeof (x as { platform?: unknown }).platform === "string" && typeof (x as { url?: unknown }).url === "string")
    .map((x) => ({ platform: x.platform, url: x.url }))
    .slice(0, 12);
}

export function AppearanceManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void; onSuccess?: () => void; pending?: boolean }) {
  const t = useTranslations("admin.appearance");
  // Kolor marki jest per portal — literał #E50914 pokazywałby każdemu tenantowi
  // czerwień założyciela w podglądzie "jak to wygląda".
  const { brandColor } = useTenantBranding();
  // Reuse the platform-owner's background labels (admin.tntBg*) — same control, same words,
  // no new i18n keys for the streamer-facing surface.
  const ta = useTranslations("admin");
  const [tenant, setTenant] = useState<MyTenant | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [handle, setHandle] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [color, setColor] = useState(brandColor);
  const [logoUrl, setLogoUrl] = useState("");
  const [bgImageUrl, setBgImageUrl] = useState("");
  const [surface, setSurface] = useState(""); // pusty = kolor z motywu
  const [text, setText] = useState("");
  const [font, setFont] = useState("");
  // Pola, które do tej pory ustawiał WYŁĄCZNIE właściciel platformy.
  const [socials, setSocials] = useState<Array<{ platform: string; url: string }>>([]);
  const [timezone, setTimezone] = useState("");
  const [companionName, setCompanionName] = useState("");
  const [alertMode, setAlertMode] = useState("bell");

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
          setSurface(d.tenant.surfaceColor ?? "");
          setText(d.tenant.textColor ?? "");
          setFont(d.tenant.fontFamily ?? "");
          setLogoUrl(d.tenant.logoUrl ?? "");
          setBgImageUrl(d.tenant.bgImageUrl ?? "");
          setSocials(parseSocials(d.tenant.socialLinks));
          setTimezone(d.tenant.timezone ?? "");
          setCompanionName(d.tenant.companionDefaultName ?? "");
          setAlertMode(d.tenant.supportAlertMode ?? "bell");
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
        bgImageUrl: bgImageUrl.trim() || null,
        surfaceColor: surface.trim(), textColor: text.trim(), fontFamily: font,
        socialLinks: socials.filter((x) => x.url.trim()),
        timezone: timezone.trim(),
        companionDefaultName: companionName.trim(),
        supportAlertMode: alertMode,
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
        {/* Paleta portalu + KONTROLA KONTRASTU. Sedno: próbka koloru pokazuje, czy kolor jest ładny;
            ten pasek pokazuje, czy tekst będzie CZYTELNY — i to jest informacja, której brakowało. */}
        <PaletteRow
          t={t}
          brand={color}
          surface={surface}
          text={text}
          font={font}
          onSurface={setSurface}
          onText={setText}
          onFont={setFont}
        />
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
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : brandColor} onChange={(e) => setColor(e.target.value)} className="w-9 h-9 bg-transparent border border-zinc-800 shrink-0" aria-label={t("color")} />
              <input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1 min-w-0 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-red-500" />
            </div>
          </div>
          <FieldInput label={t("handle")} value={handle} onChange={setHandle} placeholder="@nick" />
        </div>
        <FieldInput label={t("logoUrl")} value={logoUrl} onChange={setLogoUrl} placeholder="https://…" />
        {logoUrl.trim() && <img src={logoUrl} alt="" className="w-16 h-16 object-contain border border-zinc-800 bg-black rounded" loading="lazy" decoding="async" />}

        {/* Portal background (#audit3): the streamer self-serves what only the platform owner
            (Tenants.tsx) could set before — a curated preset OR a custom image URL. Persisted in
            the SAME Tenant.bgImageUrl column via the "preset:<id>" scheme (no schema change). */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{ta("tntBgPreset")}</label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setBgImageUrl("")}
              className={`px-2 py-1 text-[10px] font-bold uppercase tracking-widest border ${!bgImageUrl ? "border-red-500 text-red-300" : "border-zinc-800 text-zinc-500 hover:border-zinc-600"}`}
            >
              {ta("tntBgNone")}
            </button>
            {BG_PRESETS.map((p) => {
              const active = bgPresetId(bgImageUrl) === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setBgImageUrl(bgPresetValue(p.id))}
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
        <FieldInput label={ta("tntBgImage")} value={bgImageUrl} onChange={setBgImageUrl} placeholder="https://…/bg.jpg" />
        {/* Upload własnej grafiki tła (update 2026-08): wgrany plik ustawia bgImageUrl na publiczny
            URL z Supabase Storage. Obrazy — duże wideo pójdzie ścieżką signed-URL (patrz /api/upload). */}
        <div className="mt-1.5">
          <MediaUploadButton onUploaded={(url) => setBgImageUrl(url)} onError={(m) => onToast("err", m)} />
        </div>
        {/* Live preview — resolve a preset to its gradient, else treat an http(s) value as a CSS
            image (same read semantics the portal uses); anything else (e.g. a half-typed URL) shows nothing. */}
        {(() => {
          const trimmed = bgImageUrl.trim();
          const bg = resolveBgPresetCss(trimmed) ?? (/^https?:\/\//i.test(trimmed) ? `url("${trimmed}")` : null);
          return bg ? (
            <div
              className="h-16 rounded border border-zinc-800"
              style={{ backgroundImage: bg, backgroundSize: "cover", backgroundPosition: "center" }}
              aria-hidden
            />
          ) : null;
        })()}
      </div>

      {/* Pola, które do tej pory ustawiał WYŁĄCZNIE właściciel platformy. `socialLinks` jest
          jedynym źródłem przycisku „oglądaj na żywo" i kafelków /hub, więc bez nich portal
          streamera pokazywał socjale założyciela. */}
      <div className="mt-4 pt-4 border-t border-zinc-900 space-y-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("portalTitle")}</div>

        <div>
          <div className="text-[10px] text-zinc-500 mb-1.5">{t("socials")}</div>
          <div className="space-y-1.5">
            {socials.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <select
                  value={s.platform}
                  onChange={(e) => setSocials((a) => a.map((x, j) => (j === i ? { ...x, platform: e.target.value } : x)))}
                  className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600 w-28"
                >
                  {SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <input
                  value={s.url}
                  placeholder="https://…"
                  onChange={(e) => setSocials((a) => a.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                  className="flex-1 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600"
                />
                <button
                  type="button"
                  onClick={() => setSocials((a) => a.filter((_, j) => j !== i))}
                  title={t("socialRemove")}
                  className="shrink-0 text-zinc-600 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-7 h-7 flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {socials.length < 12 && (
              <button
                type="button"
                onClick={() => setSocials((a) => [...a, { platform: "discord", url: "" }])}
                className="text-[10px] font-mono uppercase tracking-widest border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 px-2.5 py-1.5 inline-flex items-center gap-1.5"
              >
                <Plus className="w-3 h-3" /> {t("socialAdd")}
              </button>
            )}
          </div>
          <p className="text-[10px] text-zinc-600 mt-1">{t("socialsHint")}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-[10px] text-zinc-500 flex flex-col gap-1">{t("timezone")}
            <input value={timezone} placeholder="Europe/Warsaw" onChange={(e) => setTimezone(e.target.value)} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
            <span className="text-[10px] text-zinc-600">{t("timezoneHint")}</span>
          </label>
          <label className="text-[10px] text-zinc-500 flex flex-col gap-1">{t("companionName")}
            <input value={companionName} maxLength={30} onChange={(e) => setCompanionName(e.target.value)} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
            <span className="text-[10px] text-zinc-600">{t("companionNameHint")}</span>
          </label>
        </div>

        <label className="text-[10px] text-zinc-500 flex flex-col gap-1">{t("alertMode")}
          <select value={alertMode} onChange={(e) => setAlertMode(e.target.value)} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600">
            <option value="none">{t("alertModeNone")}</option>
            <option value="bell">{t("alertModeBell")}</option>
            <option value="overlay">{t("alertModeOverlay")}</option>
            <option value="both">{t("alertModeBoth")}</option>
          </select>
          <span className="text-[10px] text-zinc-600">{t("alertModeHint")}</span>
        </label>
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

/** Jedna para „kolor + odczyt kontrastu". Wyliczenie jest czyste (lib/brand-palette), więc panel
 *  mówi to samo, co zobaczy widz — bez zgadywania i bez renderowania próbnej strony. */
function ContrastBadge({ tlo, tekst, etykieta }: { tlo: string; tekst: string; etykieta: string }) {
  const r = contrastRatio(tlo, tekst);
  if (r === null) return null;
  const poziom = wcagLevel(r);
  const ok = poziom === "AAA" || poziom === "AA";
  return (
    <span
      className={`text-[10px] font-mono px-1.5 py-0.5 border ${ok ? "border-emerald-800 text-emerald-400" : "border-amber-700 text-amber-300"}`}
      title={etykieta}
    >
      {etykieta} {r.toFixed(1)}:1 · {poziom}
    </span>
  );
}

function PaletteRow({
  t, brand, surface, text, font, onSurface, onText, onFont,
}: {
  t: (k: string) => string;
  brand: string; surface: string; text: string; font: string;
  onSurface: (v: string) => void; onText: (v: string) => void; onFont: (v: string) => void;
}) {
  // Puste pole = kolor z motywu; do LICZENIA kontrastu podstawiamy wtedy domyślne ciemne tło
  // i biały tekst, czyli to, co portal realnie pokaże — inaczej pasek milczałby akurat wtedy,
  // gdy najbardziej się przydaje (świeży portal, nic nie ustawione).
  const tloDoOceny = surface.trim() || "#0a0a0a";
  const tekstDoOceny = text.trim() || "#ffffff";
  return (
    <div className="border border-zinc-800 bg-black/30 p-2 space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("paletteHeading")}</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("surfaceColor")}</label>
          <input value={surface} onChange={(e) => onSurface(e.target.value)} placeholder={t("themeDefault")} className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-red-500" />
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("textColor")}</label>
          <input value={text} onChange={(e) => onText(e.target.value)} placeholder={t("themeDefault")} className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-red-500" />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("font")}</label>
        <select value={font} onChange={(e) => onFont(e.target.value)} className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white outline-hidden focus:border-red-500">
          <option value="">{t("themeDefault")}</option>
          {PORTAL_FONTS.map((f) => (
            <option key={f.id} value={f.id}>{t(`font_${f.id}`)}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ContrastBadge tlo={tloDoOceny} tekst={tekstDoOceny} etykieta={t("cTextOnSurface")} />
        <ContrastBadge tlo={tloDoOceny} tekst={brand} etykieta={t("cBrandOnSurface")} />
      </div>
      <p className="text-[10px] text-zinc-600">{t("contrastHint")}</p>
    </div>
  );
}

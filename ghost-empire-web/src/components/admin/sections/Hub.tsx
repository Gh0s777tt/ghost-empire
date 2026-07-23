"use client";
// src/components/admin/sections/Hub.tsx
// Owner self-serve editor for the portal's link-in-bio "Hub" (#hub) — toggle the public /hub page,
// write a bio, and curate an ordered list of link buttons. Saves through the same owner-scoped,
// Elite-gated PATCH /api/onboarding/my as branding (Appearance.tsx). Copy is inline PL/EN (like
// GamblingGate) to avoid touching 14 locale files for one MVP section. The /hub page re-validates
// every field server-side, so this form is just a friendly editor over that safe pipeline.
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Link2, Loader2, Check, Plus, Trash2, ArrowUp, ArrowDown, ExternalLink, Lock } from "lucide-react";
import { apiGet, apiPatch, ApiError } from "@/lib/api-client";
import { HUB_MAX_LINKS, HUB_LABEL_MAX, HUB_BIO_MAX, type HubLink } from "@/lib/hub";
import { SectionCard, FieldInput } from "../shared";

type MyTenant = {
  slug: string; effectivePlan: string;
  hubEnabled?: boolean; hubBio?: string | null; hubLinks?: HubLink[];
};

const T = {
  pl: {
    title: "Hub — strona z linkami", loading: "Ładowanie…", notOwner: "Ta sekcja jest dla właściciela portalu.",
    intro: "Publiczna strona z Twoimi linkami (jak Linktree) — wrzuć ją w bio na Twitchu/Instagramie. Automatycznie w barwach Twojego portalu.",
    eliteNote: "Hub jest częścią personalizacji portalu (plan Elite).", eliteCta: "Zobacz Elite",
    enable: "Włącz publiczną stronę", enableHint: "Gdy wyłączone, /hub zwraca 404.",
    bio: "Bio (krótki opis)", linksTitle: "Linki", label: "Etykieta", url: "Adres (https://…)", icon: "Ikona (emoji)",
    add: "Dodaj link", empty: "Brak linków — dodaj pierwszy.", save: "Zapisz Hub", saved: "Zapisano ✓", saveErr: "Nie udało się zapisać",
    preview: "Podgląd", max: `Maks. ${HUB_MAX_LINKS} linków`,
  },
  en: {
    title: "Hub — link-in-bio page", loading: "Loading…", notOwner: "This section is for the portal owner.",
    intro: "A public page with all your links (Linktree-style) — drop it in your Twitch/Instagram bio. Automatically in your portal's colours.",
    eliteNote: "The Hub is part of portal personalisation (Elite plan).", eliteCta: "See Elite",
    enable: "Enable the public page", enableHint: "When off, /hub returns 404.",
    bio: "Bio (short description)", linksTitle: "Links", label: "Label", url: "URL (https://…)", icon: "Icon (emoji)",
    add: "Add link", empty: "No links yet — add the first one.", save: "Save Hub", saved: "Saved ✓", saveErr: "Couldn't save",
    preview: "Preview", max: `Max ${HUB_MAX_LINKS} links`,
  },
} as const;

export function HubManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void; onSuccess?: () => void; pending?: boolean }) {
  const locale = useLocale();
  const t = locale.startsWith("pl") ? T.pl : T.en;
  const [tenant, setTenant] = useState<MyTenant | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [bio, setBio] = useState("");
  const [links, setLinks] = useState<HubLink[]>([]);

  useEffect(() => {
    apiGet<{ tenant: MyTenant | null }>("/api/onboarding/my")
      .then((d) => {
        setTenant(d.tenant);
        if (d.tenant) {
          setEnabled(Boolean(d.tenant.hubEnabled));
          setBio(d.tenant.hubBio ?? "");
          setLinks(d.tenant.hubLinks ?? []);
        }
      })
      .catch(() => setTenant(null));
  }, []);

  if (tenant === undefined) {
    return <SectionCard title={t.title} icon={Link2}><div className="text-zinc-500 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t.loading}</div></SectionCard>;
  }
  if (!tenant) {
    return <SectionCard title={t.title} icon={Link2}><p className="text-zinc-500 text-sm">{t.notOwner}</p></SectionCard>;
  }

  const canEdit = tenant.effectivePlan === "elite";

  const setLink = (i: number, patch: Partial<HubLink>) => setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLink = () => setLinks((ls) => (ls.length >= HUB_MAX_LINKS ? ls : [...ls, { id: crypto.randomUUID(), label: "", url: "" }]));
  const removeLink = (i: number) => setLinks((ls) => ls.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) =>
    setLinks((ls) => {
      const j = i + dir;
      if (j < 0 || j >= ls.length) return ls;
      const next = [...ls];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function save() {
    setSaving(true);
    try {
      // Send only well-formed links; the server re-validates anyway (parseHubLinks).
      const clean = links.filter((l) => l.label.trim() && /^https?:\/\//i.test(l.url.trim()));
      await apiPatch("/api/onboarding/my", { hubEnabled: enabled, hubBio: bio.trim() || null, hubLinks: clean });
      onToast("ok", t.saved);
    } catch (e) {
      onToast("err", e instanceof ApiError ? e.message : t.saveErr);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title={t.title} icon={Link2}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-zinc-500 text-xs">{t.intro}</p>
        <a href="/hub" target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold tracking-wider text-zinc-400 hover:text-red-400">
          {t.preview} <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {!canEdit && (
        <div className="mb-4 border border-amber-900/40 bg-amber-950/20 px-3 py-2.5 flex items-start gap-2">
          <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-[12px] text-amber-200/90">{t.eliteNote}{" "}<a href="/premium" className="underline inline-flex items-center gap-0.5">{t.eliteCta} <ExternalLink className="w-3 h-3" /></a></div>
        </div>
      )}

      {/* Enable toggle */}
      <label className="flex items-center gap-3 mb-4 cursor-pointer select-none">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!canEdit} className="w-4 h-4 accent-red-600" />
        <span className="text-sm text-white font-semibold">{t.enable}</span>
        <span className="text-[11px] text-zinc-500">— {t.enableHint}</span>
      </label>

      <div className="mb-4">
        <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t.bio}</label>
        <textarea
          value={bio} onChange={(e) => setBio(e.target.value)} maxLength={HUB_BIO_MAX} disabled={!canEdit} rows={2}
          className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white outline-hidden focus:border-red-500 resize-none disabled:opacity-50"
        />
      </div>

      {/* Links */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold tracking-widest uppercase text-zinc-400">{t.linksTitle}</h4>
        <span className="text-[10px] text-zinc-600 font-mono">{links.length}/{HUB_MAX_LINKS}</span>
      </div>
      <div className="space-y-2">
        {links.map((l, i) => (
          <div key={l.id} className="border border-zinc-800 bg-black/30 p-2.5 flex items-start gap-2">
            <div className="flex flex-col gap-1 pt-5">
              <button onClick={() => move(i, -1)} disabled={i === 0 || !canEdit} className="text-zinc-500 hover:text-white disabled:opacity-30" aria-label="up"><ArrowUp className="w-3.5 h-3.5" /></button>
              <button onClick={() => move(i, 1)} disabled={i === links.length - 1 || !canEdit} className="text-zinc-500 hover:text-white disabled:opacity-30" aria-label="down"><ArrowDown className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_1fr_5rem] gap-2">
              <FieldInput label={t.label} value={l.label} onChange={(v) => setLink(i, { label: v.slice(0, HUB_LABEL_MAX) })} />
              <FieldInput label={t.url} value={l.url} onChange={(v) => setLink(i, { url: v })} placeholder="https://…" />
              <FieldInput label={t.icon} value={l.icon ?? ""} onChange={(v) => setLink(i, { icon: v })} placeholder="🔗" />
            </div>
            <button onClick={() => removeLink(i)} disabled={!canEdit} className="text-zinc-600 hover:text-red-400 disabled:opacity-30 pt-5" aria-label="remove"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {links.length === 0 && <p className="text-center text-sm text-zinc-500 py-4">{t.empty}</p>}
      </div>

      <button onClick={addLink} disabled={!canEdit || links.length >= HUB_MAX_LINKS} className="w-full mt-2 px-3 py-2 border border-zinc-800 hover:border-zinc-600 text-zinc-300 text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-1.5 disabled:opacity-40">
        <Plus className="w-3.5 h-3.5" /> {t.add}
      </button>

      <button
        onClick={() => void save()}
        disabled={saving || !canEdit}
        className="w-full mt-4 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {t.save}
      </button>
    </SectionCard>
  );
}

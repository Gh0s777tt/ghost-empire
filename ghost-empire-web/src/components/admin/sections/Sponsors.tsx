"use client";
// src/components/admin/sections/Sponsors.tsx
// Manage per-portal sponsors/partners shown on the public /support page (#538).
// Per-tenant. Data via /api/admin/sponsors.
import { useState, useEffect, useCallback } from "react";
import { Handshake, Loader2, Trash2, Plus, Eye, EyeOff, Star, ArrowUp, ArrowDown, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type Sponsor = {
  id: string; name: string; url: string; logoUrl: string | null;
  note: string | null; tier: string | null; featured: boolean; active: boolean; sortOrder: number;
};

export function SponsorsManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.sponsors");
  const [loading, setLoading] = useState(true);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // create form
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [note, setNote] = useState("");
  const [tier, setTier] = useState("");
  const [featured, setFeatured] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ sponsors: Sponsor[] }>("/api/admin/sponsors");
      setSponsors(d.sponsors);
    } catch { /* keep */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function call(action: string, payload: Record<string, unknown>): Promise<boolean> {
    try { await apiPost("/api/admin/sponsors", { action, ...payload }); return true; }
    catch (e) { onToast("err", e instanceof ApiError ? e.message : t("err")); return false; }
  }

  async function create() {
    setBusy("create");
    if (await call("create", { name: name.trim(), url: url.trim(), logoUrl: logoUrl.trim(), note: note.trim(), tier: tier.trim(), featured })) {
      onToast("ok", t("created"));
      setName(""); setUrl(""); setLogoUrl(""); setNote(""); setTier(""); setFeatured(false);
      await load();
    }
    setBusy(null);
  }
  async function patch(s: Sponsor, data: Record<string, unknown>) {
    setBusy(s.id);
    if (await call("update", { id: s.id, name: s.name, url: s.url, logoUrl: s.logoUrl, note: s.note, tier: s.tier, featured: s.featured, active: s.active, ...data })) await load();
    setBusy(null);
  }
  async function remove(s: Sponsor) {
    if (!confirm(t("deleteConfirm", { name: s.name }))) return;
    setBusy(s.id); if (await call("delete", { id: s.id })) { onToast("ok", t("deleted")); await load(); } setBusy(null);
  }
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= sponsors.length) return;
    const next = [...sponsors];
    [next[i], next[j]] = [next[j], next[i]];
    setSponsors(next);
    await call("reorder", { ids: next.map((s) => s.id) });
  }

  return (
    <SectionCard title={t("title")} icon={Handshake}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro")} <a href="/support" target="_blank" rel="noreferrer" className="text-red-400 hover:text-red-300 inline-flex items-center gap-0.5">/support <ExternalLink className="w-3 h-3" /></a></p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : (
        <div className="space-y-2 mb-4">
          {sponsors.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">{t("empty")}</div>
          ) : sponsors.map((s, i) => (
            <div key={s.id} className={`flex items-center gap-2 border p-2.5 ${s.active ? "border-zinc-800 bg-black/30" : "border-zinc-900 bg-black/20 opacity-60"}`}>
              <div className="flex flex-col shrink-0">
                <button onClick={() => void move(i, -1)} disabled={i === 0} className="text-zinc-600 hover:text-white disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
                <button onClick={() => void move(i, 1)} disabled={i === sponsors.length - 1} className="text-zinc-600 hover:text-white disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
              </div>
              {s.logoUrl
                ? <img src={s.logoUrl} alt="" className="w-8 h-8 rounded object-contain bg-white/5 shrink-0" loading="lazy" decoding="async" />
                : <span className="w-8 h-8 rounded bg-zinc-800 shrink-0 inline-flex items-center justify-center text-zinc-500"><Handshake className="w-4 h-4" /></span>}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate flex items-center gap-1.5">
                  {s.name}
                  {s.tier && <span className="text-[10px] font-mono text-amber-400/80 uppercase">{s.tier}</span>}
                  {s.featured && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                </div>
                <div className="text-[10px] text-zinc-600 font-mono truncate">{s.url}</div>
              </div>
              <button onClick={() => void patch(s, { featured: !s.featured })} disabled={busy === s.id} title={t("featuredTitle")} className={`shrink-0 border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center ${s.featured ? "text-amber-400" : "text-zinc-600 hover:text-white"}`}><Star className="w-3 h-3" /></button>
              <button onClick={() => void patch(s, { active: !s.active })} disabled={busy === s.id} title={s.active ? t("disable") : t("enable")} className="shrink-0 text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center">{s.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}</button>
              <button onClick={() => void remove(s)} disabled={busy === s.id} title={t("deleteTitle")} className="shrink-0 text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-6 h-6 flex items-center justify-center"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}

      <div className="border border-zinc-800 bg-black/30 p-3 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("addTitle")}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={name} maxLength={80} placeholder={t("phName")} onChange={(e) => setName(e.target.value)} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
          <input value={tier} maxLength={24} placeholder={t("phTier")} onChange={(e) => setTier(e.target.value)} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
        </div>
        <input value={url} placeholder={t("phUrl")} onChange={(e) => setUrl(e.target.value)} className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600" />
        <input value={logoUrl} placeholder={t("phLogo")} onChange={(e) => setLogoUrl(e.target.value)} className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600" />
        <input value={note} maxLength={120} placeholder={t("phNote")} onChange={(e) => setNote(e.target.value)} className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="accent-amber-500" /> {t("featuredLabel")}
          </label>
          <button onClick={() => void create()} disabled={busy === "create" || !name.trim() || !url.trim()} className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center gap-1.5">
            {busy === "create" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} {t("addBtn")}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

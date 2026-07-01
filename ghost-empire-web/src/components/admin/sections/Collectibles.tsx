"use client";
// src/components/admin/sections/Collectibles.tsx
// Manage the collectible-cards catalog (#551) shown on /collectibles. Per-tenant.
import { useState, useEffect, useCallback } from "react";
import { Sparkles, Loader2, Trash2, Plus, Eye, EyeOff, ExternalLink, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard, ListSearch } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { filterByText } from "@/lib/list-filter";
import { RARITIES, RARITY_COLOR, normalizeRarity, type Rarity } from "@/lib/collectibles";

type Card = { id: string; name: string; description: string | null; rarity: string; emoji: string | null; imageUrl: string | null; active: boolean };

export function CollectiblesManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.collectibles");
  const tc = useTranslations("common");
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<Card[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Collapsed-by-rarity groups (#audit3 UX) — open by default, click a rarity header to fold it.
  const [closedR, setClosedR] = useState<Record<string, boolean>>({});
  // create form
  const [name, setName] = useState("");
  const [rarity, setRarity] = useState<Rarity>("common");
  const [emoji, setEmoji] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    try { const d = await apiGet<{ cards: Card[] }>("/api/admin/collectibles"); setCards(d.cards); } catch { /* keep */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function call(action: string, payload: Record<string, unknown>): Promise<boolean> {
    try { await apiPost("/api/admin/collectibles", { action, ...payload }); return true; }
    catch (e) { onToast("err", e instanceof ApiError ? e.message : t("err")); return false; }
  }
  async function create() {
    setBusy("create");
    if (await call("create", { name: name.trim(), rarity, emoji: emoji.trim(), imageUrl: imageUrl.trim(), description: description.trim() })) {
      onToast("ok", t("created"));
      setName(""); setEmoji(""); setImageUrl(""); setDescription(""); setRarity("common");
      await load();
    }
    setBusy(null);
  }
  async function patch(c: Card, data: Record<string, unknown>) {
    setBusy(c.id);
    if (await call("update", { id: c.id, name: c.name, description: c.description, rarity: c.rarity, emoji: c.emoji, imageUrl: c.imageUrl, active: c.active, ...data })) await load();
    setBusy(null);
  }
  async function remove(c: Card) {
    if (!confirm(t("deleteConfirm", { name: c.name }))) return;
    setBusy(c.id); if (await call("delete", { id: c.id })) { onToast("ok", t("deleted")); await load(); } setBusy(null);
  }

  return (
    <SectionCard title={t("title")} icon={Sparkles}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro")} <a href="/collectibles" target="_blank" rel="noreferrer" className="text-red-400 hover:text-red-300 inline-flex items-center gap-0.5">/collectibles <ExternalLink className="w-3 h-3" /></a></p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : (
        <div className="space-y-2 mb-4">
          {cards.length > 8 && (
            <ListSearch value={query} onChange={setQuery} placeholder={tc("searchPlaceholder")} shown={filterByText(cards, query, (c) => [c.name, c.description, c.rarity]).length} total={cards.length} />
          )}
          {cards.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">{t("empty")}</div>
          ) : (() => {
            const filtered = filterByText(cards, query, (c) => [c.name, c.description, c.rarity]);
            if (filtered.length === 0) return <p className="text-zinc-600 text-sm py-1">{tc("noResults")}</p>;
            return RARITIES.filter((r) => filtered.some((c) => normalizeRarity(c.rarity) === r)).map((r) => {
              const group = filtered.filter((c) => normalizeRarity(c.rarity) === r);
              const open = !closedR[r];
              return (
                <div key={r} className="border border-zinc-900 bg-black/20">
                  <button
                    type="button"
                    onClick={() => setClosedR((o) => ({ ...o, [r]: !o[r] }))}
                    aria-expanded={open}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-start hover:bg-white/2 transition-colors"
                  >
                    <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: RARITY_COLOR[r] }}>{t(`rarity_${r}`)}</span>
                    <span className="text-[10px] text-zinc-600 flex-1">{group.length}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <div className="max-h-72 overflow-y-auto px-2 pb-2 space-y-2">
                      {group.map((c) => (
                        <div key={c.id} className={`flex items-center gap-2 border p-2.5 ${c.active ? "border-zinc-800 bg-black/30" : "border-zinc-900 bg-black/20 opacity-60"}`}>
                          <span className="text-xl shrink-0 w-7 text-center">{c.imageUrl ? <img src={c.imageUrl} alt="" className="w-7 h-7 object-contain inline" loading="lazy" decoding="async" /> : c.emoji || "🃏"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate">{c.name}</div>
                            <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: RARITY_COLOR[normalizeRarity(c.rarity)] }}>{t(`rarity_${normalizeRarity(c.rarity)}`)}</div>
                          </div>
                          <button onClick={() => void patch(c, { active: !c.active })} disabled={busy === c.id} title={c.active ? t("disable") : t("enable")} className="shrink-0 text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center">{c.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}</button>
                          <button onClick={() => void remove(c)} disabled={busy === c.id} title={t("deleteTitle")} className="shrink-0 text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-6 h-6 flex items-center justify-center"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}

      <div className="border border-zinc-800 bg-black/30 p-3 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("addTitle")}</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input value={name} maxLength={60} placeholder={t("phName")} onChange={(e) => setName(e.target.value)} className="sm:col-span-2 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
          <select value={rarity} onChange={(e) => setRarity(e.target.value as Rarity)} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600">
            {RARITIES.map((r) => <option key={r} value={r} className="bg-zinc-950">{t(`rarity_${r}`)}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={emoji} maxLength={8} placeholder={t("phEmoji")} onChange={(e) => setEmoji(e.target.value)} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
          <input value={imageUrl} placeholder={t("phImage")} onChange={(e) => setImageUrl(e.target.value)} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600" />
        </div>
        <input value={description} maxLength={300} placeholder={t("phDesc")} onChange={(e) => setDescription(e.target.value)} className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
        <div className="flex justify-end">
          <button onClick={() => void create()} disabled={busy === "create" || !name.trim()} className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center gap-1.5">
            {busy === "create" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} {t("addBtn")}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

"use client";
// src/components/admin/sections/Achievements.tsx — lazily-loaded achievements
// manager + editor (admin CRUD + manual award).
import { useState, useEffect } from "react";
import { Award, Plus, Loader2, Pencil, Trash2, X, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard, FieldInput, FieldTextarea } from "../shared";
import { useTenantBranding } from "@/components/TenantBranding";

type AchRow = {
  id: string; code: string; name: string; description: string; icon: string;
  rarity: string; hidden: boolean; triggerType: string | null; triggerValue: number | null;
  xpReward: number; tokenReward: number; rewardNote: string | null; earnedCount: number;
};

const RARITY_COLOR: Record<string, string> = {
  common: "#a1a1aa", rare: "#3b82f6", epic: "#a855f7", legendary: "#fbbf24",
};

export function AchievementsManager({
  onToast,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.achievements");
  const { tokenSymbol } = useTenantBranding();
  const [list, setList] = useState<AchRow[]>([]);
  const [rarities, setRarities] = useState<string[]>([]);
  const [triggerTypes, setTriggerTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AchRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [awardTarget, setAwardTarget] = useState("");
  const [awardCode, setAwardCode] = useState("");

  async function load() {
    try {
      const r = await fetch("/api/admin/achievements");
      if (r.ok) {
        const d = await r.json();
        setList(d.achievements ?? []);
        setRarities(d.rarities ?? []);
        setTriggerTypes(d.triggerTypes ?? []);
      }
    } catch { /* keep current */ } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function call(payload: Record<string, unknown>, okMsg?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/achievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { onToast("err", data.error ?? t("err")); return false; }
      if (okMsg) onToast("ok", okMsg);
      return true;
    } catch { onToast("err", t("netErr")); return false; }
    finally { setBusy(false); }
  }

  async function award() {
    if (!awardTarget.trim() || !awardCode) return;
    if (await call({ action: "award", target: awardTarget.trim(), code: awardCode }, t("awarded"))) {
      setAwardTarget("");
      await load();
    }
  }

  return (
    <SectionCard title={t("title")} icon={Award}>
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 leading-relaxed">
          {t.rich("intro", { b: (c) => <strong className="text-zinc-300">{c}</strong> })}
        </p>

        {/* Manual award */}
        <div className="border border-zinc-800 bg-black/30 p-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">{t("grantHeading")}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <FieldInput label={t("userLabel")} value={awardTarget} onChange={setAwardTarget} placeholder="gh0s77tt" />
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("achievementLabel")}</label>
              <select value={awardCode} onChange={(e) => setAwardCode(e.target.value)} className="w-full bg-black border border-zinc-800 px-3 py-2 text-sm text-white outline-hidden focus:border-red-500">
                <option value="">{t("selectPlaceholder")}</option>
                {list.map((a) => <option key={a.id} value={a.code}>{a.icon} {a.name}</option>)}
              </select>
            </div>
            <button onClick={award} disabled={busy || !awardTarget.trim() || !awardCode}
              className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              <Award className="w-3.5 h-3.5" /> {t("grantBtn")}
            </button>
          </div>
        </div>

        <button onClick={() => { setCreating(true); setEditing(null); }}
          className="w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2">
          <Plus className="w-3.5 h-3.5" /> {t("newAchievement")}
        </button>

        {/* List */}
        {loading ? (
          <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
        ) : (
          <div className="space-y-1 max-h-[420px] overflow-y-auto">
            {list.length === 0 && <p className="text-zinc-600 text-sm">{t("empty")}</p>}
            {list.map((a) => (
              <div key={a.id} className="flex items-center gap-3 border border-zinc-800 bg-zinc-950 px-3 py-2">
                <span className="text-xl shrink-0">{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white truncate">{a.name}</span>
                    <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 border" style={{ color: RARITY_COLOR[a.rarity] ?? "#a1a1aa", borderColor: (RARITY_COLOR[a.rarity] ?? "#a1a1aa") + "55" }}>{a.rarity}</span>
                    {a.hidden && <span className="text-[9px] font-mono uppercase text-zinc-600">{t("hidden")}</span>}
                    {a.rewardNote && <span className="text-[9px] text-amber-300" title={a.rewardNote}>{t("rewardBadge")}</span>}
                  </div>
                  <div className="text-[10px] font-mono text-zinc-500 truncate">
                    {a.code} · {a.triggerType}{a.triggerValue != null ? ` ≥ ${a.triggerValue}` : ""} · {a.tokenReward} {tokenSymbol} · {t("earnedWord")} ×{a.earnedCount}
                  </div>
                </div>
                <button onClick={() => { setEditing(a); setCreating(false); }} disabled={busy} title={t("editTitle")} className="text-zinc-500 hover:text-white"><Pencil className="w-3.5 h-3.5" /></button>
                <button
                  onClick={async () => { if (window.confirm(t("deleteConfirm", { name: a.name })) && await call({ action: "delete", id: a.id }, t("deleted"))) await load(); }}
                  disabled={busy} title={t("deleteTitle")} className="text-zinc-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {(creating || editing) && (
        <AchievementEditor
          achievement={editing}
          isNew={creating}
          rarities={rarities}
          triggerTypes={triggerTypes}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); void load(); }}
          onToast={onToast}
        />
      )}
    </SectionCard>
  );
}

function AchievementEditor({
  achievement, isNew, rarities, triggerTypes, onClose, onSaved, onToast,
}: {
  achievement: AchRow | null;
  isNew: boolean;
  rarities: string[];
  triggerTypes: string[];
  onClose: () => void;
  onSaved: () => void;
  onToast: (k: "ok" | "err", m: string) => void;
}) {
  const t = useTranslations("admin.achievements");
  const [code, setCode] = useState(achievement?.code ?? "");
  const [name, setName] = useState(achievement?.name ?? "");
  const [description, setDescription] = useState(achievement?.description ?? "");
  const [icon, setIcon] = useState(achievement?.icon ?? "🏆");
  const [rarity, setRarity] = useState(achievement?.rarity ?? "common");
  const [triggerType, setTriggerType] = useState(achievement?.triggerType ?? "manual");
  const [triggerValue, setTriggerValue] = useState(achievement?.triggerValue?.toString() ?? "");
  const [xpReward, setXpReward] = useState(achievement?.xpReward?.toString() ?? "0");
  const [tokenReward, setTokenReward] = useState(achievement?.tokenReward?.toString() ?? "0");
  const [rewardNote, setRewardNote] = useState(achievement?.rewardNote ?? "");
  const [hidden, setHidden] = useState(achievement?.hidden ?? false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const fields = { name, description, icon, rarity, triggerType, triggerValue, xpReward, tokenReward, rewardNote, hidden };
      const payload: Record<string, unknown> = isNew
        ? { action: "create", code, ...fields }
        : { action: "update", id: achievement!.id, ...fields };
      const res = await fetch("/api/admin/achievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { onToast("err", data.error ?? t("err")); }
      else { onToast("ok", isNew ? t("created") : t("saved")); onSaved(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t("editorAria")} className="bg-zinc-950 border-2 border-zinc-800 max-w-2xl w-full p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl text-white tracking-wider">{isNew ? t("editorNew") : t("editorEdit")}</h3>
          <button onClick={onClose} disabled={busy} className="text-zinc-500 hover:text-red-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {isNew ? (
              <FieldInput label={t("codeLabel")} value={code} onChange={setCode} placeholder={t("codePh")} />
            ) : (
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("codeLabelShort")}</label>
                <div className="bg-black/50 border border-zinc-900 px-3 py-2 text-sm text-zinc-500 font-mono truncate">{code}</div>
              </div>
            )}
            <FieldInput label={t("emojiLabel")} value={icon} onChange={setIcon} placeholder="🏆" />
            <div className="col-span-2">
              <FieldInput label={t("nameLabel")} value={name} onChange={setName} placeholder={t("namePh")} />
            </div>
          </div>

          <FieldTextarea label={t("descLabel")} value={description} onChange={setDescription} />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("rarityLabel")}</label>
              <select value={rarity} onChange={(e) => setRarity(e.target.value)} className="w-full bg-black border border-zinc-800 px-3 py-2 text-sm text-white outline-hidden focus:border-red-500">
                {rarities.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("triggerLabel")}</label>
              <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className="w-full bg-black border border-zinc-800 px-3 py-2 text-sm text-white outline-hidden focus:border-red-500">
                {triggerTypes.map((tt) => <option key={tt} value={tt}>{tt}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <FieldInput label={t("thresholdLabel")} value={triggerValue} onChange={setTriggerValue} type="number" placeholder={t("thresholdPh")} />
            <FieldInput label={t("xpLabel")} value={xpReward} onChange={setXpReward} type="number" />
            <FieldInput label={t("gtLabel")} value={tokenReward} onChange={setTokenReward} type="number" />
          </div>

          <FieldInput label={t("rewardNoteLabel")} value={rewardNote} onChange={setRewardNote} placeholder={t("rewardNotePh")} />

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="accent-zinc-500" />
            <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">{t("hiddenLabel")}</span>
          </label>

          <button onClick={save} disabled={busy || !name.trim() || (isNew && !code.trim())}
            className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {isNew ? t("createBtn") : t("saveBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}

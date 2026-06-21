"use client";
// src/components/admin/sections/GamesLibrary.tsx
// Configure the SteamID, sync the owned-games library, and hide/show individual games.
import { useCallback, useEffect, useState } from "react";
import { Gamepad2, Loader2, RefreshCw, Check, Eye, EyeOff } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type Data = {
  steamId: string | null;
  steamSyncedAt: string | null;
  psnSyncedAt: string | null;
  xboxSyncedAt: string | null;
  hasKey: boolean;
  hasNpsso: boolean;
  hasPsnNpsso: boolean;
  hasXboxKey: boolean;
  count: number;
  totalHours: number;
  games: Array<{ id: string; source: string; name: string; imageUrl: string | null; hours: number; hidden: boolean }>;
};

export function GamesLibraryManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.gamesLibrary");
  const nf = useLocale();
  const [data, setData] = useState<Data | null>(null);
  const [steamInput, setSteamInput] = useState("");
  const [psnInput, setPsnInput] = useState("");
  const [xboxInput, setXboxInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<Data>("/api/admin/games");
      setData(d);
      setSteamInput(d.steamId ?? "");
    } catch { /* keep current */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function call(payload: Record<string, unknown>): Promise<unknown | null> {
    try {
      return await apiPost<unknown>("/api/admin/games", payload);
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
      return null;
    }
  }

  async function saveSteamId() {
    setBusy("save");
    const r = (await call({ action: "set_steam_id", steamId: steamInput.trim() })) as { steamId?: string } | null;
    if (r) { onToast("ok", r.steamId ? t("steamIdSet", { id: r.steamId }) : t("steamIdCleared")); await load(); }
    setBusy(null);
  }

  async function sync() {
    setBusy("sync");
    const r = (await call({ action: "sync" })) as { synced?: number; removed?: number } | null;
    if (r) { onToast("ok", t("steamSynced", { count: r.synced ?? 0 })); await load(); onSuccess(); }
    setBusy(null);
  }

  async function savePsnNpsso() {
    setBusy("psnNpsso");
    const r = (await call({ action: "set_psn_npsso", npsso: psnInput.trim() })) as { hasPsnNpsso?: boolean } | null;
    if (r) { onToast("ok", r.hasPsnNpsso ? t("psnNpssoSet") : t("psnNpssoCleared")); setPsnInput(""); await load(); }
    setBusy(null);
  }

  async function syncPsn() {
    setBusy("psn");
    const r = (await call({ action: "sync_psn" })) as { synced?: number } | null;
    if (r) { onToast("ok", t("psnSynced", { count: r.synced ?? 0 })); await load(); onSuccess(); }
    setBusy(null);
  }

  async function saveXboxKey() {
    setBusy("xboxKey");
    const r = (await call({ action: "set_xbox_key", xboxKey: xboxInput.trim() })) as { hasXboxKey?: boolean } | null;
    if (r) { onToast("ok", r.hasXboxKey ? t("xboxKeySet") : t("xboxKeyCleared")); setXboxInput(""); await load(); }
    setBusy(null);
  }

  async function syncXbox() {
    setBusy("xbox");
    const r = (await call({ action: "sync_xbox" })) as { synced?: number } | null;
    if (r) { onToast("ok", t("xboxSynced", { count: r.synced ?? 0 })); await load(); onSuccess(); }
    setBusy(null);
  }

  async function toggleHidden(id: string, hidden: boolean) {
    setBusy(id);
    if (await call({ action: "toggle_hidden", id, hidden })) await load();
    setBusy(null);
  }

  if (!data) {
    return (
      <SectionCard title={t("title")} icon={Gamepad2}>
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t("title")} icon={Gamepad2}>
      <p className="text-zinc-500 text-xs mb-4 leading-relaxed">
        {t.rich("intro", { code: (c) => <code className="text-zinc-400">{c}</code> })}
        {!data.hasKey && <strong className="text-red-400">{t("noSteamKey")}</strong>}
      </p>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat label={t("statGames")} value={data.count.toLocaleString(nf)} />
        <Stat label={t("statHours")} value={data.totalHours.toLocaleString(nf)} />
        <Stat label={t("statLastSync")} value={data.steamSyncedAt ? new Date(data.steamSyncedAt).toLocaleDateString(nf) : "—"} />
      </div>

      <div className="border border-zinc-800 bg-black/30 p-3 mb-4 space-y-2">
        <label className="text-[11px] text-zinc-400 block">{t("steamIdLabel")}
          <input value={steamInput} onChange={(e) => setSteamInput(e.target.value)} placeholder="76561198… / steamcommunity.com/profiles/… / nick"
            className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-blue-600" />
        </label>
        <div className="flex gap-2">
          <button onClick={saveSteamId} disabled={busy === "save" || pending}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50 flex items-center gap-1.5">
            {busy === "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {t("save")}
          </button>
          <button onClick={sync} disabled={busy === "sync" || pending || !data.steamId}
            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50 flex items-center gap-1.5">
            {busy === "sync" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {t("syncSteam")}
          </button>
          <button onClick={syncPsn} disabled={busy === "psn" || pending || !data.hasNpsso} title={data.hasNpsso ? t("psnTitleOn") : t("psnTitleOff")}
            className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50 flex items-center gap-1.5">
            {busy === "psn" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {t("syncPsn")}
          </button>
        </div>
        <label className="text-[11px] text-zinc-400 block">{t("psnNpssoLabel")}
          <div className="flex gap-2 mt-0.5">
            <input
              type="password" value={psnInput} onChange={(e) => setPsnInput(e.target.value)} autoComplete="off"
              placeholder={data.hasPsnNpsso ? t("psnNpssoSetPh") : t("psnNpssoPh")}
              className="flex-1 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-indigo-600"
            />
            <button onClick={savePsnNpsso} disabled={busy === "psnNpsso" || pending}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50 flex items-center gap-1.5">
              {busy === "psnNpsso" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {t("save")}
            </button>
          </div>
        </label>
        <p className="text-[10px] text-zinc-600">{t.rich("psnNote", { code: (c) => <code className="text-zinc-500">{c}</code> })} {data.hasNpsso ? t("psnSet") : t("psnMissing")}</p>

        <label className="text-[11px] text-zinc-400 block pt-1">{t("xboxKeyLabel")}
          <div className="flex gap-2 mt-0.5">
            <input
              type="password" value={xboxInput} onChange={(e) => setXboxInput(e.target.value)} autoComplete="off"
              placeholder={data.hasXboxKey ? t("xboxKeySetPh") : t("xboxKeyPh")}
              className="flex-1 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-green-600"
            />
            <button onClick={saveXboxKey} disabled={busy === "xboxKey" || pending}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50 flex items-center gap-1.5">
              {busy === "xboxKey" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {t("save")}
            </button>
            <button onClick={syncXbox} disabled={busy === "xbox" || pending || !data.hasXboxKey} title={data.hasXboxKey ? t("xboxTitleOn") : t("xboxTitleOff")}
              className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50 flex items-center gap-1.5">
              {busy === "xbox" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {t("syncXbox")}
            </button>
          </div>
        </label>
        <p className="text-[10px] text-zinc-600">{t.rich("xboxNote", { code: (c) => <code className="text-zinc-500">{c}</code> })} {data.hasXboxKey ? t("psnSet") : t("xboxMissing")}</p>
      </div>

      {data.games.length > 0 && (
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {data.games.map((g) => (
            <div key={g.id} className={`flex items-center gap-2 border px-2 py-1.5 ${g.hidden ? "border-zinc-900 bg-black/20 opacity-50" : "border-zinc-800 bg-black/30"}`}>
              {g.imageUrl && (
                <img src={g.imageUrl} alt="" className="w-16 h-7 object-cover bg-zinc-900 shrink-0" loading="lazy" />
              )}
              <span className="text-xs text-white flex-1 truncate">{g.name}</span>
              <span className="text-[10px] font-mono text-zinc-500 shrink-0">{g.hours}h</span>
              <button onClick={() => toggleHidden(g.id, !g.hidden)} disabled={busy === g.id}
                className="text-zinc-500 hover:text-white shrink-0" title={g.hidden ? t("show") : t("hide")}>
                {g.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 bg-black/30 px-3 py-2">
      <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="text-lg font-bold text-white">{value}</div>
    </div>
  );
}

"use client";
// src/components/admin/sections/SongQueue.tsx — lazily-loaded song-request queue.
import { useState, useEffect, useCallback } from "react";
import { Music, Loader2, Play, Check, SkipForward, Trash2, Plus, Ban, UserX } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { SectionCard } from "../shared";
import { CommandHelp } from "@/components/CommandHelp";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type SongRow = {
  id: string;
  query: string;
  title: string | null;
  requestedBy: string;
  platform: string;
  status: string;
  createdAt: string;
};

export function SongQueueManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.songQueue");
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<SongRow[]>([]);
  const [recent, setRecent] = useState<SongRow[]>([]);
  const [banned, setBanned] = useState<{ id: string; name: string }[]>([]);
  const [addQuery, setAddQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{ queue?: SongRow[]; recent?: SongRow[]; banned?: { id: string; name: string }[] }>("/api/admin/song-requests");
      setQueue(data.queue ?? []);
      setRecent(data.recent ?? []);
      setBanned(data.banned ?? []);
    } catch { /* keep current */ } finally {
      setLoading(false);
    }
  }, []);

  // Live-ish queue: refresh every 10s while the section is open.
  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), 10_000);
    return () => clearInterval(iv);
  }, [load]);

  async function call(action: string, payload: Record<string, unknown> = {}) {
    try {
      await apiPost("/api/admin/song-requests", { action, ...payload });
      return true;
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
      return false;
    }
  }

  async function act(action: string, id: string) {
    setBusy(id);
    if (await call(action, { id })) await load();
    setBusy(null);
  }

  async function clearQueue() {
    if (!confirm(t("clearConfirm"))) return;
    setBusy("clear");
    if (await call("clear")) {
      onToast("ok", t("queueCleared"));
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  async function addSong() {
    const query = addQuery.trim();
    if (!query) return;
    setBusy("add");
    if (await call("add", { query })) {
      setAddQuery("");
      onToast("ok", t("added"));
      await load();
    }
    setBusy(null);
  }

  async function banUser(name: string) {
    if (!confirm(t("banConfirm", { name }))) return;
    setBusy("ban:" + name);
    if (await call("ban", { name })) {
      onToast("ok", t("banned", { name }));
      await load();
    }
    setBusy(null);
  }

  async function unban(name: string) {
    setBusy("unban:" + name);
    if (await call("unban", { name })) await load();
    setBusy(null);
  }

  const platformColor: Record<string, string> = {
    twitch: "#9146FF",
    kick: "#53FC18",
    youtube: "#FF0000",
  };

  function renderQuery(q: string, title?: string | null) {
    const label = title || q;
    if (/^https?:\/\//i.test(q)) {
      return (
        <a href={q} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:underline truncate" title={q}>
          {label}
        </a>
      );
    }
    return <span className="text-sm text-zinc-300 truncate">{label}</span>;
  }

  return (
    <SectionCard title={t("title")} icon={Music}>
      <p className="text-zinc-500 text-xs mb-3">
        {t.rich("intro", { code: (c) => <code className="text-zinc-300">{c}</code>, cmd: t("cmd") })}
      </p>
      <div className="mb-3"><CommandHelp feature="songs" /></div>

      {/* Manual add — the streamer queues a song themselves (link or title). */}
      <div className="flex gap-2 mb-3">
        <input
          value={addQuery}
          onChange={(e) => setAddQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void addSong(); }}
          placeholder={t("addPh")}
          maxLength={200}
          className="flex-1 min-w-0 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600"
        />
        <button
          onClick={() => void addSong()}
          disabled={busy === "add" || !addQuery.trim() || pending}
          className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
        >
          {busy === "add" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} {t("addBtn")}
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : (
        <>
          {queue.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20 mb-3">
              {t("queueEmpty")}
            </div>
          ) : (
            <div className="space-y-2 mb-3">
              {queue.map((s, i) => {
                const playing = s.status === "playing";
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "border bg-black/30 p-3",
                      playing ? "border-green-700 bg-green-950/20" : "border-zinc-800",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={cn("text-[11px] font-mono w-5 text-center shrink-0", playing ? "text-green-400" : "text-zinc-600")}>
                          {playing ? "▶" : i + 1}
                        </span>
                        <div className="flex flex-col min-w-0">
                          {renderQuery(s.query, s.title)}
                          <span className="text-[10px] text-zinc-500">
                            {t("requestedBy")} <strong className="text-zinc-400">{s.requestedBy}</strong>
                            <span className="ml-1 font-mono uppercase" style={{ color: platformColor[s.platform] ?? "#888" }}>
                              {s.platform}
                            </span>
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!playing && (
                          <button
                            onClick={() => act("play", s.id)}
                            disabled={busy === s.id || pending}
                            className="text-green-400 hover:text-green-300 border border-zinc-800 hover:border-green-700 w-6 h-6 flex items-center justify-center"
                            title={t("playTitle")}
                          >
                            <Play className="w-3 h-3" />
                          </button>
                        )}
                        {playing && (
                          <button
                            onClick={() => act("played", s.id)}
                            disabled={busy === s.id || pending}
                            className="text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 px-2 h-6 text-[9px] font-mono uppercase"
                            title={t("markPlayedTitle")}
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={() => act("skip", s.id)}
                          disabled={busy === s.id || pending}
                          className="text-zinc-500 hover:text-orange-400 border border-zinc-800 hover:border-orange-700 w-6 h-6 flex items-center justify-center"
                          title={t("skipTitle")}
                        >
                          <SkipForward className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => act("delete", s.id)}
                          disabled={busy === s.id || pending}
                          className="text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-6 h-6 flex items-center justify-center"
                          title={t("deleteTitle")}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        {s.platform !== "manual" && (
                          <button
                            onClick={() => banUser(s.requestedBy)}
                            disabled={busy === "ban:" + s.requestedBy || pending}
                            className="text-zinc-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-6 h-6 flex items-center justify-center"
                            title={t("banTitle")}
                          >
                            <Ban className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {queue.length > 0 && (
            <button
              onClick={clearQueue}
              disabled={busy === "clear" || pending}
              className="border border-zinc-800 hover:border-red-700 text-zinc-400 hover:text-red-300 px-3 py-1.5 text-xs font-mono uppercase tracking-widest mb-4 disabled:opacity-50"
            >
              {t("clearBtn")}
            </button>
          )}

          {recent.length > 0 && (
            <div className="border-t border-zinc-900 pt-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-2">{t("recentTitle")}</div>
              <div className="space-y-1">
                {recent.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs text-zinc-600">
                    <span className="font-mono uppercase text-[9px] w-12 shrink-0">{s.status === "played" ? t("statusPlayed") : t("statusSkipped")}</span>
                    <span className="truncate">{s.query}</span>
                    <span className="text-zinc-700 shrink-0">— {s.requestedBy}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {banned.length > 0 && (
            <div className="border-t border-zinc-900 pt-3 mt-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-2 flex items-center gap-1.5">
                <UserX className="w-3 h-3" /> {t("bannedTitle")}
              </div>
              <div className="flex flex-wrap gap-2">
                {banned.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => unban(b.name)}
                    disabled={busy === "unban:" + b.name}
                    title={t("unbanTitle")}
                    className="inline-flex items-center gap-1.5 text-[11px] border border-red-900/50 bg-red-950/20 text-red-300 px-2 py-1 hover:border-red-600 disabled:opacity-50"
                  >
                    {b.name} <span className="text-zinc-500">✕</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

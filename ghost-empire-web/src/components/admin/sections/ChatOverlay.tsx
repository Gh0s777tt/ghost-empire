"use client";
// src/components/admin/sections/ChatOverlay.tsx — lazily-loaded chat overlay appearance.
import { useState, useEffect } from "react";
import { MessageSquare, Loader2, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { OverlayPreview } from "@/components/admin/OverlayPreview";
import { ChatMessageRow, DEFAULT_CHAT_CFG, CHAT_FONTS, type ChatOverlayCfg, type ChatMsg } from "@/components/ChatMessageRow";

export function ChatOverlayCard({
  onToast,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.chatOverlay");
  const [cfg, setCfg] = useState<ChatOverlayCfg>(DEFAULT_CHAT_CFG);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ config?: ChatOverlayCfg }>("/api/admin/chat-overlay")
      .then((d) => { if (!cancelled) { if (d?.config) setCfg(d.config); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  function set<K extends keyof ChatOverlayCfg>(k: K, v: ChatOverlayCfg[K]) {
    setCfg((c) => ({ ...c, [k]: v }));
  }

  async function save() {
    setBusy(true);
    try {
      await apiPost("/api/admin/chat-overlay", cfg);
      onToast("ok", t("saved"));
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0) onToast("err", err.message || t("err"));
      else onToast("err", t("netErr"));
    } finally {
      setBusy(false);
    }
  }

  const sample: ChatMsg[] = [
    { id: "p1", platform: "twitch", username: "ghost_fan", message: t("sampleMsg1") },
    { id: "p2", platform: "kick", username: "kicker99", message: t("sampleMsg2") },
    { id: "p3", platform: "youtube", username: "ytviewer", message: t("sampleMsg3") },
  ];

  return (
    <SectionCard title={t("title")} icon={MessageSquare}>
      <div className="space-y-4">
        <p className="text-zinc-500 text-xs leading-relaxed">
          {t("intro")}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("fontSizeLabel", { size: cfg.fontSize })}</label>
            <input type="range" min={10} max={40} value={cfg.fontSize} onChange={(e) => set("fontSize", parseInt(e.target.value))} className="w-full accent-red-500" />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("bgOpacityLabel", { pct: Math.round(cfg.bgOpacity * 100) })}</label>
            <input type="range" min={0} max={100} value={Math.round(cfg.bgOpacity * 100)} onChange={(e) => set("bgOpacity", parseInt(e.target.value) / 100)} className="w-full accent-red-500" />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("textColorLabel")}</label>
            <input type="color" value={cfg.textColor} onChange={(e) => set("textColor", e.target.value)} className="w-full h-9 bg-black border border-zinc-800 cursor-pointer" />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("fontLabel")}</label>
            <select value={cfg.fontFamily} onChange={(e) => set("fontFamily", e.target.value)} className="w-full bg-black border border-zinc-800 px-3 py-2 text-sm text-white outline-hidden focus:border-red-500">
              {Object.keys(CHAT_FONTS).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={cfg.showPlatformIcon} onChange={(e) => set("showPlatformIcon", e.target.checked)} className="accent-red-500" />
          <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">{t("showPlatformIcon")}</span>
        </label>

        <button
          onClick={save}
          disabled={busy || !loaded}
          className="w-full px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {t("saveBtn")}
        </button>

        <OverlayPreview path="/overlay/chat" note={t("obsNote")}>
          {sample.map((m) => <ChatMessageRow key={m.id} msg={m} cfg={cfg} />)}
        </OverlayPreview>
      </div>
    </SectionCard>
  );
}

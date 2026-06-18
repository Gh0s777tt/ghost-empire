"use client";
// src/components/admin/sections/Widgets.tsx — lazily-loaded "all overlays in one
// place" hub. Lists every token-gated OBS overlay with its ready-to-paste Browser
// Source URL + copy button. The token is shared across all overlays.
import { useState, useEffect, useCallback } from "react";
import { LayoutGrid, Copy, Check, ExternalLink, Plus, Trash2, Pencil, X, Loader2, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { CustomWidgetCard } from "@/components/CustomWidgetCard";
import { EmojiPicker } from "@/components/EmojiPicker";
import { WIDGET_FONTS } from "@/lib/widget-fonts";
import { AlertCard } from "@/components/AlertCard";
import { ChatMessageRow } from "@/components/ChatMessageRow";
import { SubathonCard } from "@/components/SubathonCard";
import { CodeCard } from "@/components/CodeCard";
import { GoalBar } from "@/components/GoalBar";
import { PredictionOverlayCard } from "@/components/PredictionOverlayCard";
import { PollOverlayCard } from "@/components/PollOverlayCard";
import { LastEventCard } from "@/components/LastEventCard";
import { useTenantBranding } from "@/components/TenantBranding";
import type { ReactNode } from "react";

type TFn = (key: string) => string;

// Sample in-panel preview per widget (so you SEE how it looks without live data).
function widgetPreview(id: string, t: TFn, tokenSymbol: string, brandColor: string): ReactNode {
  switch (id) {
    case "alerts":
      return <AlertCard alert={{ title: t("prevAlertTitle"), message: t("prevAlertMsg"), icon: "💜", actorName: t("prevActor1"), amount: 5000, amountLabel: tokenSymbol }} accent={brandColor} />;
    case "chat":
      return (
        <div className="flex flex-col gap-1.5 w-full" style={{ maxWidth: 360 }}>
          <ChatMessageRow msg={{ id: "1", platform: "twitch", username: t("prevChatUser1"), message: t("prevChat1") }} />
          <ChatMessageRow msg={{ id: "2", platform: "kick", username: "KickoViewer", message: t("prevChat2") }} />
        </div>
      );
    case "goals":
      return <div style={{ width: 360 }}><GoalBar goal={{ id: "g", type: "subs", label: t("prevGoalLabel"), current: 34, target: 50, color: brandColor, completedAt: null }} accent={brandColor} /></div>;
    case "subathon":
      return <SubathonCard remainingMs={2 * 3600 * 1000 + 34 * 60 * 1000} ended={false} accent={brandColor} label="Subathon" />;
    case "codes":
      return <CodeCard title={t("prevCodeTitle")} label="Cyberpunk 2077 (Steam)" code="ABCD-EFGH-IJKL" accent="#16a34a" />;
    case "predictions":
      return <PredictionOverlayCard question={t("prevPredQ")} options={[{ label: t("prevPredOpt1"), total: 1400, count: 3 }, { label: "5–10", total: 900, count: 2 }, { label: t("prevPredOpt3"), total: 450, count: 1 }]} totalPot={2750} accent="#a855f7" />;
    case "polls":
      return <PollOverlayCard question={t("prevPollQ")} options={[{ label: t("prevPollOpt1"), count: 42 }, { label: t("prevPollOpt2"), count: 27 }, { label: t("prevPollOpt3"), count: 15 }]} total={84} accent="#3b82f6" />;
    case "last-sub":
      return <LastEventCard label={t("prevLastSubLabel")} name={t("prevActor1")} icon="💜" accent="#a855f7" />;
    case "last-donator":
      return <LastEventCard label={t("prevLastDonLabel")} name={t("prevAnon")} detail="20 PLN" icon="💰" accent="#22c55e" />;
    case "last-follower":
      return <LastEventCard label={t("prevLastFollowLabel")} name={t("prevNewViewer")} icon="⭐" accent="#3b82f6" />;
    case "viewers":
      return <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(15,15,20,0.92)", border: `2px solid ${brandColor}`, borderRadius: 999, padding: "7px 14px", color: "#fff", fontWeight: 800 }}>👁 1 234</div>;
    case "emoji-combo":
      return <div style={{ textAlign: "center", color: "#fff" }}><div style={{ fontSize: 64, lineHeight: 1 }}>🔥</div><div style={{ fontSize: 28, fontWeight: 900, textShadow: `0 0 12px ${brandColor}` }}>×12 COMBO!</div></div>;
    default:
      return null;
  }
}

// Which admin section configures this widget's look (null = automatic, no config).
const CONFIG_SECTION: Record<string, string> = {
  alerts: "alerts", chat: "chat", goals: "goals", subathon: "subathon",
  codes: "drops", predictions: "predictions", polls: "polls",
};

// Position option codes; labels come from the `widgets.position.*` namespace.
const POSITION_CODES = ["top-left", "top-center", "top-right", "center", "bottom-left", "bottom-center", "bottom-right"] as const;

type CustomWidget = {
  id: string; name: string; text: string; accentColor: string; textColor: string;
  fontSizePx: number; fontFamily: string; position: string; showCard: boolean;
  bgGradient: boolean; bgColor1: string; bgColor2: string; bgAngle: number;
};

type Widget = { id: string; name: string; path: string; desc: string; size: string; query?: string };

// Structural only; name/desc come from the `widgets.widget.<id>` namespace per locale.
type WidgetMeta = { id: string; path: string; size: string; query?: string };

const WIDGET_META: WidgetMeta[] = [
  { id: "alerts",       path: "/overlay",             size: "1920×1080" },
  { id: "chat",         path: "/overlay/chat",        size: "600×900" },
  { id: "goals",        path: "/overlay/goals",       size: "500×400" },
  { id: "subathon",     path: "/overlay/subathon",    size: "600×200" },
  { id: "codes",        path: "/overlay/codes",       size: "600×300" },
  { id: "predictions",  path: "/overlay/predictions", size: "500×400" },
  { id: "polls",        path: "/overlay/polls",       size: "500×400" },
  { id: "last-sub",     path: "/overlay/last-event",  query: "kind=sub",      size: "340×90" },
  { id: "last-donator", path: "/overlay/last-event",  query: "kind=donation", size: "340×90" },
  { id: "last-follower", path: "/overlay/last-event", query: "kind=follow",   size: "340×90" },
  { id: "viewers",      path: "/overlay/viewers",     size: "200×70" },
  { id: "emoji-combo",  path: "/overlay/emoji-combo", size: "400×260" },
  { id: "wheel",        path: "/overlay/wheel",       size: "400×440" },
  { id: "rumble",       path: "/overlay/rumble",      size: "360×120" },
];

export function WidgetsLibrary({
  onToast,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.widgets");
  const { tokenSymbol, brandColor } = useTenantBranding();
  const WIDGETS: Widget[] = WIDGET_META.map((m) => ({ ...m, name: t(`widget.${m.id}.name`), desc: t(`widget.${m.id}.desc`) }));
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Jump to the section that configures a widget's look (uses the hashchange nav in AdminClient).
  function jump(section: string) {
    if (typeof window !== "undefined") window.location.hash = section;
  }

  useEffect(() => {
    let cancelled = false;
    apiGet<{ token?: string | null }>("/api/admin/overlay-token")
      .then((d) => { if (!cancelled) setToken(d?.token ?? null); })
      .catch(() => { if (!cancelled) setToken(null); });
    return () => { cancelled = true; };
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  function urlFor(w: Widget) { return token ? `${origin}${w.path}?${w.query ? w.query + "&" : ""}token=${token}` : null; }

  function copy(w: Widget) {
    const url = urlFor(w);
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(w.id);
    setTimeout(() => setCopied(null), 1500);
    onToast("ok", t("copyToast"));
  }

  return (
    <SectionCard title={t("title")} icon={LayoutGrid}>
      <p className="text-zinc-500 text-xs mb-3 leading-relaxed">
        {t.rich("intro", { b: (c) => <strong className="text-zinc-300">{c}</strong>, em: (c) => <em>{c}</em> })}
      </p>

      {!token && <p className="text-[11px] text-zinc-600 mb-3">{t("loadingToken")}</p>}

      <p className="text-[11px] text-zinc-600 mb-2">{t.rich("clickHint", { b: (c) => <strong className="text-zinc-400">{c}</strong> })}</p>

      <div className="space-y-2">
        {WIDGETS.map((w) => {
          const url = urlFor(w);
          const isOpen = expanded === w.id;
          const cfg = CONFIG_SECTION[w.id];
          return (
            <div key={w.id} className="border border-zinc-800 bg-black/30">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : w.id)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-zinc-900/40 transition-colors"
                aria-expanded={isOpen}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-bold text-white truncate">{w.name}</span>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 shrink-0">{w.size}</span>
                </span>
                <span className="text-zinc-500 shrink-0 text-xs">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-2.5 border-t border-zinc-800/70 pt-2.5">
                  <p className="text-[11px] text-zinc-500 leading-snug">{w.desc}</p>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("previewHeader")}</div>
                    <div
                      className="border border-zinc-800 rounded-sm p-5 flex items-center justify-center overflow-hidden"
                      style={{ background: "repeating-conic-gradient(#18181b 0% 25%, #0a0a0a 0% 50%) 50% / 24px 24px", minHeight: 96 }}
                    >
                      {widgetPreview(w.id, t, tokenSymbol, brandColor)}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <input readOnly value={url ?? "—"} className="flex-1 bg-black border border-zinc-800 px-2 py-1.5 text-[11px] text-zinc-300 font-mono truncate" />
                    <button onClick={() => copy(w)} disabled={!url} className="px-2.5 border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-all disabled:opacity-40" title={t("copyUrlTitle")}>
                      {copied === w.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    {url && (
                      <a href={url} target="_blank" rel="noreferrer" className="px-2.5 border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-all flex items-center" title={t("openTitle")}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                  {cfg ? (
                    <button onClick={() => jump(cfg)} className="w-full text-[10px] font-mono uppercase tracking-widest text-zinc-300 hover:text-white border border-zinc-700 hover:border-red-600 px-2 py-1.5 flex items-center justify-center gap-1.5 transition-colors">
                      <Pencil className="w-3 h-3" /> {t("editLook")}
                    </button>
                  ) : (
                    <p className="text-[10px] text-zinc-600">{t("autoNote")}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 pt-4 border-t border-zinc-800">
        <CustomWidgetGenerator onToast={onToast} token={token} origin={origin} />
      </div>
    </SectionCard>
  );
}

function CustomWidgetGenerator({
  onToast, token, origin,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  token: string | null;
  origin: string;
}) {
  const t = useTranslations("admin.widgets");
  const { brandColor } = useTenantBranding();
  const POSITIONS: Array<[string, string]> = POSITION_CODES.map((c) => [c, t(`position.${c}`)]);
  const [list, setList] = useState<CustomWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Form
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [accentColor, setAccentColor] = useState(brandColor);
  const [textColor, setTextColor] = useState("#ffffff");
  const [fontSizePx, setFontSizePx] = useState(28);
  const [fontFamily, setFontFamily] = useState("Inter");
  const [position, setPosition] = useState("top-left");
  const [showCard, setShowCard] = useState(true);
  const [bgGradient, setBgGradient] = useState(false);
  const [bgColor1, setBgColor1] = useState("#7928ca");
  const [bgColor2, setBgColor2] = useState("#ff0080");
  const [bgAngle, setBgAngle] = useState(135);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ widgets?: CustomWidget[] }>("/api/admin/widgets");
      setList(d.widgets ?? []);
    } catch { /* keep current */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function resetForm() {
    setEditingId(null); setName(""); setText("");
    setAccentColor(brandColor); setTextColor("#ffffff");
    setFontSizePx(28); setFontFamily("Inter"); setPosition("top-left"); setShowCard(true);
    setBgGradient(false); setBgColor1("#7928ca"); setBgColor2("#ff0080"); setBgAngle(135);
  }

  function startEdit(w: CustomWidget) {
    setEditingId(w.id); setName(w.name); setText(w.text);
    setAccentColor(w.accentColor); setTextColor(w.textColor);
    setFontSizePx(w.fontSizePx); setFontFamily(w.fontFamily); setPosition(w.position); setShowCard(w.showCard);
    setBgGradient(w.bgGradient); setBgColor1(w.bgColor1); setBgColor2(w.bgColor2); setBgAngle(w.bgAngle);
  }

  async function save() {
    if (!text.trim()) { onToast("err", t("textRequired")); return; }
    setBusy(true);
    try {
      await apiPost("/api/admin/widgets", {
        action: editingId ? "update" : "create",
        id: editingId ?? undefined,
        name, text, accentColor, textColor, fontSizePx, fontFamily, position, showCard,
        bgGradient, bgColor1, bgColor2, bgAngle,
      });
      onToast("ok", editingId ? t("saved") : t("created"));
      resetForm();
      await load();
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!window.confirm(t("deleteConfirm"))) return;
    try {
      await apiPost("/api/admin/widgets", { action: "delete", id });
      onToast("ok", t("deleted")); if (editingId === id) resetForm(); await load();
    } catch {
      onToast("err", t("err"));
    }
  }

  function widgetUrl(id: string) { return token ? `${origin}/overlay/widget?token=${token}&id=${id}` : null; }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Wand2 className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-bold text-white">{t("genTitle")}</span>
      </div>
      <p className="text-[11px] text-zinc-500 mb-3 leading-relaxed">
        {t("genIntro")}
      </p>

      {/* Form + live preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        <div className="space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePh")} maxLength={80}
            className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white outline-hidden focus:border-red-600" />
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-zinc-400">{t("textLabel")}</span>
              <EmojiPicker onPick={(e) => setText((prev) => (prev.length < 500 ? prev + e : prev))} />
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={t("textPh")} maxLength={500}
              className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white outline-hidden focus:border-red-600" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-zinc-400">{t("accentLabel")}
              <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-full h-8 mt-0.5 bg-black border border-zinc-800 cursor-pointer" />
            </label>
            <label className="text-[11px] text-zinc-400">{t("textColorLabel")}
              <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-full h-8 mt-0.5 bg-black border border-zinc-800 cursor-pointer" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-zinc-400">{t("fontSizeLabel", { size: fontSizePx })}
              <input type="range" min={10} max={120} value={fontSizePx} onChange={(e) => setFontSizePx(parseInt(e.target.value, 10))} className="w-full" />
            </label>
            <label className="text-[11px] text-zinc-400">{t("fontLabel")}
              <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600">
                {WIDGET_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 items-end">
            <label className="text-[11px] text-zinc-400">{t("positionLabel")}
              <select value={position} onChange={(e) => setPosition(e.target.value)} className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600">
                {POSITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer pb-1.5">
              <input type="checkbox" checked={showCard} onChange={(e) => setShowCard(e.target.checked)} className="accent-red-500" />
              {t("cardLabel")}
            </label>
          </div>

          {showCard && (
            <div className="border border-zinc-800 bg-black/20 p-2 space-y-2">
              <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={bgGradient} onChange={(e) => setBgGradient(e.target.checked)} className="accent-red-500" />
                {t("gradientLabel")}
              </label>
              {bgGradient && (
                <div className="grid grid-cols-[auto_auto_1fr] gap-3 items-end">
                  <label className="text-[10px] text-zinc-400">{t("color1Label")}
                    <input type="color" value={bgColor1} onChange={(e) => setBgColor1(e.target.value)} className="block w-12 h-7 mt-0.5 bg-black border border-zinc-800 cursor-pointer" />
                  </label>
                  <label className="text-[10px] text-zinc-400">{t("color2Label")}
                    <input type="color" value={bgColor2} onChange={(e) => setBgColor2(e.target.value)} className="block w-12 h-7 mt-0.5 bg-black border border-zinc-800 cursor-pointer" />
                  </label>
                  <label className="text-[10px] text-zinc-400">{t("angleLabel", { angle: bgAngle })}
                    <input type="range" min={0} max={360} value={bgAngle} onChange={(e) => setBgAngle(parseInt(e.target.value, 10))} className="w-full" />
                  </label>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={save} disabled={busy || !text.trim()}
              className="flex-1 px-3 py-2 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center justify-center gap-1.5">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : editingId ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              {editingId ? t("saveChanges") : t("createWidget")}
            </button>
            {editingId && (
              <button onClick={resetForm} className="px-3 py-2 border border-zinc-700 text-zinc-400 text-[10px] font-bold tracking-widest uppercase flex items-center gap-1">
                <X className="w-3 h-3" /> {t("cancel")}
              </button>
            )}
          </div>
        </div>

        {/* Live preview */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("previewLabel")}</label>
          <div className="border border-zinc-800 rounded-sm p-6 min-h-[120px] flex items-center justify-center"
            style={{ background: "repeating-conic-gradient(#18181b 0% 25%, #0a0a0a 0% 50%) 50% / 24px 24px" }}>
            <CustomWidgetCard text={text || t("previewTextPh")} accentColor={accentColor} textColor={textColor} fontSizePx={fontSizePx} fontFamily={fontFamily} showCard={showCard} bgGradient={bgGradient} bgColor1={bgColor1} bgColor2={bgColor2} bgAngle={bgAngle} />
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : list.length === 0 ? (
        <p className="text-zinc-600 text-xs">{t("emptyList")}</p>
      ) : (
        <div className="space-y-2">
          {list.map((w) => {
            const url = widgetUrl(w.id);
            return (
              <div key={w.id} className="border border-zinc-800 bg-black/30 p-2.5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-sm font-bold text-white truncate">{w.name || "Widget"}</span>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => startEdit(w)} className="text-zinc-500 hover:text-white" title={t("editTitle")}><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(w.id)} className="text-zinc-500 hover:text-red-400" title={t("deleteTitle")}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <input readOnly value={url ?? "—"} className="flex-1 bg-black border border-zinc-800 px-2 py-1.5 text-[11px] text-zinc-300 font-mono truncate" />
                  <button onClick={() => { if (url) { navigator.clipboard.writeText(url); setCopied(w.id); setTimeout(() => setCopied(null), 1500); onToast("ok", t("copyToast")); } }}
                    disabled={!url} className="px-2.5 border border-zinc-700 text-zinc-300 hover:border-zinc-500 disabled:opacity-40" title={t("copyUrlTitle")}>
                    {copied === w.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

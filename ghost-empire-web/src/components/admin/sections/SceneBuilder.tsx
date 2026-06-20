"use client";
// src/components/admin/sections/SceneBuilder.tsx
// Visual overlay SCENE builder (#550): compose several overlay widgets on one 16:9
// canvas (drag to move, corner handle to resize, delete), save, and get a single OBS
// URL for the whole scene. Data via /api/admin/overlay-scenes; layout model + catalog
// in lib/overlay-scenes.
import { useState, useEffect, useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Layers, Loader2, Plus, Trash2, Save, Copy, Check, X, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { SCENE_WIDGETS, sceneWidget, clampElement, type SceneElement } from "@/lib/overlay-scenes";

type Scene = { id: string; name: string; elements: string };

function parse(json: string): SceneElement[] {
  try { const a = JSON.parse(json); return Array.isArray(a) ? a : []; } catch { return []; }
}

export function SceneBuilder({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.scenes");
  const [loading, setLoading] = useState(true);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [els, setEls] = useState<SceneElement[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; mode: "move" | "resize"; px: number; py: number; ox: number; oy: number; ow: number; oh: number; rect: DOMRect } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ scenes: Scene[] }>("/api/admin/overlay-scenes");
      setScenes(d.scenes);
      setActiveId((cur) => cur ?? d.scenes[0]?.id ?? null);
    } catch { /* keep */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    apiGet<{ token?: string | null }>("/api/admin/overlay-token").then((d) => setToken(d?.token ?? null)).catch(() => setToken(null));
  }, []);

  // Load the active scene's elements into the editable canvas.
  useEffect(() => {
    const s = scenes.find((x) => x.id === activeId);
    setEls(s ? parse(s.elements) : []);
    setSel(null);
    setDirty(false);
  }, [activeId, scenes]);

  function update(id: string, fn: (el: SceneElement) => SceneElement) {
    setEls((prev) => prev.map((e) => (e.id === id ? fn(e) : e)));
  }

  async function call(action: string, payload: Record<string, unknown>): Promise<boolean> {
    try { await apiPost("/api/admin/overlay-scenes", { action, ...payload }); return true; }
    catch (e) { onToast("err", e instanceof ApiError ? e.message : t("err")); return false; }
  }

  async function createScene() {
    setBusy(true);
    try {
      const d = await apiPost<{ scene?: Scene }>("/api/admin/overlay-scenes", { action: "create", name: t("newName") });
      if (d.scene) { setScenes((p) => [...p, d.scene!]); setActiveId(d.scene.id); }
    } catch (e) { onToast("err", e instanceof ApiError ? e.message : t("err")); }
    finally { setBusy(false); }
  }
  async function removeScene(s: Scene) {
    if (!confirm(t("deleteConfirm", { name: s.name }))) return;
    setBusy(true);
    if (await call("delete", { id: s.id })) {
      onToast("ok", t("deleted"));
      setScenes((p) => p.filter((x) => x.id !== s.id));
      setActiveId((cur) => (cur === s.id ? null : cur));
    }
    setBusy(false);
  }
  async function save() {
    if (!activeId) return;
    setBusy(true);
    if (await call("update", { id: activeId, elements: els })) {
      onToast("ok", t("saved"));
      setScenes((p) => p.map((s) => (s.id === activeId ? { ...s, elements: JSON.stringify(els) } : s)));
      setDirty(false);
    }
    setBusy(false);
  }
  async function rename(name: string) {
    if (!activeId) return;
    setScenes((p) => p.map((s) => (s.id === activeId ? { ...s, name } : s)));
    await call("update", { id: activeId, name });
  }

  function addWidget(widgetId: string) {
    const w = sceneWidget(widgetId);
    if (!w) return;
    const el = clampElement({ id: `${widgetId}-${Date.now().toString(36)}`, widget: widgetId, x: 50 - w.w / 2, y: 50 - w.h / 2, w: w.w, h: w.h });
    setEls((p) => [...p, el]);
    setSel(el.id);
    setDirty(true);
  }
  function removeEl(id: string) { setEls((p) => p.filter((e) => e.id !== id)); setDirty(true); if (sel === id) setSel(null); }

  // ---- drag / resize on the canvas (percentages) ----
  function startDrag(e: ReactPointerEvent, el: SceneElement, mode: "move" | "resize") {
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = { id: el.id, mode, px: e.clientX, py: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h, rect };
    setSel(el.id);
  }
  function onMove(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = ((e.clientX - d.px) / d.rect.width) * 100;
    const dy = ((e.clientY - d.py) / d.rect.height) * 100;
    update(d.id, (el) => (d.mode === "move"
      ? clampElement({ ...el, x: d.ox + dx, y: d.oy + dy })
      : clampElement({ ...el, w: d.ow + dx, h: d.oh + dy })));
    setDirty(true);
  }
  function endDrag(e: ReactPointerEvent) { if (dragRef.current) { canvasRef.current?.releasePointerCapture(e.pointerId); dragRef.current = null; } }

  const sceneUrl = token && activeId && typeof window !== "undefined" ? `${window.location.origin}/overlay/scene/${activeId}?token=${token}` : "";

  return (
    <SectionCard title={t("title")} icon={Layers}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro")}</p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : (
        <>
          {/* Scene tabs */}
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            {scenes.map((s) => (
              <button key={s.id} onClick={() => setActiveId(s.id)} className={`px-2.5 py-1 text-xs border rounded ${s.id === activeId ? "border-red-600 bg-red-950/40 text-white" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"}`}>
                {s.name}
              </button>
            ))}
            <button onClick={() => void createScene()} disabled={busy} className="px-2.5 py-1 text-xs border border-zinc-800 text-zinc-300 hover:border-red-600 rounded inline-flex items-center gap-1 disabled:opacity-50">
              <Plus className="w-3 h-3" /> {t("newScene")}
            </button>
          </div>

          {!activeId ? (
            <div className="text-xs text-zinc-500 text-center py-6 border border-zinc-900 bg-black/20">{t("empty")}</div>
          ) : (
            <>
              {/* Active scene name + delete */}
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={scenes.find((s) => s.id === activeId)?.name ?? ""}
                  onChange={(e) => rename(e.target.value.slice(0, 60))}
                  className="flex-1 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600"
                />
                <button onClick={() => { const s = scenes.find((x) => x.id === activeId); if (s) void removeScene(s); }} disabled={busy} title={t("deleteScene")} className="text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-7 h-7 flex items-center justify-center shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>

              {/* Canvas */}
              <div
                ref={canvasRef}
                onPointerMove={onMove}
                onPointerUp={endDrag}
                onPointerDown={() => setSel(null)}
                className="relative aspect-video w-full border border-zinc-800 rounded-sm overflow-hidden touch-none select-none mb-2"
                style={{ background: "repeating-conic-gradient(#18181b 0% 25%, #0a0a0a 0% 50%) 50% / 24px 24px" }}
              >
                {els.map((el) => (
                  <div
                    key={el.id}
                    onPointerDown={(e) => startDrag(e, el, "move")}
                    className={`absolute rounded-sm border flex items-center justify-center text-[10px] font-mono text-center px-1 cursor-move ${sel === el.id ? "border-red-500 bg-red-500/20 text-white z-10" : "border-zinc-500/60 bg-zinc-800/50 text-zinc-300"}`}
                    style={{ left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%` }}
                  >
                    <span className="truncate pointer-events-none">{el.widget}</span>
                    {sel === el.id && (
                      <>
                        <button onPointerDown={(e) => { e.stopPropagation(); removeEl(el.id); }} className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center" title={t("removeEl")}><X className="w-2.5 h-2.5" /></button>
                        <div onPointerDown={(e) => startDrag(e, el, "resize")} className="absolute right-0 bottom-0 w-3 h-3 bg-white border-2 border-red-600 rounded-sm cursor-nwse-resize translate-x-1/2 translate-y-1/2" title={t("resize")} />
                      </>
                    )}
                  </div>
                ))}
                {els.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-600 pointer-events-none">{t("canvasEmpty")}</div>}
              </div>

              {/* Widget palette */}
              <div className="border border-zinc-800 bg-black/30 p-2 mb-2">
                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">{t("addWidget")}</div>
                <div className="flex flex-wrap gap-1">
                  {SCENE_WIDGETS.map((w) => (
                    <button key={w.id} onClick={() => addWidget(w.id)} className="px-2 py-1 text-[11px] border border-zinc-800 text-zinc-400 hover:text-white hover:border-red-700 rounded">+ {w.id}</button>
                  ))}
                </div>
              </div>

              {/* Save + OBS URL */}
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => void save()} disabled={busy || !dirty} className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center gap-1.5">
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} {dirty ? t("save") : t("saved")}
                </button>
                <span className="text-[10px] text-zinc-600">{t("count", { n: els.length })}</span>
              </div>

              {sceneUrl && (
                <div className="mt-2 flex items-center gap-2 border border-zinc-800 bg-black/30 p-2 rounded">
                  <code className="flex-1 text-[10px] text-zinc-400 font-mono truncate">{sceneUrl}</code>
                  <a href={sceneUrl} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white shrink-0" title={t("openUrl")}><ExternalLink className="w-3.5 h-3.5" /></a>
                  <button onClick={() => { void navigator.clipboard.writeText(sceneUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }} className="text-zinc-400 hover:text-white shrink-0" title={t("copy")}>
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </SectionCard>
  );
}

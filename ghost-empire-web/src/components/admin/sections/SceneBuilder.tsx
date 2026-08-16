"use client";
// src/components/admin/sections/SceneBuilder.tsx
// Visual overlay SCENE builder (#550): compose several overlay widgets on one 16:9
// canvas (drag to move, corner handle to resize, delete), save, and get a single OBS
// URL for the whole scene. Data via /api/admin/overlay-scenes; layout model + catalog
// in lib/overlay-scenes.
import { useState, useEffect, useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Layers, Loader2, Plus, Trash2, Save, Copy, Check, X, ExternalLink, Eye, EyeOff, CopyPlus, Download, Upload, Magnet, BringToFront, SendToBack, Image as ImageIcon, Radio } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { SCENE_WIDGETS, IMAGE_WIDGET, VIDEO_WIDGET, MEDIA_WIDGETS, sceneWidget, clampElement, elementEnabled, moveElement, type SceneElement } from "@/lib/overlay-scenes";
import { SCENE_TEMPLATES } from "@/lib/scene-templates";
import { MediaUploadButton } from "../MediaUploadButton";
import { safeMediaUrl } from "@/lib/url-safe";

type Scene = { id: string; name: string; elements: string; enabled?: boolean; isActive?: boolean };

const WIDGET_PATH = new Map(SCENE_WIDGETS.map((w) => [w.id, w]));

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
  const [preview, setPreview] = useState(false); // żywy podgląd widgetów (iframe) — patrz komentarz przy płótnie
  const [snap, setSnap] = useState(true); // przyciąganie do krawędzi/osi innych elementów
  const [bgUrl, setBgUrl] = useState(""); // zrzut z gry pod płótnem — TYLKO podgląd w edytorze
  // Prowadnice rysowane w trakcie przeciągania: procentowe pozycje linii, które właśnie „złapały".
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [imgUrl, setImgUrl] = useState(""); // pole URL do dodania własnej grafiki jako elementu sceny

  // Tło podglądu trzymamy w localStorage, NIE w bazie: to pomoc warsztatowa jednego streamera przy
  // jednej przeglądarce (żeby zobaczyć, czy widgety nie zasłaniają minimapy), a nie część sceny —
  // do OBS-a nigdy nie trafia. Trzymanie tego w `elements` zaśmiecałoby zapis i mieszałoby dwie
  // różne rzeczy: to, co widzą widzowie, z tym, co pomaga układać.
  useEffect(() => {
    if (!activeId) return;
    setBgUrl(localStorage.getItem(`scene-bg:${activeId}`) ?? "");
  }, [activeId]);
  function zapiszTlo(url: string) {
    setBgUrl(url);
    if (!activeId) return;
    if (url) localStorage.setItem(`scene-bg:${activeId}`, url);
    else localStorage.removeItem(`scene-bg:${activeId}`);
  }

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

  // Load the active scene's elements into the editable canvas — TYLKO przy realnej zmianie sceny.
  //
  // Wcześniej efekt zależał od całej tablicy `scenes`, więc KAŻDY `setScenes` przeładowywał płótno
  // z wersji zapisanej. A `rename()` woła `setScenes` na każde naciśnięcie klawisza w polu nazwy —
  // efekt: użytkownik rozstawiał widgety, poprawiał nazwę sceny i cała niezapisana praca znikała,
  // a `setDirty(false)` gasił jeszcze przycisk „Zapisz", więc nie było czego ratować. Strażnik na
  // ref przypina przeładowanie do zmiany `activeId` (przełączenie zakładki sceny), co było jedyną
  // intencją tego efektu.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (loadedFor.current === activeId) return;
    loadedFor.current = activeId;
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
  // Curated template → a real editable scene in one click (#771).
  async function applyTemplate(templateId: string) {
    setBusy(true);
    try {
      const d = await apiPost<{ scene?: Scene }>("/api/admin/overlay-scenes", {
        action: "apply_template",
        templateId,
        name: t(`tpl_${templateId}`),
      });
      if (d.scene) { setScenes((p) => [...p, d.scene!]); setActiveId(d.scene.id); onToast("ok", t("tplApplied")); }
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
  // Nazwa: podmiana lokalna od razu (pole ma być responsywne), ale zapis do API dopiero po 500 ms
  // ciszy — wcześniej leciał jeden POST na KAŻDY wpisany znak.
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function rename(name: string) {
    if (!activeId) return;
    const id = activeId;
    setScenes((p) => p.map((s) => (s.id === id ? { ...s, name } : s)));
    if (renameTimer.current) clearTimeout(renameTimer.current);
    renameTimer.current = setTimeout(() => { void call("update", { id, name }); }, 500);
  }
  // Nie gub ostatniego znaku, gdy sekcja zniknie przed upływem debounce'u.
  useEffect(() => () => { if (renameTimer.current) clearTimeout(renameTimer.current); }, []);

  /** Włącz/wyłącz CAŁĄ scenę — wyłączona zostaje w panelu, ale jej URL w OBS renderuje pustkę. */
  async function toggleScene(next: boolean) {
    if (!activeId) return;
    const id = activeId;
    setScenes((p) => p.map((s) => (s.id === id ? { ...s, enabled: next } : s)));
    if (!(await call("update", { id, enabled: next }))) {
      setScenes((p) => p.map((s) => (s.id === id ? { ...s, enabled: !next } : s))); // rollback
    }
  }

  /** Włącz/wyłącz POJEDYNCZY element — zostaje na płótnie, ale znika z renderu OBS. */
  function toggleEl(id: string) {
    update(id, (e) => ({ ...e, enabled: e.enabled === false }));
    setDirty(true);
  }

  function addWidget(widgetId: string) {
    const w = sceneWidget(widgetId);
    if (!w) return;
    // eslint-disable-next-line react-hooks/purity -- Date.now() generates a unique id inside a click handler (not render); intentional (#733)
    const el = clampElement({ id: `${widgetId}-${Date.now().toString(36)}`, widget: widgetId, x: 50 - w.w / 2, y: 50 - w.h / 2, w: w.w, h: w.h });
    setEls((p) => [...p, el]);
    setSel(el.id);
    setDirty(true);
  }
  function removeEl(id: string) { setEls((p) => p.filter((e) => e.id !== id)); setDirty(true); if (sel === id) setSel(null); }
  // Elementy mediów (update 2026-08): własna grafika LUB wideo/animacja (mp4/webm), upload lub URL,
  // jako element sceny → sceny statyczne ORAZ animowane. `kind` z uploadu jest wiarygodny; dla URL
  // wykrywamy wideo po rozszerzeniu. src walidowany klientowo (safeMediaUrl) i tak samo na serwerze
  // (parseElements). Wideo → <video> autoplay/muted/loop w renderze sceny.
  function addMedia(rawUrl: string, kind?: "image" | "video") {
    const src = safeMediaUrl(rawUrl.trim());
    if (!src) return;
    const isVideo = kind === "video" || /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(src);
    const widget = isVideo ? VIDEO_WIDGET : IMAGE_WIDGET;
    const el = clampElement({ id: `${widget}-${Date.now().toString(36)}`, widget, x: 32, y: 32, w: isVideo ? 40 : 30, h: isVideo ? 23 : 30, src });
    setEls((p) => [...p, el]);
    setSel(el.id);
    setDirty(true);
  }

  // ---- drag / resize on the canvas (percentages) ----
  function startDrag(e: ReactPointerEvent, el: SceneElement, mode: "move" | "resize") {
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = { id: el.id, mode, px: e.clientX, py: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h, rect };
    setSel(el.id);
  }
  // Próg przyciągania w procentach płótna. 1.5% ≈ 29 px przy 1920 — na tyle blisko, żeby „łapało"
  // celowo, i na tyle daleko, żeby dało się ustawić element tuż obok linii, jeśli tak się chce.
  const PROG_PRZYCIAGANIA = 1.5;

  /** Linie, do których przyciągamy w danej osi: krawędzie i środki POZOSTAŁYCH elementów plus
   *  krawędzie i środek płótna. Bez tego układ jest zawsze „prawie" wyrównany — a to widać na streamie. */
  function linie(os: "x" | "y", pomijId: string): number[] {
    const out = [0, 50, 100];
    for (const el of els) {
      if (el.id === pomijId) continue;
      const start = os === "x" ? el.x : el.y;
      const rozmiar = os === "x" ? el.w : el.h;
      out.push(start, start + rozmiar / 2, start + rozmiar);
    }
    return out;
  }

  /** Dopasuj `start` tak, by któraś z trzech krawędzi elementu (początek/środek/koniec) trafiła
   *  w linię. Zwraca skorygowany początek i trafioną linię (do narysowania prowadnicy). */
  function przyciagnij(start: number, rozmiar: number, cele: number[]): { v: number; linia: number | null } {
    let best: { v: number; linia: number; d: number } | null = null;
    for (const krawedz of [0, rozmiar / 2, rozmiar]) {
      for (const cel of cele) {
        const d = Math.abs(start + krawedz - cel);
        if (d <= PROG_PRZYCIAGANIA && (!best || d < best.d)) best = { v: cel - krawedz, linia: cel, d };
      }
    }
    return best ? { v: best.v, linia: best.linia } : { v: start, linia: null };
  }

  function onMove(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = ((e.clientX - d.px) / d.rect.width) * 100;
    const dy = ((e.clientY - d.py) / d.rect.height) * 100;

    if (d.mode === "move") {
      let x = d.ox + dx;
      let y = d.oy + dy;
      const trafione: { x: number[]; y: number[] } = { x: [], y: [] };
      if (snap) {
        const sx = przyciagnij(x, d.ow, linie("x", d.id));
        const sy = przyciagnij(y, d.oh, linie("y", d.id));
        x = sx.v;
        y = sy.v;
        if (sx.linia !== null) trafione.x.push(sx.linia);
        if (sy.linia !== null) trafione.y.push(sy.linia);
      }
      setGuides(trafione);
      update(d.id, (el) => clampElement({ ...el, x, y }));
    } else {
      update(d.id, (el) => clampElement({ ...el, w: d.ow + dx, h: d.oh + dy }));
    }
    setDirty(true);
  }
  function endDrag(e: ReactPointerEvent) {
    if (dragRef.current) { canvasRef.current?.releasePointerCapture(e.pointerId); dragRef.current = null; }
    setGuides({ x: [], y: [] });
  }

  /** Ustaw scenę jako AKTYWNĄ — tę, którą renderuje stały adres `/overlay/live` w OBS. */
  async function setActive(id: string) {
    setBusy(true);
    // Optymistycznie: jedna aktywna, reszta zgaszona — tak samo jak wymusza to serwer.
    const poprzednie = scenes;
    setScenes((p) => p.map((s) => ({ ...s, isActive: s.id === id })));
    if (await call("set_active", { id })) onToast("ok", t("activated"));
    else setScenes(poprzednie); // rollback — np. gdy migracja jeszcze nie poszła (503)
    setBusy(false);
  }

  /** Warstwy: przestawienie w tablicy `elements` (patrz `moveElement` — tablica JEST kolejnością warstw). */
  function warstwa(id: string, to: "front" | "back") {
    setEls((p) => moveElement(p, id, to));
    setDirty(true);
  }

  /** Duplikat sceny — wariant istniejącego układu bez rozstawiania go od zera. */
  async function duplicateScene(s: Scene) {
    setBusy(true);
    try {
      const d = await apiPost<{ scene?: Scene }>("/api/admin/overlay-scenes", { action: "duplicate", id: s.id });
      if (d.scene) { setScenes((p) => [...p, d.scene!]); setActiveId(d.scene.id); onToast("ok", t("duplicated")); }
    } catch (e) { onToast("err", e instanceof ApiError ? e.message : t("err")); }
    finally { setBusy(false); }
  }

  /** Eksport układu do pliku — przenoszenie scen między portalami i kopia zapasowa przed eksperymentem. */
  function exportScene() {
    const s = scenes.find((x) => x.id === activeId);
    if (!s) return;
    const plik = new Blob([JSON.stringify({ name: s.name, elements: els }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(plik);
    a.download = `scena-${s.name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** Import układu z pliku. Wejście przechodzi tę samą walidację co zapis — plik jest danymi
   *  z zewnątrz, więc nieznane widgety i pozycje poza płótnem odpadają, zanim cokolwiek zobaczysz. */
  async function importScene(f: File) {
    try {
      const raw = JSON.parse(await f.text()) as { elements?: unknown };
      const arr = Array.isArray(raw?.elements) ? raw.elements : [];
      const czyste = (arr as SceneElement[])
        .filter((el) => el && typeof el === "object" && (sceneWidget(String(el.widget)) || MEDIA_WIDGETS.has(String(el.widget))))
        .slice(0, 24)
        .map((el) => clampElement({ ...el, id: String(el.id ?? `${el.widget}-${Math.random().toString(36).slice(2)}`) }));
      if (czyste.length === 0) { onToast("err", t("importEmpty")); return; }
      setEls(czyste);
      setSel(null);
      setDirty(true);
      onToast("ok", t("imported", { n: czyste.length }));
    } catch { onToast("err", t("importBad")); }
  }

  const sceneUrl = token && activeId && typeof window !== "undefined" ? `${window.location.origin}/overlay/scene/${activeId}?token=${token}` : "";
  // Adres STAŁY: wkleja się do OBS raz, a potem przełącza sceny z panelu/Stream Decka. Adres
  // per-scena zostaje — przydaje się, gdy ktoś woli mieć każdą scenę jako osobne źródło w OBS.
  const liveUrl = token && typeof window !== "undefined" ? `${window.location.origin}/overlay/live?token=${token}` : "";

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
              <button key={s.id} onClick={() => setActiveId(s.id)} className={`px-2.5 py-1 text-xs border rounded inline-flex items-center gap-1 ${s.id === activeId ? "border-red-600 bg-red-950/40 text-white" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"} ${s.enabled === false ? "opacity-50" : ""}`}>
                {s.isActive && <Radio className="w-3 h-3 text-emerald-400" />}{s.enabled === false && <EyeOff className="w-3 h-3 text-amber-500" />}{s.name}
              </button>
            ))}
            <button onClick={() => void createScene()} disabled={busy} className="px-2.5 py-1 text-xs border border-zinc-800 text-zinc-300 hover:border-red-600 rounded inline-flex items-center gap-1 disabled:opacity-50">
              <Plus className="w-3 h-3" /> {t("newScene")}
            </button>
          </div>

          {/* Curated templates (#771) — one click creates a ready, editable scene. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 me-1">{t("tplHeading")}</span>
            {SCENE_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => void applyTemplate(tpl.id)}
                disabled={busy}
                title={t(`tpl_${tpl.id}`)}
                className="px-2 py-1 text-[11px] border border-zinc-800 text-zinc-400 hover:border-amber-600 hover:text-amber-300 rounded inline-flex items-center gap-1 disabled:opacity-50"
              >
                <span aria-hidden>{tpl.icon}</span> {t(`tpl_${tpl.id}`)}
              </button>
            ))}
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
                {/* Włącz/wyłącz CAŁĄ scenę — wyłączona renderuje w OBS pustkę, ale zostaje do edycji. */}
                {(() => {
                  const on = scenes.find((s) => s.id === activeId)?.enabled !== false;
                  return (
                    <button
                      onClick={() => void toggleScene(!on)}
                      disabled={busy}
                      title={on ? t("sceneOnHint") : t("sceneOffHint")}
                      className={`px-2 h-7 text-[10px] font-bold uppercase tracking-widest border shrink-0 inline-flex items-center gap-1 disabled:opacity-50 ${on ? "border-emerald-800 text-emerald-400 hover:border-emerald-600" : "border-amber-800 text-amber-400 hover:border-amber-600"}`}
                    >
                      {on ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} {on ? t("sceneOn") : t("sceneOff")}
                    </button>
                  );
                })()}
                {/* Żywy podgląd widgetów — domyślnie off, bo każdy element to osobna strona. */}
                <button
                  onClick={() => setPreview((v) => !v)}
                  title={t("previewHint")}
                  className={`px-2 h-7 text-[10px] font-bold uppercase tracking-widest border shrink-0 inline-flex items-center gap-1 ${preview ? "border-red-700 text-red-300" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"}`}
                >
                  {preview ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} {t("preview")}
                </button>
                {(() => {
                  const naZywo = scenes.find((s) => s.id === activeId)?.isActive === true;
                  return (
                    <button
                      onClick={() => activeId && void setActive(activeId)}
                      disabled={busy || naZywo}
                      title={naZywo ? t("isLiveHint") : t("setLiveHint")}
                      className={`px-2 h-7 text-[10px] font-bold uppercase tracking-widest border shrink-0 inline-flex items-center gap-1 disabled:opacity-60 ${naZywo ? "border-emerald-700 text-emerald-300" : "border-zinc-800 text-zinc-400 hover:border-emerald-700 hover:text-emerald-300"}`}
                    >
                      <Radio className="w-3 h-3" /> {naZywo ? t("isLive") : t("setLive")}
                    </button>
                  );
                })()}
                <button onClick={() => { const s = scenes.find((x) => x.id === activeId); if (s) void duplicateScene(s); }} disabled={busy} title={t("duplicateScene")} className="text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 w-7 h-7 flex items-center justify-center shrink-0"><CopyPlus className="w-3.5 h-3.5" /></button>
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
                {/* Zrzut z gry pod spodem — widać, czy widgety nie zasłaniają minimapy albo paska HP.
                    Tylko podgląd w edytorze; do OBS-a to nie trafia. */}
                {bgUrl && (
                  <img src={bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none" />
                )}
                {els.map((el) => {
                  const on = elementEnabled(el);
                  const wdef = WIDGET_PATH.get(el.widget);
                  // Żywy podgląd: ten sam iframe co w OBS, tylko `pointer-events: none`, żeby
                  // przeciąganie kafelka działało dalej. Domyślnie WYŁĄCZONY — scena może mieć do 24
                  // elementów, a każdy to osobna strona z własnym pollingiem/streamem, więc stały
                  // podgląd potrafiłby zajechać panel. Wyłączony element nie dostaje iframe'a wcale.
                  const showLive = preview && on && !!token && !!wdef && !MEDIA_WIDGETS.has(el.widget);
                  return (
                  <div
                    key={el.id}
                    onPointerDown={(e) => startDrag(e, el, "move")}
                    className={`absolute rounded-sm border flex items-center justify-center text-[10px] font-mono text-center px-1 cursor-move overflow-hidden ${sel === el.id ? "border-red-500 bg-red-500/20 text-white z-10" : "border-zinc-500/60 bg-zinc-800/50 text-zinc-300"} ${on ? "" : "opacity-40 grayscale"}`}
                    style={{
                      left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`,
                      // Miniatura obrazu wprost w kafelku (element „image"), reszta = nazwa widgetu.
                      ...(el.widget === IMAGE_WIDGET && el.src
                        ? { backgroundImage: `url("${el.src}")`, backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center" }
                        : {}),
                    }}
                  >
                    {/* Podgląd wideo wprost w kafelku edytora (element „video"). */}
                    {el.widget === VIDEO_WIDGET && el.src && (
                      <video src={el.src} muted loop autoPlay playsInline className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
                    )}
                    {showLive && (
                      <iframe
                        src={`${wdef.path}?${new URLSearchParams({ token: token, ...(wdef.query ? Object.fromEntries(new URLSearchParams(wdef.query)) : {}) }).toString()}`}
                        title={el.widget}
                        scrolling="no"
                        className="absolute inset-0 w-full h-full border-0 bg-transparent pointer-events-none"
                      />
                    )}
                    {!showLive && <span className="truncate pointer-events-none">{MEDIA_WIDGETS.has(el.widget) ? "" : el.widget}</span>}
                    {!on && <span className="absolute inset-x-0 bottom-0 bg-black/70 text-[9px] text-amber-300 pointer-events-none">{t("elOff")}</span>}
                    {sel === el.id && (
                      <>
                        <button onPointerDown={(e) => { e.stopPropagation(); toggleEl(el.id); }} className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-zinc-700 text-white flex items-center justify-center" title={on ? t("elHide") : t("elShow")}>
                          {on ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                        </button>
                        <button onPointerDown={(e) => { e.stopPropagation(); warstwa(el.id, "front"); }} className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-zinc-700 text-white flex items-center justify-center" title={t("toFront")}><BringToFront className="w-2.5 h-2.5" /></button>
                        <button onPointerDown={(e) => { e.stopPropagation(); warstwa(el.id, "back"); }} className="absolute -bottom-2 left-3 w-4 h-4 rounded-full bg-zinc-700 text-white flex items-center justify-center" title={t("toBack")}><SendToBack className="w-2.5 h-2.5" /></button>
                        <button onPointerDown={(e) => { e.stopPropagation(); removeEl(el.id); }} className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center" title={t("removeEl")}><X className="w-2.5 h-2.5" /></button>
                        <div onPointerDown={(e) => startDrag(e, el, "resize")} className="absolute right-0 bottom-0 w-3 h-3 bg-white border-2 border-red-600 rounded-sm cursor-nwse-resize translate-x-1/2 translate-y-1/2" title={t("resize")} />
                      </>
                    )}
                  </div>
                  );
                })}
                {/* Prowidnice wyrównania — pokazują, w co element właśnie „trafił". */}
                {guides.x.map((g) => (
                  <div key={`gx-${g}`} className="absolute top-0 bottom-0 w-px bg-amber-400/80 pointer-events-none z-20" style={{ left: `${g}%` }} />
                ))}
                {guides.y.map((g) => (
                  <div key={`gy-${g}`} className="absolute left-0 right-0 h-px bg-amber-400/80 pointer-events-none z-20" style={{ top: `${g}%` }} />
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

              {/* Własna grafika jako element sceny (upload lub URL) — sceny statyczne (update 2026-08) */}
              <div className="border border-zinc-800 bg-black/30 p-2 mb-2">
                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">{t("addImage")}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <MediaUploadButton
                    accept="image/png,image/jpeg,image/gif,image/webp,image/avif,video/mp4,video/webm"
                    onUploaded={(url, kind) => addMedia(url, kind)}
                    onError={(m) => onToast("err", m)}
                  />
                  <input
                    value={imgUrl}
                    onChange={(e) => setImgUrl(e.target.value)}
                    placeholder="https://…/grafika.png · .mp4 · .webm"
                    className="flex-1 min-w-[140px] bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600"
                  />
                  <button
                    onClick={() => { addMedia(imgUrl); setImgUrl(""); }}
                    disabled={!imgUrl.trim()}
                    className="px-2 py-1 text-[11px] border border-zinc-800 text-zinc-400 hover:text-white hover:border-red-700 rounded disabled:opacity-40"
                  >
                    <Plus className="w-3 h-3 inline" /> {t("addImageUrl")}
                  </button>
                </div>
              </div>

              {/* Save + OBS URL */}
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => void save()} disabled={busy || !dirty} className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center gap-1.5">
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} {dirty ? t("save") : t("saved")}
                </button>
                <span className="text-[10px] text-zinc-600">{t("count", { n: els.length })}</span>

                <button
                  onClick={() => setSnap((v) => !v)}
                  title={t("snapHint")}
                  className={`px-2 h-7 text-[10px] font-bold uppercase tracking-widest border shrink-0 inline-flex items-center gap-1 ${snap ? "border-amber-700 text-amber-300" : "border-zinc-800 text-zinc-500 hover:border-zinc-600"}`}
                >
                  <Magnet className="w-3 h-3" /> {t("snap")}
                </button>

                <button onClick={exportScene} title={t("exportHint")} className="px-2 h-7 text-[10px] font-bold uppercase tracking-widest border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 shrink-0 inline-flex items-center gap-1">
                  <Download className="w-3 h-3" /> {t("export")}
                </button>

                <label title={t("importHint")} className="px-2 h-7 text-[10px] font-bold uppercase tracking-widest border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 shrink-0 inline-flex items-center gap-1 cursor-pointer">
                  <Upload className="w-3 h-3" /> {t("import")}
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void importScene(f); e.target.value = ""; }}
                  />
                </label>
              </div>

              {/* Zrzut z gry pod płótnem — pomoc warsztatowa, zapisywana lokalnie w przeglądarce. */}
              <div className="mt-2 flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                <input
                  value={bgUrl}
                  onChange={(e) => zapiszTlo(e.target.value.trim())}
                  placeholder={t("bgPlaceholder")}
                  className="flex-1 min-w-[140px] bg-black border border-zinc-800 px-2 py-1 text-[11px] text-white outline-hidden focus:border-red-600"
                />
                {bgUrl && (
                  <button onClick={() => zapiszTlo("")} title={t("bgClear")} className="text-zinc-500 hover:text-white shrink-0"><X className="w-3.5 h-3.5" /></button>
                )}
              </div>

              {liveUrl && (
                <div className="mt-2 flex items-center gap-2 border border-emerald-900/60 bg-emerald-950/20 p-2 rounded">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-500 shrink-0">{t("liveUrlLabel")}</span>
                  <code className="flex-1 text-[10px] text-zinc-400 font-mono truncate">{liveUrl}</code>
                  <a href={liveUrl} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white shrink-0" title={t("openUrl")}><ExternalLink className="w-3.5 h-3.5" /></a>
                  <button onClick={() => { void navigator.clipboard.writeText(liveUrl); }} className="text-zinc-400 hover:text-white shrink-0" title={t("copy")}><Copy className="w-3.5 h-3.5" /></button>
                </div>
              )}

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

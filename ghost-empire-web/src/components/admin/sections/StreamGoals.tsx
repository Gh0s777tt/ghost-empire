"use client";
// src/components/admin/sections/StreamGoals.tsx — lazily-loaded stream goals + hype train.
import { useState, useEffect, useCallback } from "react";
import { Target, Loader2, Eye, EyeOff, RefreshCw, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionCard } from "../shared";
import { OverlayPreview } from "@/components/admin/OverlayPreview";
import { GoalBar } from "@/components/GoalBar";

const GOAL_TYPE_LABEL: Record<string, string> = {
  subs:          "Subskrypcje",
  gift_subs:     "Gifted Subs",
  follows:       "Followsy",
  donations_pln: "Donacje (PLN)",
  cheers_bits:   "Cheery (bits)",
  yt_members:    "YouTube Members",
};

const RESET_MODE_LABEL: Record<string, string> = {
  manual:     "Ręczny",
  per_stream: "Co stream",
  daily:      "Codziennie",
  weekly:     "Co tydzień",
  monthly:    "Co miesiąc",
};

type StreamGoalData = {
  id: string;
  type: string;
  label: string;
  current: number;
  target: number;
  active: boolean;
  resetMode: string;
  color: string | null;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
};

type HypeTrainData = {
  active: boolean;
  level: number;
  goal: number;
  total: number;
  topContributor: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  endedAt: string | null;
};

export function StreamGoalsManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<StreamGoalData[]>([]);
  const [hypeTrain, setHypeTrain] = useState<HypeTrainData | null>(null);
  const [validTypes, setValidTypes] = useState<string[]>([]);
  const [validResetModes, setValidResetModes] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Create form state
  const [newType, setNewType] = useState("subs");
  const [newLabel, setNewLabel] = useState("");
  const [newTarget, setNewTarget] = useState("100");
  const [newColor, setNewColor] = useState("");
  const [newResetMode, setNewResetMode] = useState("manual");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stream-goals");
      const data = await res.json();
      if (res.ok) {
        setGoals(data.goals ?? []);
        setHypeTrain(data.hypeTrain ?? null);
        setValidTypes(data.validTypes ?? []);
        setValidResetModes(data.validResetModes ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function call(action: string, payload: Record<string, unknown>) {
    const res = await fetch("/api/admin/stream-goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) {
      onToast("err", data.error ?? "Błąd");
      return false;
    }
    return true;
  }

  async function createGoal() {
    const target = parseInt(newTarget, 10);
    if (!newLabel.trim() || !target || target < 1) {
      onToast("err", "Wpisz label i target > 0");
      return;
    }
    setBusy("create");
    const ok = await call("create", {
      type: newType,
      label: newLabel.trim(),
      target,
      color: newColor || undefined,
      resetMode: newResetMode,
    });
    if (ok) {
      setNewLabel(""); setNewTarget("100"); setNewColor("");
      onToast("ok", "Cel utworzony");
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  async function toggleActive(g: StreamGoalData) {
    setBusy(g.id);
    if (await call("update", { id: g.id, active: !g.active })) await load();
    setBusy(null);
  }

  async function resetGoal(g: StreamGoalData) {
    if (!confirm(`Reset celu "${g.label}" do 0?`)) return;
    setBusy(g.id);
    if (await call("reset", { id: g.id })) { onToast("ok", "Wyzerowano"); await load(); }
    setBusy(null);
  }

  async function deleteGoal(g: StreamGoalData) {
    if (!confirm(`Usunąć cel "${g.label}"?`)) return;
    setBusy(g.id);
    if (await call("delete", { id: g.id })) { onToast("ok", "Usunięto"); await load(); }
    setBusy(null);
  }

  async function bumpCurrent(g: StreamGoalData, delta: number) {
    setBusy(g.id);
    if (await call("update", { id: g.id, current: Math.max(0, g.current + delta) })) await load();
    setBusy(null);
  }

  return (
    <SectionCard title="Stream Goals + Hype Train" icon={Target}>
      <p className="text-zinc-500 text-xs mb-3">
        Cele wyświetlane na OBS overlay. Auto-inkrementowane przez Twitch EventSub (subs/gifts/cheers), Streamlabs (donacje PLN), YouTube super chats + members.
      </p>

      <div className="mb-4">
        <OverlayPreview path="/overlay/goals" note="Paski celów pojawiają się w lewym-dolnym rogu; hype train (gdy aktywny) u góry.">
          <GoalBar goal={{ id: "preview1", type: "subs", label: "500 subów = nowy setup!", current: 327, target: 500, color: null, completedAt: null }} accent="#E50914" />
          <GoalBar goal={{ id: "preview2", type: "donations_pln", label: "Cel miesiąca", current: 1500, target: 1500, color: "#10b981", completedAt: new Date().toISOString() }} accent="#E50914" />
        </OverlayPreview>
      </div>

      {/* Hype Train status */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
          🚂 Hype Train
        </div>
        {hypeTrain && hypeTrain.active ? (
          <div className="text-sm">
            <span className="text-yellow-300 font-bold">AKTYWNY</span> — Level {hypeTrain.level} ·
            {" "}{hypeTrain.total.toLocaleString("pl-PL")} / {hypeTrain.goal.toLocaleString("pl-PL")} pkt
            {hypeTrain.topContributor && <> · Top: <strong>{hypeTrain.topContributor}</strong></>}
            {hypeTrain.expiresAt && (
              <span className="text-[10px] text-zinc-500 ml-2">
                expiry {new Date(hypeTrain.expiresAt).toLocaleTimeString("pl-PL")}
              </span>
            )}
          </div>
        ) : (
          <div className="text-xs text-zinc-500">
            Nieaktywny. {hypeTrain?.endedAt && <>Ostatni: Level {hypeTrain.level} ({new Date(hypeTrain.endedAt).toLocaleString("pl-PL")})</>}
            {!hypeTrain && <> — Twitch EventSub musi mieć subskrypcję <code>channel.hype_train.*</code> (zostaną dodane przy następnym &quot;Setup&quot; w sekcji Twitch).</>}
          </div>
        )}
      </div>

      {/* Goals list */}
      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : (
        <div className="space-y-2 mb-4">
          {goals.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
              Brak celów. Dodaj pierwszy poniżej.
            </div>
          ) : (
            goals.map((g) => {
              const pct = Math.min(100, (g.current / Math.max(1, g.target)) * 100);
              const color = g.color ?? "#E50914";
              return (
                <div
                  key={g.id}
                  className={cn(
                    "border bg-black/30 p-3",
                    g.active ? "border-zinc-800" : "border-zinc-900 opacity-60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border" style={{ borderColor: color, color }}>
                        {GOAL_TYPE_LABEL[g.type] ?? g.type}
                      </span>
                      <span className="text-sm text-white truncate">{g.label}</span>
                      {g.completedAt && (
                        <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-green-700 bg-green-950/40 text-green-300">
                          ✓ DONE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => bumpCurrent(g, -1)}
                        disabled={busy === g.id || pending}
                        className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center text-xs"
                        title="−1"
                      >−</button>
                      <button
                        onClick={() => bumpCurrent(g, 1)}
                        disabled={busy === g.id || pending}
                        className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center text-xs"
                        title="+1"
                      >+</button>
                      <button
                        onClick={() => toggleActive(g)}
                        disabled={busy === g.id || pending}
                        className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 px-2 h-6 text-[9px] font-mono uppercase"
                        title={g.active ? "Wyłącz" : "Włącz"}
                      >
                        {g.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => resetGoal(g)}
                        disabled={busy === g.id || pending}
                        className="text-zinc-500 hover:text-orange-400 border border-zinc-800 hover:border-orange-700 w-6 h-6 flex items-center justify-center"
                        title="Reset"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => deleteGoal(g)}
                        disabled={busy === g.id || pending}
                        className="text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-6 h-6 flex items-center justify-center"
                        title="Usuń"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-zinc-900 rounded-sm overflow-hidden">
                      <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className="text-[11px] font-mono text-white tabular-nums shrink-0">
                      {g.current.toLocaleString("pl-PL")} / {g.target.toLocaleString("pl-PL")}
                      <span className="text-zinc-500 ml-1">({pct.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-1">
                    Reset: {RESET_MODE_LABEL[g.resetMode] ?? g.resetMode}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Create new goal */}
      <div className="border border-zinc-800 bg-black/30 p-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
          Dodaj nowy cel
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">Typ</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600"
            >
              {validTypes.map((t) => (
                <option key={t} value={t}>{GOAL_TYPE_LABEL[t] ?? t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">Reset</label>
            <select
              value={newResetMode}
              onChange={(e) => setNewResetMode(e.target.value)}
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600"
            >
              {validResetModes.map((m) => (
                <option key={m} value={m}>{RESET_MODE_LABEL[m] ?? m}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">Label (widoczny na overlay)</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="np. 500 subów = nowy setup!"
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">Target</label>
            <input
              type="number"
              min={1}
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">Kolor (opcjonalny)</label>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={newColor || "#E50914"}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-9 h-7 border border-zinc-700 bg-black/40 cursor-pointer"
              />
              <input
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                placeholder="#hex (puste = domyślny)"
                className="flex-1 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600"
              />
            </div>
          </div>
        </div>
        <button
          onClick={createGoal}
          disabled={busy === "create" || pending}
          className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy === "create" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Dodaj cel
        </button>
      </div>
    </SectionCard>
  );
}

"use client";
// src/app/overlay/OverlayClient.tsx
// Polls /api/alerts/queue every ~1.2s, queues alerts, shows one at a time.
import { useEffect, useRef, useState, useCallback } from "react";
import { AlertCard } from "@/components/AlertCard";
import {
  resolveAlertAnchorStyle,
  scaleOriginFor,
  DEFAULT_ALERT_TYPE_CFG,
  type AlertAnimation,
  type AlertPosition,
} from "@/lib/alert-types";

const POLL_INTERVAL_MS = 1200;
const DEFAULT_DURATION = 6000;

// TTS (text-to-speech) is opt-in via URL params on the OBS source — no server/admin
// config needed: ?token=…&tts=1 (optionally &ttsTypes=donation,twitch_sub | all,
// &ttsLang=pl-PL, &ttsRate=1, &ttsVolume=1, &ttsVoice=<name>). Uses the browser's
// built-in speechSynthesis (works in OBS' embedded browser), so it's free.
type TtsCfg = {
  enabled: boolean;
  types: Set<string> | "all";
  lang: string;
  rate: number;
  volume: number;
  voice: string | null;
};

// Default spoken alert types when ?tts=1 with no explicit ?ttsTypes — the "celebration"
// alerts (money + wins). Noisy/low-value types (level_up, welcome, shop, test) stay silent
// unless the streamer opts them in with ?ttsTypes=all or an explicit list.
const DEFAULT_TTS_TYPES = ["donation", "twitch_sub", "twitch_gift_sub", "twitch_cheer", "event_win"];

type AlertItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  icon: string | null;
  actorName: string | null;
  actorImage: string | null;
  amount: number | null;
  amountLabel: string | null;
  accent?: string | null;
  animation?: AlertAnimation;
  position?: AlertPosition;
  soundUrl?: string | null;
  createdAt: string;
};

type QueueResponse = {
  now: string;
  settings: {
    durationMs: number;
    accentColor: string;
    soundEnabled: boolean;
    enabledTypes: string[];
    sizeScale: number;
    textScale: number;
    textColor: string;
  };
  alerts: AlertItem[];
};

export function OverlayClient() {
  const [token, setToken] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"idle" | "ok" | "unauthorized" | "no-token">("idle");
  const [current, setCurrent] = useState<AlertItem | null>(null);
  const [visible, setVisible] = useState(false);
  const [accent, setAccent] = useState("#E50914");
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [sizeScale, setSizeScale] = useState(1);
  const [textScale, setTextScale] = useState(1);
  const [textColor, setTextColor] = useState("#d4d4d8");

  const queueRef = useRef<AlertItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const lastSinceRef = useRef<string | null>(null);
  const currentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsRef = useRef<TtsCfg | null>(null);

  // Read token + TTS config from URL on mount
  useEffect(() => {
    const url = new URL(window.location.href);
    const p = url.searchParams;

    // TTS config (URL-driven; no server/admin needed).
    if (["1", "true", "yes", "on"].includes((p.get("tts") ?? "").toLowerCase())) {
      const raw = (p.get("ttsTypes") ?? "").trim().toLowerCase();
      const types: Set<string> | "all" =
        raw === "all" ? "all" : raw ? new Set(raw.split(",").map((s) => s.trim()).filter(Boolean)) : new Set(DEFAULT_TTS_TYPES);
      const num = (k: string, def: number, min: number, max: number) => {
        const v = parseFloat(p.get(k) ?? "");
        return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
      };
      ttsRef.current = {
        enabled: true,
        types,
        lang: p.get("ttsLang") || "pl-PL",
        rate: num("ttsRate", 1, 0.5, 2),
        volume: num("ttsVolume", 1, 0, 1),
        voice: p.get("ttsVoice"),
      };
    }

    const t = p.get("token");
    if (!t) {
      setAuthStatus("no-token");
      return;
    }
    setToken(t);
  }, []);

  const showNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      setVisible(false);
      setCurrent(null);
      return;
    }
    setCurrent(next);
    setVisible(true);
    if (soundEnabled) {
      if (next.soundUrl) {
        // Custom per-type sound (URL). Falls back silently if it can't play.
        try { void new Audio(next.soundUrl).play().catch(() => {}); } catch { /* ignore */ }
      } else {
        playDing();
      }
    }
    // Optional spoken alert (?tts=1 on the OBS URL) — independent of the ding.
    if (ttsRef.current?.enabled) speakAlert(next, ttsRef.current);

    if (currentTimerRef.current) clearTimeout(currentTimerRef.current);
    currentTimerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(() => showNext(), 400); // wait for fade-out anim
    }, duration);
  }, [duration, soundEnabled]);

  // Polling loop
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const params = new URLSearchParams({ token });
        if (lastSinceRef.current) params.set("since", lastSinceRef.current);
        const res = await fetch(`/api/alerts/queue?${params.toString()}`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 401) {
          setAuthStatus("unauthorized");
          return;
        }
        if (!res.ok) return;
        const data: QueueResponse = await res.json();
        setAuthStatus("ok");
        setAccent(data.settings.accentColor);
        setDuration(data.settings.durationMs);
        setSoundEnabled(data.settings.soundEnabled);
        setSizeScale(data.settings.sizeScale ?? 1);
        setTextScale(data.settings.textScale ?? 1);
        setTextColor(data.settings.textColor ?? "#d4d4d8");
        lastSinceRef.current = data.now;

        // Add new alerts to queue (dedupe by id — defensive against overlap)
        for (const a of data.alerts) {
          if (seenIdsRef.current.has(a.id)) continue;
          seenIdsRef.current.add(a.id);
          queueRef.current.push(a);
        }

        // Start showing if nothing currently on screen
        if (!currentTimerRef.current && queueRef.current.length > 0) {
          showNext();
        } else if (queueRef.current.length === 0 && !visible) {
          // nothing to do
        }
      } catch (e) {
        // Network blip — try again next tick
        console.error("[overlay] poll failed", e);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (currentTimerRef.current) clearTimeout(currentTimerRef.current);
      currentTimerRef.current = null;
    };
  }, [token, showNext, visible]);

  if (authStatus === "no-token") {
    return (
      <div style={statusBox}>
        <div style={{ color: "#fff" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Missing token</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Add <code>?token=&lt;OVERLAY_TOKEN&gt;</code> to the URL.
          </div>
        </div>
      </div>
    );
  }

  if (authStatus === "unauthorized") {
    return (
      <div style={statusBox}>
        <div style={{ color: "#fff" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Invalid token</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Check OVERLAY_TOKEN in Vercel env vs the URL parameter.
          </div>
        </div>
      </div>
    );
  }

  // Position + animation come from the current alert's per-type config (queue),
  // falling back to the defaults (bottom-right / slide) for unconfigured types.
  const pos: AlertPosition = current?.position ?? DEFAULT_ALERT_TYPE_CFG.position;
  const anim: AlertAnimation = current?.animation ?? DEFAULT_ALERT_TYPE_CFG.animation;
  const { outer, inner } = resolveAlertAnchorStyle(pos, anim, visible);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        fontFamily: "'Inter', system-ui, sans-serif",
        zIndex: 999999,
      }}
    >
      {/* Alert anchor — outer places it (per-type position), inner animates it. */}
      <div style={outer}>
        <div style={inner}>
          {current && (
            <AlertCard
              alert={current}
              accent={current.accent ?? accent}
              sizeScale={sizeScale}
              textScale={textScale}
              textColor={textColor}
              scaleOrigin={scaleOriginFor(pos)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// AlertCard is imported from @/components/AlertCard (shared with the /admin#alerts live preview).

const statusBox: React.CSSProperties = {
  position: "fixed",
  top: 16,
  left: 16,
  padding: "12px 16px",
  borderRadius: 8,
  background: "rgba(220, 38, 38, 0.85)",
  fontFamily: "system-ui, sans-serif",
  fontSize: 14,
  zIndex: 999999,
};

// Tiny synthesized ding so we don't need to ship an audio file.
let audioCtx: AudioContext | null = null;
function playDing() {
  try {
    if (!audioCtx) {
      const Ctor =
        typeof window !== "undefined"
          ? window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          : null;
      if (!Ctor) return;
      audioCtx = new Ctor();
    }
    const now = audioCtx.currentTime;
    // Two-tone chime: 880Hz → 1320Hz
    const tones = [
      { freq: 880, start: 0, dur: 0.12 },
      { freq: 1320, start: 0.09, dur: 0.18 },
    ];
    for (const t of tones) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = t.freq;
      gain.gain.setValueAtTime(0, now + t.start);
      gain.gain.linearRampToValueAtTime(0.18, now + t.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + t.start);
      osc.stop(now + t.start + t.dur + 0.02);
    }
  } catch {
    /* sound is optional */
  }
}

// --- TTS (browser speechSynthesis) — opt-in via ?tts=1 on the OBS URL ---

/** Spoken text for an alert: "<actor> <message>", tidied for Polish speech. */
function buildTtsText(a: AlertItem): string {
  const base = `${a.actorName ?? ""} ${a.message ?? ""}`.trim() || a.title || "";
  return base
    .replace(/\s+/g, " ")
    .replace(/\bGT\b/g, "Ghost Tokenów")
    .replace(/\bPLN\b/gi, "złotych")
    .trim();
}

function speakAlert(a: AlertItem, cfg: TtsCfg) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (cfg.types !== "all" && !cfg.types.has(a.type)) return;
    const text = buildTtsText(a);
    if (!text) return;
    const synth = window.speechSynthesis;
    synth.cancel(); // don't let alerts pile up mid-sentence
    const u = new SpeechSynthesisUtterance(text);
    u.lang = cfg.lang;
    u.rate = cfg.rate;
    u.volume = cfg.volume;
    if (cfg.voice) {
      const v = synth.getVoices().find((vo) => vo.name === cfg.voice || vo.voiceURI === cfg.voice);
      if (v) u.voice = v;
    }
    synth.speak(u);
  } catch {
    /* TTS is optional — never break the overlay */
  }
}

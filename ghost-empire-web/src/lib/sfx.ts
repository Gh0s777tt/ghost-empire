// src/lib/sfx.ts
// Tiny synthesized casino sound effects (Web Audio, zero files, ~1 kB). Opt-in:
// the preference lives in localStorage ("ge-sfx", default ON) and is toggled from
// the casino UI. The AudioContext is created lazily on the first play() after a
// user gesture (required by autoplay policies). All sounds are short envelopes on
// oscillators/noise — no assets to load, nothing on the critical path.
type SfxName = "click" | "spin" | "win" | "lose" | "bomb" | "cashout";

let ctx: AudioContext | null = null;
const KEY = "ge-sfx";

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function sfxEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
}

export function sfxToggle(): boolean {
  const next = !sfxEnabled();
  try { localStorage.setItem(KEY, next ? "1" : "0"); } catch {}
  return next;
}

/** One oscillator "blip": freq (optionally gliding to freq2), duration, volume, shape. */
function tone(c: AudioContext, at: number, freq: number, dur: number, vol: number, type: OscillatorType = "sine", freq2?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (freq2 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), at + dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/** Short filtered-noise burst (for the bomb thud). */
function noise(c: AudioContext, at: number, dur: number, vol: number) {
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(g).connect(c.destination);
  src.start(at);
}

export function sfxPlay(name: SfxName) {
  if (!sfxEnabled()) return;
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  switch (name) {
    case "click":
      tone(c, t, 720, 0.05, 0.12, "square");
      break;
    case "spin": // rising whoosh — game started
      tone(c, t, 240, 0.28, 0.1, "sawtooth", 620);
      break;
    case "win": // C5–E5–G5 arpeggio + sparkle
      tone(c, t, 523, 0.12, 0.16, "triangle");
      tone(c, t + 0.09, 659, 0.12, 0.16, "triangle");
      tone(c, t + 0.18, 784, 0.2, 0.18, "triangle");
      tone(c, t + 0.3, 1568, 0.16, 0.08, "sine");
      break;
    case "lose": // sad slide down
      tone(c, t, 220, 0.3, 0.12, "sawtooth", 110);
      break;
    case "bomb": // noise burst + low thud
      noise(c, t, 0.22, 0.22);
      tone(c, t, 95, 0.3, 0.22, "sine", 40);
      break;
    case "cashout": // two bright bells
      tone(c, t, 880, 0.12, 0.14, "triangle");
      tone(c, t + 0.1, 1318, 0.22, 0.14, "triangle");
      break;
  }
}

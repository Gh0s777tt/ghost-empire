"use client";
// src/components/kasyno/KasynoClient.tsx
// Slots · coinflip · roulette · dice · crash · plinko · mines · hi-lo · blackjack · scratch,
// played for Ghost Tokens. Orchestrates bet state, the stage machine and the API calls; the
// GPU-composited boards + primitives live in ./shared (#732). Outcomes are ALWAYS server-decided —
// the boards just animate to land on the server's result. Respects prefers-reduced-motion.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import HowItWorks from "@/components/HowItWorks";
import { CommandHelp } from "@/components/CommandHelp";
import InfoTip from "@/components/InfoTip";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { emitBalance } from "@/lib/balance-bus";
import { sfxEnabled, sfxToggle, sfxPlay } from "@/lib/sfx";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { useTenantBranding } from "@/components/TenantBranding";
import { Link } from "@/i18n/navigation";
import {
  RouletteWheel, SlotReels, CoinFlip, DiceTrack, CrashRocket, PlinkoBoard,
  MinesGrid, ScratchCardView, HiloTable, BlackjackTable, WinBurst,
  reducedMotion, GAME_EMOJI, capGame, diceChanceOf, diceMultOf, DICE_MIN, DICE_MAX,
  type PlayResult, type Leaderboard, type History, type HiloState, type BjState,
  type MinesGameState, type Game, type Stage,
} from "./shared";

export function KasynoClient({ isAuthenticated, initialBalance }: { isAuthenticated: boolean; initialBalance: number | null }) {
  const t = useTranslations("kasyno");
  const fmt = useLocaleFmt();
  const { tokenSymbol } = useTenantBranding();
  const gameLabel: Record<string, string> = { slots: t("gameSlots"), coinflip: t("gameCoinflip"), roulette: t("gameRoulette"), dice: t("gameDice"), crash: t("gameCrash"), plinko: t("gamePlinko"), mines: t("gameMines"), blackjack: t("gameBlackjack"), hilo: t("gameHilo"), scratch: t("gameScratch") };
  const [balance, setBalance] = useState<number | null>(initialBalance);
  // Stake as a STRING so the field can be cleared and retyped freely ("" → invalid,
  // play buttons disable); the numeric `bet` derives from it, clamped to the API range.
  const [betInput, setBetInput] = useState("100");
  const bet = Math.min(100_000, parseInt(betInput, 10) || 0);
  const betValid = bet >= 10;
  // Casino lobby: pick a game tile first, then only that game is on screen.
  const [selected, setSelected] = useState<Game | "mines" | "blackjack" | "hilo" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lb, setLb] = useState<Leaderboard | null>(null);
  const [rouletteNum, setRouletteNum] = useState("");
  const [diceTarget, setDiceTarget] = useState(50);
  const [diceDir, setDiceDir] = useState<"under" | "over">("under");
  const [crashTarget, setCrashTarget] = useState(2);
  const [minesBombs, setMinesBombs] = useState(3);
  const [minesGame, setMinesGame] = useState<MinesGameState | null>(null);
  const [minesBusy, setMinesBusy] = useState(false);
  const [bjGame, setBjGame] = useState<BjState | null>(null);
  const [bjBusy, setBjBusy] = useState(false);
  const [hiloGame, setHiloGame] = useState<HiloState | null>(null);
  const [hiloBusy, setHiloBusy] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const playId = useRef(0);
  // Sound toggle (synthesized SFX, opt-out persisted in localStorage). Initialized in an
  // effect so SSR markup never depends on localStorage.
  const [sound, setSound] = useState(true);
  useEffect(() => { setSound(sfxEnabled()); }, []);
  // Animations override: only surfaced when the OS/browser requests reduced motion
  // (the most common cause of "animations don't work in my browser" reports).
  const [systemReduced, setSystemReduced] = useState(false);
  const [animForced, setAnimForced] = useState(false);
  useEffect(() => {
    setSystemReduced(!!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    try { setAnimForced(localStorage.getItem("ge-anim") === "force"); } catch { /* ignore */ }
  }, []);

  const loadLb = useCallback(async () => {
    try { setLb(await apiGet<Leaderboard>("/api/gt-games/leaderboard")); } catch { /* ignore */ }
  }, []);
  useEffect(() => { void loadLb(); }, [loadLb]);

  // Personal history + lifetime stats (signed-in only); refreshed after every game.
  const [hist, setHist] = useState<History | null>(null);
  const loadHist = useCallback(async () => {
    if (!isAuthenticated) return;
    try { setHist(await apiGet<History>("/api/gt-games/history")); } catch { /* ignore */ }
  }, [isAuthenticated]);
  useEffect(() => { void loadHist(); }, [loadHist]);

  // Progressive jackpot pool (public; refreshed after every game).
  const [jackpot, setJackpot] = useState<number | null>(null);
  const loadJackpot = useCallback(async () => {
    try { setJackpot((await apiGet<{ pool: number }>("/api/gt-games/jackpot")).pool); } catch { /* ignore */ }
  }, []);
  useEffect(() => { void loadJackpot(); }, [loadJackpot]);

  const settle = useCallback(() => {
    setStage((s) => {
      if (!s || s.settled) return s;
      if (s.result) { setBalance(s.result.newBalance); emitBalance(s.result.newBalance); }
      return { ...s, settled: true };
    });
    setBusy(false);
    void loadLb();
    void loadHist();
    void loadJackpot();
  }, [loadLb, loadHist, loadJackpot]);

  // Result sound — fires once per settled stage (effect, not inside the setStage updater).
  const sfxFor = useRef<number | null>(null);
  useEffect(() => {
    if (!stage?.settled || !stage.result || sfxFor.current === stage.id) return;
    sfxFor.current = stage.id;
    sfxPlay(stage.result.net > 0 ? "win" : "lose");
  }, [stage]);

  // Map an apiPost rejection to the right toast: a real HTTP error surfaces the server's
  // `error` message; a network failure (ApiError status 0) shows the generic connection error.
  function gameErr(e: unknown): string {
    return e instanceof ApiError && e.status !== 0 ? e.message || t("err") : t("connError");
  }

  async function play(game: Game, choice?: string) {
    if (busy || minesBusy || !betValid) return;
    setBusy(true); setError(null); setMinesGame(null); // single-shot games take over the stage
    const id = ++playId.current;
    sfxPlay("spin");
    setStage({ id, game, phase: "spin", result: null, settled: false });
    try {
      const d = await apiPost<PlayResult>("/api/gt-games/play", { game, bet, choice });
      setStage((s) => (s && s.id === id ? { ...s, phase: "land", result: d } : s));
    } catch (e) { setError(gameErr(e)); setStage(null); setBusy(false); }
  }

  // ── Mines (stateful: start → reveal tiles → cash out / bust) ──
  async function minesStartFn() {
    if (minesBusy || busy || !betValid || minesGame?.status === "active") return;
    setMinesBusy(true); setError(null); setStage(null); // mines takes over the stage
    try {
      const d = await apiPost<{ sessionId: string; bombs: number; newBalance: number }>("/api/gt-games/mines/start", { bet, bombs: minesBombs });
      setBalance(d.newBalance); emitBalance(d.newBalance);
      sfxPlay("spin");
      setMinesGame({ sessionId: d.sessionId, bombs: d.bombs, revealed: [], multiplier: 1, status: "active", bombSet: null, bet });
    } catch (e) { setError(gameErr(e)); }
    setMinesBusy(false);
  }
  async function minesRevealFn(tile: number) {
    if (minesBusy || !minesGame || minesGame.status !== "active") return;
    setMinesBusy(true);
    try {
      const d = await apiPost<{ bomb: boolean; revealed: number[]; bombSet: number[] | null; multiplier: number }>("/api/gt-games/mines/reveal", { sessionId: minesGame.sessionId, tile });
      if (d.bomb) { sfxPlay("bomb"); setMinesGame((g) => (g ? { ...g, status: "bust", revealed: d.revealed, bombSet: d.bombSet } : g)); void loadLb(); void loadHist(); }
      else { sfxPlay("click"); setMinesGame((g) => (g ? { ...g, revealed: d.revealed, multiplier: d.multiplier } : g)); }
    } catch (e) { setError(gameErr(e)); }
    setMinesBusy(false);
  }
  async function minesCashoutFn() {
    if (minesBusy || !minesGame || minesGame.status !== "active" || minesGame.revealed.length === 0) return;
    setMinesBusy(true);
    try {
      const d = await apiPost<{ newBalance: number; multiplier: number; bombSet: number[] | null; payout: number }>("/api/gt-games/mines/cashout", { sessionId: minesGame.sessionId });
      setBalance(d.newBalance); emitBalance(d.newBalance);
      sfxPlay("cashout");
      setMinesGame((g) => (g ? { ...g, status: "cashed", multiplier: d.multiplier, bombSet: d.bombSet, payout: d.payout } : g));
      void loadLb();
      void loadHist();
    } catch (e) { setError(gameErr(e)); }
    setMinesBusy(false);
  }

  // ── Hi-Lo (stateful: deal → guess hi/lo (streak) → cash out / bust) ──
  async function hiloAction(path: "start" | "guess" | "cashout", guess?: "hi" | "lo") {
    if (hiloBusy || busy) return;
    if (path === "start" && (!betValid || hiloGame?.status === "active")) return;
    if (path !== "start" && hiloGame?.status !== "active") return;
    setHiloBusy(true); setError(null);
    if (path === "start") { setStage(null); sfxPlay("spin"); }
    try {
      const payload = path === "start" ? { bet } : path === "guess" ? { sessionId: hiloGame?.sessionId, guess } : { sessionId: hiloGame?.sessionId };
      const d = await apiPost<{ ok: true; state: HiloState }>(`/api/gt-games/hilo/${path}`, payload);
      const s = d.state;
      setHiloGame(s);
      if (path === "start" && typeof s.newBalance === "number") { setBalance(s.newBalance); emitBalance(s.newBalance); }
      if (s.status === "busted") { sfxPlay("bomb"); void loadLb(); void loadHist(); void loadJackpot(); }
      else if (s.status === "cashed") {
        if (typeof s.newBalance === "number") { setBalance(s.newBalance); emitBalance(s.newBalance); }
        sfxPlay("cashout"); void loadLb(); void loadHist(); void loadJackpot();
      } else if (path === "guess") sfxPlay("click");
    } catch (e) { setError(e instanceof Error ? e.message : t("connError")); }
    setHiloBusy(false);
  }

  // ── Blackjack (stateful: deal → hit/stand/double → settle) ──
  function applyBjState(s: BjState) {
    setBjGame(s);
    if (s.status === "done" && s.result) {
      setBalance(s.result.newBalance);
      emitBalance(s.result.newBalance);
      sfxPlay(s.result.multiplier >= 2 ? "win" : s.result.multiplier === 1 ? "click" : "lose");
      void loadLb(); void loadHist(); void loadJackpot();
    }
  }
  async function bjAction(path: "start" | "hit" | "stand" | "double") {
    if (bjBusy || busy) return;
    if (path === "start" && (!betValid || bjGame?.status === "active")) return;
    if (path !== "start" && bjGame?.status !== "active") return;
    setBjBusy(true); setError(null);
    if (path === "start") { setStage(null); sfxPlay("spin"); }
    else sfxPlay("click");
    try {
      const payload = path === "start" ? { bet } : { sessionId: bjGame?.sessionId };
      const d = await apiPost<{ ok: true; state: BjState; newBalance?: number }>(`/api/gt-games/blackjack/${path}`, payload);
      if (path === "start" && typeof d.newBalance === "number") { setBalance(d.newBalance); emitBalance(d.newBalance); }
      applyBjState(d.state);
    } catch (e) { setError(e instanceof Error ? e.message : t("connError")); }
    setBjBusy(false);
  }

  const rouletteTarget = stage?.result?.roll?.n ?? (stage?.result?.detail ? (stage.result.detail.includes("00") ? 37 : (parseInt(stage.result.detail.replace(/\D/g, ""), 10) || 0)) : null);
  const reveal = stage?.settled ? stage.result : null;

  return (
    <div className="flex flex-col items-center gap-6">
      <style>{`
        @keyframes gefx-spin { to { transform: rotate(360deg); } }
        @keyframes gefx-dice-sweep { from { left: 6%; } to { left: 94%; } }
        @keyframes gefx-pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.18); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes gefx-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-5px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(3px); } }
        @keyframes gefx-flash { 0% { filter: brightness(1); } 30% { filter: brightness(2); } 100% { filter: brightness(1); } }
        @keyframes gefx-part { 0% { opacity: 1; } 100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) rotate(var(--rot)); opacity: 0; } }
        @keyframes gefx-tumble { from { transform: rotateX(0deg) rotateY(0deg); } to { transform: rotateX(360deg) rotateY(720deg); } }
      `}</style>
      <div className="text-center">
        <h1 className="text-3xl font-black text-white tracking-tight">{t("title")}</h1>
        <p className="text-zinc-400 mt-1 text-sm">{t("subtitlePre")} <code className="text-zinc-500">!slots 100</code> · <code className="text-zinc-500">!coinflip 50</code> · <code className="text-zinc-500">!roulette 100 red</code></p>
      </div>

      <HowItWorks>
        {selected === null ? (
          /* Lobby: just the one-line intro — per-game rules appear once you pick a game. */
          <p>{t("help")} <span className="text-zinc-500">{t("helpPickGame")}</span></p>
        ) : (
          /* In a game: only THIS game's rules. */
          <p>
            <b className="text-white">{GAME_EMOJI[selected] ?? "🎰"} {t(`game${capGame(selected)}`)}:</b>{" "}
            {t(`help${capGame(selected)}`)}
          </p>
        )}
      </HowItWorks>

      <div className="flex justify-center">
        <CommandHelp feature="kasyno" />
      </div>

      {!isAuthenticated ? (
        <Link href="/" className="px-8 py-3 rounded-full font-extrabold text-white bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500">{t("loginToPlay")}</Link>
      ) : selected === null ? (
        /* ── LOBBY: jackpot banner + game tiles — pick one, like a real casino ── */
        <>
          {jackpot != null && (
            <div className="w-full rounded-xl border border-amber-700/60 bg-gradient-to-r from-amber-950/50 via-zinc-950 to-zinc-950 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-lg tracking-wider text-amber-200">💰 {t("jackpot")}</span>
                <span className="font-mono text-2xl font-black text-amber-300 tabular-nums" style={{ textShadow: "0 0 18px rgba(245,193,66,.45)" }}>{fmt(jackpot)} {tokenSymbol}</span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">{t("jackpotHint")}</p>
            </div>
          )}
          <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-tour="kasyno-games">
            {([
              { id: "slots", emoji: "🎰" }, { id: "coinflip", emoji: "🪙" }, { id: "roulette", emoji: "🎡" },
              { id: "dice", emoji: "🎲" }, { id: "blackjack", emoji: "🃏" }, { id: "hilo", emoji: "↕️" },
              { id: "crash", emoji: "🚀" }, { id: "plinko", emoji: "⚪" }, { id: "mines", emoji: "💣" },
              { id: "scratch", emoji: "🎫" },
            ] as Array<{ id: Game | "mines" | "blackjack" | "hilo"; emoji: string }>).map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  setSelected(g.id); setError(null); sfxPlay("click");
                  if (bjGame?.status !== "active") setBjGame(null);
                  if (minesGame?.status !== "active") setMinesGame(null);
                  if (hiloGame?.status !== "active") setHiloGame(null);
                }}
                className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/70 py-7 transition-all hover:border-amber-500 hover:bg-zinc-900/80 hover:shadow-[0_0_24px_rgba(245,193,66,0.15)]"
              >
                <span className="text-5xl transition-transform group-hover:scale-110">{g.emoji}</span>
                <span className="font-bold text-zinc-300 group-hover:text-amber-300 transition-colors">{gameLabel[g.id]}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* back to lobby (blocked mid-game so an active stake can't be abandoned by accident) */}
          <button
            onClick={() => {
              setSelected(null); setStage(null); setError(null);
              if (minesGame?.status !== "active") setMinesGame(null);
              if (bjGame?.status !== "active") setBjGame(null);
              if (hiloGame?.status !== "active") setHiloGame(null);
            }}
            disabled={minesGame?.status === "active" || bjGame?.status === "active" || hiloGame?.status === "active"}
            className="self-start text-xs font-bold tracking-widest uppercase text-zinc-500 hover:text-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← {t("backToGames")}
          </button>

          {/* animation stage */}
          <div className="flex items-center justify-center" style={{ minHeight: 312 }}>
            {hiloGame ? (
              <HiloTable game={hiloGame} busy={hiloBusy} fmt={fmt} t={t} onGuess={(g) => hiloAction("guess", g)} onCashout={() => hiloAction("cashout")} />
            ) : bjGame ? (
              <BlackjackTable game={bjGame} busy={bjBusy} fmt={fmt} t={t} onHit={() => bjAction("hit")} onStand={() => bjAction("stand")} onDouble={() => bjAction("double")} balance={balance} bet={bet} />
            ) : minesGame ? (
              <MinesGrid game={minesGame} onReveal={minesRevealFn} onCashout={minesCashoutFn} busy={minesBusy} fmt={fmt} t={t} />
            ) : stage?.game === "roulette" ? (
              <RouletteWheel key={stage.id} phase={stage.phase} target={rouletteTarget} onSettle={settle} />
            ) : stage?.game === "slots" ? (
              <SlotReels key={stage.id} phase={stage.phase} reels={stage.result?.reels ?? null} onSettle={settle} />
            ) : stage?.game === "coinflip" ? (
              <CoinFlip key={stage.id} phase={stage.phase} win={stage.result ? stage.result.payout > 0 : null} onSettle={settle} />
            ) : stage?.game === "dice" ? (
              <DiceTrack key={stage.id} phase={stage.phase} dice={stage.result?.dice ?? null} onSettle={settle} />
            ) : stage?.game === "crash" ? (
              <CrashRocket key={stage.id} phase={stage.phase} crash={stage.result?.crash ?? null} onSettle={settle} />
            ) : stage?.game === "plinko" ? (
              <PlinkoBoard key={stage.id} phase={stage.phase} plinko={stage.result?.plinko ?? null} onSettle={settle} />
            ) : stage?.game === "scratch" ? (
              <ScratchCardView key={stage.id} phase={stage.phase} scratch={stage.result?.scratch ?? null} onSettle={settle} revealAllLabel={t("scratchAll")} />
            ) : (
              <div className="text-zinc-700 text-5xl tracking-widest">🎰</div>
            )}
          </div>

          {/* reveal (+ celebration burst on every win, all games) */}
          <div className="relative min-h-[52px] flex flex-col items-center justify-center text-center">
            {reveal ? (
              <>
                {reveal.net > 0 && !reducedMotion() && <WinBurst seed={(stage?.id ?? 0) + reveal.payout} />}
                <div
                  className={`text-2xl font-bold ${reveal.net >= 0 ? "text-emerald-300" : "text-zinc-400"}`}
                  style={{ animation: reducedMotion() ? undefined : "gefx-pop 380ms cubic-bezier(.34,1.56,.64,1)" }}
                >
                  {reveal.detail}
                </div>
                <div
                  className={`font-extrabold mt-0.5 ${reveal.net > 0 ? "text-emerald-400" : reveal.net < 0 ? "text-rose-400" : "text-zinc-300"}`}
                  style={{
                    animation: reducedMotion() ? undefined : "gefx-pop 460ms cubic-bezier(.34,1.56,.64,1)",
                    textShadow: reveal.net > 0 ? "0 0 22px rgba(52,211,153,.45)" : undefined,
                  }}
                >
                  {reveal.net > 0 ? `+${fmt(reveal.net)} ${tokenSymbol} 🎉` : reveal.net < 0 ? `−${fmt(-reveal.net)} ${tokenSymbol}` : `±0 ${tokenSymbol}`}
                </div>
              </>
            ) : stage ? (
              <div className="text-zinc-500 text-sm animate-pulse">{t("title")}…</div>
            ) : null}
          </div>
          {error && <div className="text-rose-400 text-sm">{error}</div>}

          <div className="flex flex-wrap items-center justify-center gap-2" data-tour="kasyno-stake">
            <label className="text-xs text-zinc-400">{t("stake")}
              <input
                type="text" inputMode="numeric" value={betInput} disabled={busy} placeholder="10"
                onChange={(e) => setBetInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                className={`ms-2 w-28 bg-black border px-2 py-1.5 text-sm text-white font-mono outline-hidden disabled:opacity-50 ${betValid ? "border-zinc-700 focus:border-amber-500" : "border-rose-700 focus:border-rose-500"}`}
              />
            </label>
            {/* quick-bet chips */}
            {[10, 50, 100, 500].map((v) => (
              <button key={v} onClick={() => { setBetInput(String(v)); sfxPlay("click"); }} disabled={busy}
                className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${bet === v ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"} disabled:opacity-40`}>
                {v}
              </button>
            ))}
            <button onClick={() => { setBetInput(String(Math.max(10, Math.min(100_000, balance ?? 10)))); sfxPlay("click"); }} disabled={busy || (balance ?? 0) < 10}
              className="px-2.5 py-1 rounded-full text-xs font-extrabold border border-amber-700 bg-amber-900/20 text-amber-400 hover:border-amber-500 transition-all disabled:opacity-40">
              MAX
            </button>
            {/* sound toggle (synthesized SFX, persisted) */}
            <button
              onClick={() => { const on = sfxToggle(); setSound(on); if (on) sfxPlay("click"); }}
              title={sound ? t("soundOn") : t("soundOff")}
              aria-label={sound ? t("soundOn") : t("soundOff")}
              className={`w-8 h-8 inline-flex items-center justify-center rounded-full border transition-all ${sound ? "border-amber-600 text-amber-300" : "border-zinc-700 text-zinc-600"}`}
            >
              {sound ? "🔊" : "🔇"}
            </button>
            {systemReduced && (
              <button
                onClick={() => {
                  const next = !animForced;
                  setAnimForced(next);
                  try { localStorage.setItem("ge-anim", next ? "force" : "auto"); } catch { /* ignore */ }
                }}
                title={animForced ? t("animForced") : t("animSystem")}
                aria-label={animForced ? t("animForced") : t("animSystem")}
                className={`w-8 h-8 inline-flex items-center justify-center rounded-full border transition-all ${animForced ? "border-amber-600 text-amber-300" : "border-zinc-700 text-zinc-600"}`}
              >
                🎬
              </button>
            )}
          </div>
          {selected === "slots" && (
            <div className="flex gap-3" data-tour="kasyno-slots">
              <button onClick={() => play("slots")} disabled={busy || !betValid || (balance ?? 0) < bet}
                className="px-6 py-3 rounded-full font-extrabold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 disabled:opacity-40 transition-all">{t("slots")}</button>
              <InfoTip text={t("helpSlots")} />
            </div>
          )}
          {selected === "coinflip" && (
            <div className="flex gap-3">
              <button onClick={() => play("coinflip")} disabled={busy || !betValid || (balance ?? 0) < bet}
                className="px-6 py-3 rounded-full font-extrabold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 disabled:opacity-40 transition-all">{t("coinflip")}</button>
              <InfoTip text={t("helpCoinflip")} />
            </div>
          )}

          {/* Roulette: red/black (2×) or a straight number (36×) */}
          {selected === "roulette" && (
          <div className="flex flex-wrap items-center justify-center gap-2" data-tour="kasyno-roulette">
            <span className="text-xs text-zinc-500 self-center me-1 inline-flex items-center gap-1">{t("rouletteLabel")} <InfoTip text={t("helpRoulette")} /></span>
            <button onClick={() => play("roulette", "red")} disabled={busy || !betValid || (balance ?? 0) < bet}
              className="px-4 py-2 rounded-full font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 transition-all">{t("red")}</button>
            <button onClick={() => play("roulette", "black")} disabled={busy || !betValid || (balance ?? 0) < bet}
              className="px-4 py-2 rounded-full font-bold text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 disabled:opacity-40 transition-all">{t("black")}</button>
            <button onClick={() => play("roulette", "0")} disabled={busy || !betValid || (balance ?? 0) < bet}
              className="px-3 py-2 rounded-full font-extrabold text-white bg-green-700 hover:bg-green-600 disabled:opacity-40 transition-all" title="36×">0</button>
            <button onClick={() => play("roulette", "00")} disabled={busy || !betValid || (balance ?? 0) < bet}
              className="px-3 py-2 rounded-full font-extrabold text-white bg-green-700 hover:bg-green-600 disabled:opacity-40 transition-all" title="36×">00</button>
            <input type="number" min={0} max={36} value={rouletteNum} disabled={busy} onChange={(e) => setRouletteNum(e.target.value)} placeholder="0-36"
              className="w-20 bg-black border border-zinc-700 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-amber-500 disabled:opacity-50" />
            <button onClick={() => play("roulette", rouletteNum)} disabled={busy || (balance ?? 0) < bet || !/^\d+$/.test(rouletteNum)}
              className="px-4 py-2 rounded-full font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 disabled:opacity-40 transition-all">{t("number")}</button>
          </div>
          )}

          {/* Dice: bet under/over a threshold — multiplier scales with the risk */}
          {selected === "dice" && (
          <div className="flex flex-wrap items-center justify-center gap-2" data-tour="kasyno-dice">
            <span className="text-xs text-zinc-500 self-center me-1 inline-flex items-center gap-1">{t("diceLabel")} <InfoTip text={t("helpDice")} /></span>
            <div className="flex rounded-full overflow-hidden border border-zinc-700">
              <button onClick={() => setDiceDir("under")} disabled={busy}
                className={`px-3 py-2 text-sm font-bold transition-all ${diceDir === "under" ? "bg-emerald-600 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"}`}>{t("diceUnder")}</button>
              <button onClick={() => setDiceDir("over")} disabled={busy}
                className={`px-3 py-2 text-sm font-bold transition-all ${diceDir === "over" ? "bg-emerald-600 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"}`}>{t("diceOver")}</button>
            </div>
            <input type="range" min={DICE_MIN} max={DICE_MAX} value={diceTarget} disabled={busy}
              onChange={(e) => setDiceTarget(parseInt(e.target.value, 10))} className="w-36 accent-amber-500 disabled:opacity-50" aria-label={t("diceLabel")} />
            <span className="text-xs text-zinc-300 font-mono tabular-nums w-32 text-center">
              {diceTarget} · {(diceChanceOf(diceDir, diceTarget) * 100).toFixed(0)}% · {diceMultOf(diceDir, diceTarget).toFixed(2)}×
            </span>
            <button onClick={() => play("dice", `${diceDir}:${diceTarget}`)} disabled={busy || !betValid || (balance ?? 0) < bet}
              className="px-4 py-2 rounded-full font-bold text-white bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 disabled:opacity-40 transition-all">{t("diceRoll")}</button>
          </div>
          )}

          {/* Crash: auto-cashout at a target multiplier; the rocket busts at a random point */}
          {selected === "crash" && (
          <div className="flex flex-wrap items-center justify-center gap-2" data-tour="kasyno-crash">
            <span className="text-xs text-zinc-500 self-center me-1 inline-flex items-center gap-1">{t("crashLabel")} <InfoTip text={t("helpCrash")} /></span>
            {[1.5, 2, 5, 10].map((m) => (
              <button key={m} onClick={() => setCrashTarget(m)} disabled={busy}
                className={`px-3 py-2 rounded-full text-sm font-bold transition-all ${crashTarget === m ? "bg-violet-600 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-700"}`}>{m % 1 ? m.toFixed(1) : m.toFixed(0)}×</button>
            ))}
            <input type="number" min={1.01} max={50} step={0.1} value={crashTarget} disabled={busy}
              onChange={(e) => setCrashTarget(Math.min(50, Math.max(1.01, parseFloat(e.target.value || "2"))))}
              className="w-20 bg-black border border-zinc-700 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-amber-500 disabled:opacity-50" />
            <span className="text-xs text-zinc-400 font-mono tabular-nums w-16 text-center">{(95 / crashTarget).toFixed(1)}%</span>
            <button onClick={() => play("crash", String(crashTarget))} disabled={busy || !betValid || (balance ?? 0) < bet}
              className="px-4 py-2 rounded-full font-bold text-white bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 disabled:opacity-40 transition-all">{t("crashStart")}</button>
          </div>
          )}

          {/* Plinko: drop the ball — no bet choice; edge buckets pay big, center sub-1 */}
          {selected === "plinko" && (
          <div className="flex flex-wrap items-center justify-center gap-2" data-tour="kasyno-plinko">
            <span className="text-xs text-zinc-500 self-center me-1 inline-flex items-center gap-1">{t("plinkoLabel")} <InfoTip text={t("helpPlinko")} /></span>
            <button onClick={() => play("plinko")} disabled={busy || !betValid || (balance ?? 0) < bet}
              className="px-6 py-2.5 rounded-full font-bold text-white bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-500 disabled:opacity-40 transition-all">{t("plinkoDrop")}</button>
          </div>
          )}

          {/* Blackjack: deal a hand vs the dealer (controls live on the table while active) */}
          {selected === "blackjack" && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-zinc-500 self-center me-1 inline-flex items-center gap-1">{gameLabel.blackjack} <InfoTip text={t("helpBlackjack")} /></span>
            <button onClick={() => bjAction("start")} disabled={bjBusy || !betValid || bjGame?.status === "active" || (balance ?? 0) < bet}
              className="px-6 py-2.5 rounded-full font-bold text-white bg-gradient-to-r from-emerald-700 to-green-600 hover:from-emerald-600 disabled:opacity-40 transition-all">{t("bjDeal")}</button>
          </div>
          )}

          {/* Scratch: buy a ticket, scratch the 9 fields — three matching symbols win */}
          {selected === "scratch" && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-zinc-500 self-center me-1 inline-flex items-center gap-1">{gameLabel.scratch} <InfoTip text={t("helpScratch")} /></span>
            <button onClick={() => play("scratch")} disabled={busy || !betValid || (balance ?? 0) < bet}
              className="px-6 py-2.5 rounded-full font-bold text-white bg-gradient-to-r from-lime-700 to-emerald-600 hover:from-lime-600 disabled:opacity-40 transition-all">{t("scratchBuy")}</button>
          </div>
          )}

          {/* Hi-Lo: deal a card, guess higher/lower, streak multiplies, cash out anytime */}
          {selected === "hilo" && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-zinc-500 self-center me-1 inline-flex items-center gap-1">{gameLabel.hilo} <InfoTip text={t("helpHilo")} /></span>
            <button onClick={() => hiloAction("start")} disabled={hiloBusy || !betValid || hiloGame?.status === "active" || (balance ?? 0) < bet}
              className="px-6 py-2.5 rounded-full font-bold text-white bg-gradient-to-r from-cyan-700 to-sky-600 hover:from-cyan-600 disabled:opacity-40 transition-all">{t("hiloDeal")}</button>
          </div>
          )}

          {/* Mines: pick bombs, reveal tiles, dodge bombs, cash out anytime */}
          {selected === "mines" && (
          <div className="flex flex-wrap items-center justify-center gap-2" data-tour="kasyno-mines">
            <span className="text-xs text-zinc-500 self-center me-1 inline-flex items-center gap-1">{t("minesLabel")} <InfoTip text={t("helpMines")} /></span>
            {[1, 3, 5, 10].map((b) => (
              <button key={b} onClick={() => setMinesBombs(b)} disabled={minesGame?.status === "active"}
                className={`px-3 py-2 rounded-full text-sm font-bold transition-all ${minesBombs === b ? "bg-rose-600 text-white" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-700"} disabled:opacity-40`}>{b} 💣</button>
            ))}
            <button onClick={minesStartFn} disabled={minesBusy || !betValid || minesGame?.status === "active" || (balance ?? 0) < bet}
              className="px-5 py-2 rounded-full font-bold text-white bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 disabled:opacity-40 transition-all">{t("minesStart")}</button>
          </div>
          )}

          <div className="text-sm text-zinc-400">{t("balance")} <span className="font-bold text-white">{fmt(balance ?? 0)} {tokenSymbol}</span></div>
        </>
      )}

      {/* leaderboard */}
      {lb && (lb.bigWins.length > 0 || lb.topNet.length > 0) && (
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4" data-tour="kasyno-leaderboard">
          <div>
            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t("bigWins")}</h2>
            <ul className="space-y-1">
              {lb.bigWins.map((w) => (
                <li key={w.id} className="flex items-center justify-between text-sm bg-zinc-950 border border-zinc-900 px-3 py-1.5">
                  <span className="text-zinc-300 truncate">{w.name} <span className="text-zinc-600">{gameLabel[w.game] ?? w.game}</span></span>
                  <span className="text-emerald-400 font-bold">+{fmt(w.net)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t("topNet")}</h2>
            <ul className="space-y-1">
              {lb.topNet.map((tn, i) => (
                <li key={i} className="flex items-center justify-between text-sm bg-zinc-950 border border-zinc-900 px-3 py-1.5">
                  <span className="text-zinc-300 truncate">{tn.name}</span>
                  <span className={tn.net >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>{tn.net >= 0 ? "+" : ""}{fmt(tn.net)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* personal stats + recent games (signed-in) */}
      {isAuthenticated && hist && (
        <div className="w-full mt-2">
          <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t("myStats")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <div className="bg-zinc-950 border border-zinc-900 px-3 py-2 text-center">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">{t("statGames")}</div>
              <div className="text-white font-bold tabular-nums">{fmt(hist.stats.games)}</div>
            </div>
            <div className="bg-zinc-950 border border-zinc-900 px-3 py-2 text-center">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">{t("statWinrate")}</div>
              <div className="text-white font-bold tabular-nums">{hist.stats.games > 0 ? Math.round((hist.stats.wins / hist.stats.games) * 100) : 0}%</div>
            </div>
            <div className="bg-zinc-950 border border-zinc-900 px-3 py-2 text-center">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">{t("statBest")}</div>
              <div className="text-emerald-400 font-bold tabular-nums">+{fmt(hist.stats.best)}</div>
            </div>
            <div className="bg-zinc-950 border border-zinc-900 px-3 py-2 text-center">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">{t("statNet")}</div>
              <div className={`font-bold tabular-nums ${hist.stats.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{hist.stats.net >= 0 ? "+" : ""}{fmt(hist.stats.net)}</div>
            </div>
          </div>
          <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t("myHistory")}</h2>
          {hist.recent.length === 0 ? (
            <div className="text-sm text-zinc-600 bg-zinc-950 border border-zinc-900 px-3 py-2.5">{t("noHistory")}</div>
          ) : (
            <ul className="space-y-1">
              {hist.recent.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 text-sm bg-zinc-950 border border-zinc-900 px-3 py-1.5">
                  <span className="text-zinc-400 truncate">
                    <span className="text-zinc-600">{gameLabel[h.game] ?? h.game}</span>
                    {h.detail ? <span className="ms-2 text-zinc-300">{h.detail}</span> : null}
                  </span>
                  <span className={`shrink-0 font-bold tabular-nums ${h.net > 0 ? "text-emerald-400" : h.net < 0 ? "text-rose-400" : "text-zinc-400"}`}>
                    {h.net > 0 ? "+" : ""}{fmt(h.net)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

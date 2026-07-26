"use client";
// src/app/overlay/obs-control/ObsControlClient.tsx
// PHASE 3C Slice 3 — the OBS actuator. A browser source the streamer adds INSIDE OBS:
// it connects to their local OBS WebSocket (ws://localhost:4455), polls the alert feed,
// and runs their event->action rules (lib/obs-rules) — switching scenes, toggling
// sources/filters, with optional auto-revert. Pure client-side (obs-websocket-js runs in
// the browser, same machine as OBS, so it can reach localhost). Dormant until the
// streamer adds this source AND sets OBS WS creds + rules in /admin.
//
// REVERTS ARE LEDGERED, NOT FIRE-AND-FORGET (#806). Two timed effects on the same target used to
// corrupt each other: the "previous" state was re-read while a revert was still pending (so a revert
// could restore ANOTHER effect's state — permanently, for scenes), and the bare setTimeout handles
// were discarded, so nothing could cancel or clean them up. Now every target has at most ONE pending
// revert: the first effect records the real baseline, later effects only push the deadline out, and
// unmounting restores everything instead of leaving the streamer with a blurred scene. The decision
// logic is pure and tested in lib/obs-revert.ts; this file only owns the timers and the OBS calls.
import { useEffect, useRef, useState } from "react";
import OBSWebSocket from "obs-websocket-js";
import { obsActionsForAlert, type ObsRule, type ObsAction } from "@/lib/obs-rules";
import { revertTargetKey, mergeRevert, revertDelayMs, type PendingRevert, type RestoreSpec } from "@/lib/obs-revert";
import { intensityValue } from "@/lib/obs-rules";
import { hueRevertTargetKey } from "@/lib/obs-revert";
import { hueActionsForAlert, briFromPercent, hexToXy, type HueAction, type HueRule } from "@/lib/hue-rules";

type HueConfig = { bridgeIp: string; apiKey: string; rules: HueRule[] };
type Config = { obsUrl: string | null; obsPassword: string | null; rules: ObsRule[]; hue: HueConfig | null };
type Status = "connecting" | "connected" | "no-config" | "no-token" | "bad-token" | "error";

const POLL_MS = 2000;

export function ObsControlClient() {
  const [status, setStatus] = useState<Status>("connecting");
  const [detail, setDetail] = useState("");
  const [rulesCount, setRulesCount] = useState(0);
  const [lastAction, setLastAction] = useState("—");
  const [actionCount, setActionCount] = useState(0);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setStatus("no-token");
      return;
    }

    let stopped = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const obs = new OBSWebSocket();
    let rules: ObsRule[] = [];
    const seen = new Set<string>();
    let since = new Date(Date.now() - 5000).toISOString();

    /** One pending revert per target, with its live timer so it can be cancelled. */
    const pendingReverts = new Map<string, { revert: PendingRevert; timer: ReturnType<typeof setTimeout> }>();

    /** Apply a restore. Best-effort: OBS may be gone, and a failed revert must not throw into polling. */
    async function applyRestore(r: RestoreSpec): Promise<void> {
      try {
        if (r.kind === "scene") {
          await obs.call("SetCurrentProgramScene", { sceneName: r.sceneName });
        } else if (r.kind === "source") {
          await obs.call("SetSceneItemEnabled", { sceneName: r.sceneName, sceneItemId: r.sceneItemId, sceneItemEnabled: r.enabled });
        } else if (r.kind === "filter") {
          await obs.call("SetSourceFilterEnabled", { sourceName: r.sourceName, filterName: r.filterName, filterEnabled: r.enabled });
        } else if (r.kind === "hueLight") {
          await huePut(r.lightId, r.state);
        } else {
          // Restore the WHOLE settings object we captured, so an intensity change cannot leave a
          // half-overwritten filter config behind.
          await obs.call("SetSourceFilterSettings", {
            sourceName: r.sourceName,
            filterName: r.filterName,
            // Captured straight off the OBS WebSocket, so it IS JSON — the cast is the boundary
            // between our own RestoreSpec type and obs-websocket-js's stricter JsonObject.
            filterSettings: r.settings as Record<string, never>,
            overlay: false,
          });
        }
      } catch {
        /* the scene may have been deleted or OBS closed — nothing useful to do here */
      }
    }

    /**
     * Schedule the revert for `key`, collapsing it with whatever is already pending.
     * `readBaseline` is only called when this effect owns the baseline, so we never re-read a state
     * that another effect has already modified.
     */
    async function scheduleRevert(key: string, delayMs: number, readBaseline: () => Promise<RestoreSpec>) {
      const existing = pendingReverts.get(key);
      // Read the baseline ONLY when nothing is pending. While a revert is queued, its stored baseline
      // is the one true "before" state — re-reading now would capture the running effect instead.
      const restore = existing ? existing.revert.restore : await readBaseline();
      const plan = mergeRevert(existing?.revert, { key, dueAt: Date.now() + delayMs, restore });
      if (plan.cancelPrevious && existing) clearTimeout(existing.timer);

      const timer = setTimeout(() => {
        pendingReverts.delete(key);
        void applyRestore(plan.pending.restore);
      }, revertDelayMs(plan.pending, Date.now()));
      pendingReverts.set(key, { revert: plan.pending, timer });
    }

    /** Bridge config for this session, filled from /api/obs-control/config. */
    let hue: HueConfig | null = null;

    /**
     * Write a light state through the bridge's LOCAL v1 API.
     *
     * `lightId` empty/"*" targets group 0, which is "all lights" — the only way the bridge exposes a
     * whole-house write. Plain http on the LAN is deliberate: the bridge's own certificate is
     * self-signed, and a browser source cannot click through a certificate warning.
     */
    async function huePut(lightId: string, state: Record<string, unknown>): Promise<void> {
      if (!hue) return;
      const all = !lightId || lightId === "*";
      const url = all
        ? `http://${hue.bridgeIp}/api/${hue.apiKey}/groups/0/action`
        : `http://${hue.bridgeIp}/api/${hue.apiKey}/lights/${encodeURIComponent(lightId)}/state`;
      try {
        await fetch(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(state) });
      } catch {
        /* the bridge may be off or the LAN unreachable — lights are best-effort, never fatal */
      }
    }

    /** Read what a light (or group 0) looks like NOW, so the ledger can put it back afterwards. */
    async function hueReadState(lightId: string): Promise<Record<string, unknown>> {
      if (!hue) return {};
      const all = !lightId || lightId === "*";
      try {
        const res = await fetch(
          all ? `http://${hue.bridgeIp}/api/${hue.apiKey}/groups/0` : `http://${hue.bridgeIp}/api/${hue.apiKey}/lights/${encodeURIComponent(lightId)}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as { state?: Record<string, unknown>; action?: Record<string, unknown> };
        // A single light reports `state`; a group reports `action`. Keep only the fields we write, so a
        // restore cannot push back read-only properties the bridge would reject.
        const src = (all ? json.action : json.state) ?? {};
        const keep: Record<string, unknown> = {};
        for (const k of ["on", "bri", "xy"]) if (k in src) keep[k] = src[k];
        return keep;
      } catch {
        return {};
      }
    }

    async function actuateHue(a: HueAction, lightId: string | null) {
      if (!hue) return;
      const id = lightId ?? "";
      const key = hueRevertTargetKey(lightId);

      if (a.revertAfterMs) {
        await scheduleRevert(key, a.revertAfterMs, async () => ({
          kind: "hueLight",
          lightId: id,
          state: await hueReadState(id),
        }));
      }

      if (a.kind === "turn") {
        await huePut(id, { on: a.on });
        setLastAction(`hue: ${a.on ? "on" : "off"}`);
      } else if (a.kind === "set_brightness") {
        // The streamer configures a percentage; the bridge takes 1..254. See lib/hue-rules.ts.
        await huePut(id, { on: true, bri: briFromPercent(a.percent) });
        setLastAction(`hue: ${a.percent}%`);
      } else {
        const xy = hexToXy(a.hex);
        if (!xy) return; // validation rejects black, but never trust a stored row
        await huePut(id, { on: true, xy });
        setLastAction(`hue: ${a.hex}`);
      }
    }

    async function actuate(a: ObsAction) {
      const key = revertTargetKey(a);

      if (a.kind === "switch_scene") {
        // Read the baseline BEFORE switching, but only when this effect owns it — see the header.
        if (a.revertAfterMs) {
          await scheduleRevert(key, a.revertAfterMs, async () => {
            const cur = await obs.call("GetCurrentProgramScene");
            return { kind: "scene", sceneName: (cur as { currentProgramSceneName?: string }).currentProgramSceneName ?? a.scene };
          });
        }
        await obs.call("SetCurrentProgramScene", { sceneName: a.scene });
        setLastAction(`scene → "${a.scene}"`);
      } else if (a.kind === "toggle_source") {
        const { sceneItemId } = await obs.call("GetSceneItemId", { sceneName: a.scene, sourceName: a.source });
        if (a.revertAfterMs) {
          await scheduleRevert(key, a.revertAfterMs, async () => {
            // The REAL previous visibility, not `!a.visible`: reverting a source that was already
            // hidden by flipping the target state would SHOW it — the opposite of restoring.
            let was = !a.visible;
            try {
              const cur = await obs.call("GetSceneItemEnabled", { sceneName: a.scene, sceneItemId });
              was = (cur as { sceneItemEnabled?: boolean }).sceneItemEnabled ?? was;
            } catch { /* older OBS or missing item — fall back to the flip */ }
            return { kind: "source", sceneName: a.scene, sceneItemId, enabled: was };
          });
        }
        await obs.call("SetSceneItemEnabled", { sceneName: a.scene, sceneItemId, sceneItemEnabled: a.visible });
        setLastAction(`${a.visible ? "show" : "hide"} "${a.source}"`);
      } else if (a.kind === "set_filter_intensity") {
        // The first action with a MAGNITUDE. Until this existed a filter could only be switched on or
        // off, so a drawn "intensity" had nowhere to go. The setting name and its range come from the
        // streamer because those keys belong to each filter plugin and must not be guessed.
        const value = intensityValue(a.min, a.max, a.intensity);
        if (a.revertAfterMs) {
          await scheduleRevert(key, a.revertAfterMs, async () => {
            let settings: Record<string, unknown> = {};
            try {
              const cur = await obs.call("GetSourceFilter", { sourceName: a.source, filterName: a.filter });
              settings = ((cur as { filterSettings?: Record<string, unknown> }).filterSettings ?? {});
            } catch { /* filter missing — an empty object restores plugin defaults, which is the best we can do */ }
            return { kind: "filterSettings", sourceName: a.source, filterName: a.filter, settings };
          });
        }
        await obs.call("SetSourceFilterSettings", {
          sourceName: a.source,
          filterName: a.filter,
          filterSettings: { [a.setting]: value },
          overlay: true, // merge with the filter's other settings instead of replacing them
        });
        // A filter set to a strength but left disabled would do nothing visible.
        await obs.call("SetSourceFilterEnabled", { sourceName: a.source, filterName: a.filter, filterEnabled: true }).catch(() => {});
        setLastAction(`filter "${a.filter}" ${a.setting}=${value} (siła ${a.intensity}/5)`);
      } else {
        if (a.revertAfterMs) {
          await scheduleRevert(key, a.revertAfterMs, async () => {
            let was = !a.enabled;
            try {
              const cur = await obs.call("GetSourceFilter", { sourceName: a.source, filterName: a.filter });
              was = (cur as { filterEnabled?: boolean }).filterEnabled ?? was;
            } catch { /* filter may not exist yet — fall back to the flip */ }
            return { kind: "filter", sourceName: a.source, filterName: a.filter, enabled: was };
          });
        }
        await obs.call("SetSourceFilterEnabled", { sourceName: a.source, filterName: a.filter, filterEnabled: a.enabled });
        setLastAction(`filter "${a.filter}" ${a.enabled ? "on" : "off"}`);
      }
      setActionCount((c) => c + 1);
    }

    async function poll() {
      if (stopped) return;
      try {
        const res = await fetch(`/api/alerts/queue?token=${encodeURIComponent(token!)}&since=${encodeURIComponent(since)}`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { now: string; alerts: { id: string; type: string; amount: number | null }[] };
          since = data.now;
          for (const al of data.alerts) {
            if (seen.has(al.id)) continue;
            seen.add(al.id);
            for (const action of obsActionsForAlert({ type: al.type, amount: al.amount }, rules)) {
              try {
                await actuate(action);
              } catch (e) {
                setLastAction(`błąd akcji: ${(e as Error).message}`);
              }
            }
            // Lights react to the SAME alerts, from the same loop, so an OBS effect and a light effect
            // stay ordered relative to each other and share one revert ledger.
            if (hue) {
              for (const hr of hue.rules) {
                for (const ha of hueActionsForAlert({ type: al.type, amount: al.amount }, [hr])) {
                  try {
                    await actuateHue(ha, hr.lightId ?? null);
                  } catch { /* best-effort — a lamp must never break the alert loop */ }
                }
              }
            }
          }
          if (seen.size > 500) [...seen].slice(0, seen.size - 200).forEach((id) => seen.delete(id));
        }
      } catch {
        /* transient network — keep polling */
      }
      // Penalties come on their own channel: the alert feed applies per-type display thresholds, and
      // a penalty somebody PAID for must not be swallowed by one. Same loop, so every effect — rule
      // or penalty — still runs serialised through actuate() and the revert ledger.
      try {
        const pres = await fetch(`/api/obs-control/penalties?token=${encodeURIComponent(token!)}`, { cache: "no-store" });
        if (pres.ok) {
          const pdata = (await pres.json()) as { penalties: { drawId: string; label: string; intensity: number; action: ObsAction }[] };
          for (const p of pdata.penalties) {
            try {
              await actuate(p.action);
              setLastAction(`kara: ${p.label} (siła ${p.intensity}/5)`);
            } catch (e) {
              setLastAction(`kara nieudana: ${(e as Error).message}`);
            }
          }
        }
      } catch {
        /* transient — the next tick retries, and delivery is at-most-once by design */
      }

      if (!stopped) pollTimer = setTimeout(() => void poll(), POLL_MS);
    }

    (async () => {
      try {
        const cfgRes = await fetch(`/api/obs-control/config?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (cfgRes.status === 401) {
          setStatus("bad-token");
          return;
        }
        const cfg = (await cfgRes.json()) as Config;
        rules = cfg.rules ?? [];
        hue = cfg.hue ?? null; // null when the bridge is only half-configured — see the config route
        setRulesCount(rules.length);
        if (!cfg.obsUrl) {
          setStatus("no-config");
          setDetail("Ustaw adres OBS WebSocket w /admin#integrations");
          return;
        }
        await obs.connect(cfg.obsUrl, cfg.obsPassword ?? undefined);
        if (stopped) return;
        setStatus("connected");
        setDetail(cfg.obsUrl);
        void poll();
      } catch (e) {
        if (!stopped) {
          setStatus("error");
          setDetail(`OBS: ${(e as Error).message}`);
        }
      }
    })();

    obs.on("ConnectionClosed", () => {
      if (!stopped) {
        setStatus("error");
        setDetail("Połączenie z OBS zamknięte");
      }
    });

    return () => {
      stopped = true;
      if (pollTimer) clearTimeout(pollTimer);
      // Restore everything still pending BEFORE dropping the connection: otherwise removing or
      // refreshing the browser source leaves the streamer's scene stuck mid-effect with no timer
      // left to undo it. Sequential and best-effort, then disconnect regardless.
      const outstanding = [...pendingReverts.values()];
      pendingReverts.clear();
      for (const { timer } of outstanding) clearTimeout(timer);
      void (async () => {
        for (const { revert } of outstanding) await applyRestore(revert.restore);
        await obs.disconnect().catch(() => {});
      })();
    };
  }, []);

  const color =
    status === "connected" ? "#22c55e" : status === "no-config" || status === "connecting" ? "#eab308" : "#ef4444";
  const label: Record<Status, string> = {
    connecting: "Łączenie z OBS…",
    connected: "Połączono z OBS",
    "no-config": "Brak adresu OBS WebSocket",
    "no-token": "Brak ?token= w URL źródła",
    "bad-token": "Nieprawidłowy token overlaya",
    error: "Błąd",
  };

  return (
    <div
      style={{
        fontFamily: "ui-monospace, monospace",
        fontSize: 12,
        color: "#e4e4e7",
        background: "rgba(9,9,11,0.85)",
        border: `1px solid ${color}`,
        borderRadius: 8,
        padding: "10px 12px",
        width: "fit-content",
        maxWidth: 360,
        lineHeight: 1.5,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
        Sterowanie OBS
      </div>
      <div style={{ color, marginTop: 4 }}>{label[status]}</div>
      {detail && <div style={{ color: "#a1a1aa", wordBreak: "break-all" }}>{detail}</div>}
      {status === "connected" && (
        <div style={{ color: "#a1a1aa", marginTop: 4 }}>
          {rulesCount} reguł · akcje: {actionCount}
          <br />
          ostatnia: <span style={{ color: "#e4e4e7" }}>{lastAction}</span>
        </div>
      )}
    </div>
  );
}

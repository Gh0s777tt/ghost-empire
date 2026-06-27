"use client";
// src/app/overlay/obs-control/ObsControlClient.tsx
// PHASE 3C Slice 3 — the OBS actuator. A browser source the streamer adds INSIDE OBS:
// it connects to their local OBS WebSocket (ws://localhost:4455), polls the alert feed,
// and runs their event->action rules (lib/obs-rules) — switching scenes, toggling
// sources/filters, with optional auto-revert. Pure client-side (obs-websocket-js runs in
// the browser, same machine as OBS, so it can reach localhost). Dormant until the
// streamer adds this source AND sets OBS WS creds + rules in /admin.
import { useEffect, useRef, useState } from "react";
import OBSWebSocket from "obs-websocket-js";
import { obsActionsForAlert, type ObsRule, type ObsAction } from "@/lib/obs-rules";

type Config = { obsUrl: string | null; obsPassword: string | null; rules: ObsRule[] };
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

    async function actuate(a: ObsAction) {
      if (a.kind === "switch_scene") {
        let prev: string | null = null;
        if (a.revertAfterMs) {
          const cur = await obs.call("GetCurrentProgramScene");
          prev = (cur as { currentProgramSceneName?: string }).currentProgramSceneName ?? null;
        }
        await obs.call("SetCurrentProgramScene", { sceneName: a.scene });
        setLastAction(`scene → "${a.scene}"`);
        if (a.revertAfterMs && prev) {
          const back = prev;
          setTimeout(() => void obs.call("SetCurrentProgramScene", { sceneName: back }).catch(() => {}), a.revertAfterMs);
        }
      } else if (a.kind === "toggle_source") {
        const { sceneItemId } = await obs.call("GetSceneItemId", { sceneName: a.scene, sourceName: a.source });
        await obs.call("SetSceneItemEnabled", { sceneName: a.scene, sceneItemId, sceneItemEnabled: a.visible });
        setLastAction(`${a.visible ? "show" : "hide"} "${a.source}"`);
        if (a.revertAfterMs) {
          setTimeout(() => void obs.call("SetSceneItemEnabled", { sceneName: a.scene, sceneItemId, sceneItemEnabled: !a.visible }).catch(() => {}), a.revertAfterMs);
        }
      } else {
        await obs.call("SetSourceFilterEnabled", { sourceName: a.source, filterName: a.filter, filterEnabled: a.enabled });
        setLastAction(`filter "${a.filter}" ${a.enabled ? "on" : "off"}`);
        if (a.revertAfterMs) {
          setTimeout(() => void obs.call("SetSourceFilterEnabled", { sourceName: a.source, filterName: a.filter, filterEnabled: !a.enabled }).catch(() => {}), a.revertAfterMs);
        }
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
          }
          if (seen.size > 500) [...seen].slice(0, seen.size - 200).forEach((id) => seen.delete(id));
        }
      } catch {
        /* transient network — keep polling */
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
      void obs.disconnect().catch(() => {});
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
        Ghost Empire · Sterowanie OBS
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

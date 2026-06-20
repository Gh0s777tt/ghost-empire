"use client";
// src/components/push/PushToggle.tsx
// Opt-in toggle for browser push notifications (#533). Self-hiding: renders nothing
// unless push is fully available (supported browser + an active service worker +
// VAPID configured server-side), so it's safe to mount anywhere and stays invisible
// until the feature is activated (keys + db push). The SW only registers in prod.
import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

// VAPID public keys are base64url; PushManager wants a Uint8Array.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unavailable" | "off" | "on" | "denied" | "working";

export function PushToggle() {
  const t = useTranslations("push");
  const [state, setState] = useState<State>("loading");
  const [vapid, setVapid] = useState<string | null>(null);
  const [tested, setTested] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
        if (!supported) return void (!cancelled && setState("unavailable"));
        const res = await fetch("/api/push/vapid").then((r) => r.json()).catch(() => null);
        const key: string | null = res?.key ?? null;
        if (!key) return void (!cancelled && setState("unavailable")); // dormant — no keys
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return void (!cancelled && setState("unavailable")); // SW not active (e.g. dev)
        const existing = await reg.pushManager.getSubscription();
        if (cancelled) return;
        setVapid(key);
        setState(Notification.permission === "denied" ? "denied" : existing ? "on" : "off");
      } catch {
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function enable() {
    if (!vapid) return;
    setState("working");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return setState("unavailable");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) });
      await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      setState("on");
    } catch {
      setState("off");
    }
  }

  async function sendTest() {
    try {
      await fetch("/api/push/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: t("testTitle"), body: t("testBody") }) });
      setTested(true);
      setTimeout(() => setTested(false), 2500);
    } catch {
      /* non-fatal */
    }
  }

  async function disable() {
    setState("working");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
    }
  }

  if (state === "loading" || state === "unavailable") return null;

  return (
    <div className="border border-zinc-800 bg-black/30 rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg border border-zinc-800 flex items-center justify-center shrink-0" style={{ background: "rgb(var(--brand-rgb) / 0.12)" }}>
        {state === "on" ? <BellRing className="w-4 h-4 text-emerald-400" /> : <Bell className="w-4 h-4 text-zinc-400" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white font-semibold">{t("title")}</div>
        <div className="text-[11px] text-zinc-500">{state === "denied" ? t("denied") : t("desc")}</div>
      </div>
      {state !== "denied" && (
        <div className="flex items-center gap-1.5 shrink-0">
          {state === "on" && (
            <button onClick={sendTest} className="px-2 py-1.5 rounded-lg text-[11px] text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 transition-colors">
              {tested ? t("testSent") : t("test")}
            </button>
          )}
          <button
            onClick={state === "on" ? disable : enable}
            disabled={state === "working"}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors disabled:opacity-60 ${state === "on" ? "border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500" : "border-red-700 text-red-300 hover:text-white hover:border-red-500"}`}
          >
            {state === "working" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : state === "on" ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
            {state === "on" ? t("disable") : t("enable")}
          </button>
        </div>
      )}
    </div>
  );
}

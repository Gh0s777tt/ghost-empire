"use client";
// src/components/profile/PasskeyManager.tsx
// Register + manage passkeys for your account (#543). Self-hides on browsers without
// WebAuthn. Registration only — signing IN with a passkey is a separate step (#544).
import { useState, useEffect, useCallback } from "react";
import { Fingerprint, Loader2, Trash2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { startRegistration } from "@simplewebauthn/browser";

type Passkey = { id: string; deviceName: string | null; createdAt: string; lastUsedAt: string | null };

function guessDevice(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return "iPhone/iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh|Mac OS/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Passkey";
}

export function PasskeyManager() {
  const t = useTranslations("passkey");
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setSupported(typeof window !== "undefined" && !!window.PublicKeyCredential); }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/passkey").then((res) => res.json());
      setPasskeys(r.passkeys ?? []);
    } catch { /* keep */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    setBusy(true); setErr(null);
    try {
      const options = await fetch("/api/auth/passkey/register/options", { method: "POST" }).then((r) => r.json());
      if (options.error) throw new Error(options.error);
      const att = await startRegistration({ optionsJSON: options }); // v13: wrapped in { optionsJSON }
      const deviceName = typeof navigator !== "undefined" ? guessDevice(navigator.userAgent) : undefined;
      const res = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: att, deviceName }),
      }).then((r) => r.json());
      if (!res.ok) throw new Error(res.reason || "failed");
      await load();
    } catch (e) {
      const name = (e as Error)?.name;
      if (name !== "NotAllowedError" && name !== "AbortError") setErr(t("errAdd")); // ignore user cancel
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try { await fetch(`/api/auth/passkey?id=${id}`, { method: "DELETE" }); await load(); }
    finally { setBusy(false); }
  }

  if (!supported || loading) return null;

  return (
    <div className="border border-zinc-800 bg-black/30 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg border border-zinc-800 flex items-center justify-center shrink-0" style={{ background: "rgb(var(--brand-rgb) / 0.12)" }}>
          <Fingerprint className="w-4 h-4 text-zinc-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-white font-semibold">{t("title")}</div>
          <div className="text-[11px] text-zinc-500">{t("desc")}</div>
        </div>
        <button
          onClick={() => void add()}
          disabled={busy}
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border border-red-700 text-red-300 hover:text-white hover:border-red-500 transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} {t("add")}
        </button>
      </div>

      {err && <div className="text-[11px] text-red-400 mb-2">{err}</div>}

      {passkeys.length > 0 && (
        <div className="space-y-1.5">
          {passkeys.map((p) => (
            <div key={p.id} className="flex items-center gap-2.5 border border-zinc-800/70 bg-black/20 rounded-lg px-3 py-2">
              <Fingerprint className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <span className="text-sm text-zinc-200 truncate flex-1">{p.deviceName || t("unnamed")}</span>
              <button onClick={() => void remove(p.id)} disabled={busy} title={t("remove")} className="text-zinc-500 hover:text-red-400 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

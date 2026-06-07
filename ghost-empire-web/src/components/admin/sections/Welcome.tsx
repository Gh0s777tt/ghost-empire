"use client";
// src/components/admin/sections/Welcome.tsx — lazily-loaded welcome-message manager.
import { useState, useEffect, useCallback } from "react";
import { UserPlus, Loader2, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { SectionCard } from "../shared";

export function WelcomeManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.welcome");
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [template, setTemplate] = useState("");
  const [bonus, setBonus] = useState("0");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/welcome");
      const data = await res.json();
      if (res.ok && data.config) {
        setEnabled(!!data.config.enabled);
        setTemplate(data.config.template ?? "");
        setBonus(String(data.config.bonusTokens ?? 0));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(next: { enabled?: boolean; template?: string; bonusTokens?: number }) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (res.ok) {
        onToast("ok", t("saved"));
        onSuccess();
        return true;
      }
      onToast("err", data.error ?? t("err"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    if (!(await save({ enabled: next }))) setEnabled(!next); // revert on failure
  }

  async function saveSettings() {
    if (!template.trim()) {
      onToast("err", t("templateEmpty"));
      return;
    }
    await save({ template, bonusTokens: Math.max(0, parseInt(bonus, 10) || 0) });
  }

  return (
    <SectionCard title={t("title")} icon={UserPlus}>
      <p className="text-zinc-500 text-xs mb-3">
        {t.rich("intro", {
          b: (c) => <strong>{c}</strong>,
          code: (c) => <code className="text-zinc-300">{c}</code>,
          user: "{user}",
        })}
      </p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between border border-zinc-800 bg-black/30 px-3 py-2.5">
            <span className="text-sm text-zinc-300">
              {t("statusPrefix")} <strong className={enabled ? "text-green-400" : "text-zinc-500"}>{enabled ? t("on") : t("off")}</strong>
            </span>
            <button
              onClick={toggle}
              disabled={busy || pending}
              className={cn(
                "px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest border disabled:opacity-50",
                enabled
                  ? "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  : "border-green-800 bg-green-950/30 text-green-300 hover:border-green-600",
              )}
            >
              {enabled ? t("disable") : t("enable")}
            </button>
          </div>

          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("templateLabel")}</div>
            <textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder={t("templatePh", { user: "{user}" })}
              className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden resize-none"
            />
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("bonusLabel")}</span>
              <input
                type="number"
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
                min={0}
                title={t("bonusTitle")}
                className="w-24 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
              />
              <span className="text-[10px] text-zinc-600">{t("bonusHint")}</span>
            </div>
            <div className="mt-3">
              <button
                onClick={saveSettings}
                disabled={busy || pending}
                className="bg-red-900/40 border border-red-800 hover:border-red-600 text-red-200 px-3 py-1.5 text-xs font-mono uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                {t("saveBtn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

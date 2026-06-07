"use client";
// src/components/admin/sections/Moderation.tsx — lazily-loaded chat automod config.
// Pure detectors live in lib/moderation.ts; the bot fetches /api/bot/moderation.
import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, Loader2, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { ModViolationStats } from "./ModViolationStats";

type ModConfig = {
  id: string;
  enabled: boolean;
  profanityEnabled: boolean; profanityWords: string[]; profanityRegex: string[]; profanityAction: string; profanityTimeoutSecs: number;
  linkEnabled: boolean; linkWhitelist: string[]; linkAllowSubs: boolean; linkAction: string; linkTimeoutSecs: number;
  capsEnabled: boolean; capsMinLetters: number; capsMaxRatioPct: number; capsAction: string; capsTimeoutSecs: number;
  lengthEnabled: boolean; lengthMax: number; lengthAction: string; lengthTimeoutSecs: number;
  repeatEnabled: boolean; repeatCharRun: number; repeatWordRun: number; repeatAction: string; repeatTimeoutSecs: number;
  zalgoEnabled: boolean; zalgoMaxRatioPct: number; zalgoAction: string; zalgoTimeoutSecs: number;
  exemptSubs: boolean; exemptVips: boolean; exemptMods: boolean;
};

function NumField({ label, value, onChange, min, max, suffix }: {
  label: string; value: number; onChange: (n: number) => void; min: number; max: number; suffix?: string;
}) {
  return (
    <label className="text-[11px] text-zinc-400 block">
      {label}
      <div className="flex items-center gap-1 mt-0.5">
        <input
          type="number" min={min} max={max} value={value}
          onChange={(e) => onChange(Math.min(max, Math.max(min, parseInt(e.target.value, 10) || min)))}
          className="w-20 bg-black border border-zinc-800 px-2 py-1 text-xs text-white font-mono outline-hidden focus:border-blue-600"
        />
        {suffix && <span className="text-[10px] text-zinc-600">{suffix}</span>}
      </div>
    </label>
  );
}

function RuleBlock({ title, desc, enabled, onToggle, action, onAction, timeoutSecs, onTimeout, children }: {
  title: string; desc: string;
  enabled: boolean; onToggle: (b: boolean) => void;
  action: string; onAction: (a: string) => void;
  timeoutSecs: number; onTimeout: (n: number) => void;
  children?: React.ReactNode;
}) {
  const t = useTranslations("admin.moderation");
  const ACTIONS: Array<[string, string]> = [["delete", t("actionDelete")], ["timeout", t("actionTimeout")], ["warn", t("actionWarn")]];
  return (
    <div className={"border p-3 " + (enabled ? "border-blue-900/60 bg-blue-950/10" : "border-zinc-800 bg-black/20")}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="accent-blue-500" />
          <span className="text-sm font-bold text-white">{title}</span>
        </label>
        <div className="flex items-center gap-2 shrink-0">
          <select value={action} onChange={(e) => onAction(e.target.value)} className="bg-black border border-zinc-800 px-2 py-1 text-[11px] text-white outline-hidden focus:border-blue-600">
            {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {action === "timeout" && (
            <input
              type="number" min={1} max={1209600} value={timeoutSecs}
              onChange={(e) => onTimeout(Math.max(1, parseInt(e.target.value, 10) || 1))}
              title={t("timeoutTitle")}
              className="w-20 bg-black border border-zinc-800 px-2 py-1 text-[11px] text-white font-mono outline-hidden focus:border-blue-600"
            />
          )}
        </div>
      </div>
      <p className="text-[11px] text-zinc-500 mb-2 leading-snug">{desc}</p>
      {enabled && children && <div className="flex flex-wrap gap-3">{children}</div>}
    </div>
  );
}

export function ModerationManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.moderation");
  const [cfg, setCfg] = useState<ModConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wordsText, setWordsText] = useState("");
  const [regexText, setRegexText] = useState("");
  const [linkWlText, setLinkWlText] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/moderation");
      if (r.ok) {
        const d = await r.json();
        setCfg(d.config);
        setWordsText((d.config.profanityWords ?? []).join("\n"));
        setRegexText((d.config.profanityRegex ?? []).join("\n"));
        setLinkWlText((d.config.linkWhitelist ?? []).join("\n"));
      }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function patch(p: Partial<ModConfig>) { setCfg((c) => (c ? { ...c, ...p } : c)); }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      const words = wordsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const profanityRegex = regexText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const linkWhitelist = linkWlText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/admin/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cfg, profanityWords: words, profanityRegex, linkWhitelist }),
      });
      const d = await res.json();
      if (!res.ok) { onToast("err", d.error ?? t("err")); return; }
      setCfg(d.config);
      setWordsText((d.config.profanityWords ?? []).join("\n"));
      setRegexText((d.config.profanityRegex ?? []).join("\n"));
      setLinkWlText((d.config.linkWhitelist ?? []).join("\n"));
      onToast("ok", t("saved"));
      onSuccess();
    } finally { setSaving(false); }
  }

  if (loading || !cfg) {
    return (
      <SectionCard title={t("title")} icon={ShieldCheck}>
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t("title")} icon={ShieldCheck}>
      <p className="text-zinc-500 text-xs mb-3">
        {t.rich("intro", { b: (c) => <strong className="text-zinc-300">{c}</strong> })}
      </p>

      <ModViolationStats />

      {/* Master switch */}
      <label className="flex items-center gap-2 border border-zinc-800 bg-black/30 p-2.5 mb-3 cursor-pointer">
        <input type="checkbox" checked={cfg.enabled} onChange={(e) => patch({ enabled: e.target.checked })} className="accent-green-500 w-4 h-4" />
        <span className="text-xs font-bold tracking-widest uppercase text-zinc-200">{t("masterSwitch")}</span>
      </label>

      <div className="space-y-2">
        <RuleBlock
          title={t("profanityTitle")} desc={t("profanityDesc")}
          enabled={cfg.profanityEnabled} onToggle={(b) => patch({ profanityEnabled: b })}
          action={cfg.profanityAction} onAction={(a) => patch({ profanityAction: a })}
          timeoutSecs={cfg.profanityTimeoutSecs} onTimeout={(n) => patch({ profanityTimeoutSecs: n })}
        >
          <label className="text-[11px] text-zinc-400 block w-full">
            {t("wordsLabel")}
            <textarea
              value={wordsText} onChange={(e) => setWordsText(e.target.value)} rows={4}
              placeholder={t("wordsPh")}
              className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-blue-600"
            />
          </label>
          <label className="text-[11px] text-zinc-400 block w-full mt-2">
            {t.rich("regexLabel", { code: (c) => <code className="text-zinc-500">{c}</code> })}
            <textarea
              value={regexText} onChange={(e) => setRegexText(e.target.value)} rows={2}
              placeholder={t("regexPh")}
              className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-blue-600"
            />
          </label>
        </RuleBlock>

        <RuleBlock
          title={t("linkTitle")} desc={t("linkDesc")}
          enabled={cfg.linkEnabled} onToggle={(b) => patch({ linkEnabled: b })}
          action={cfg.linkAction} onAction={(a) => patch({ linkAction: a })}
          timeoutSecs={cfg.linkTimeoutSecs} onTimeout={(n) => patch({ linkTimeoutSecs: n })}
        >
          <label className="text-[11px] text-zinc-400 block w-full">
            {t.rich("whitelistLabel", { code: (c) => <code className="text-zinc-500">{c}</code> })}
            <textarea
              value={linkWlText} onChange={(e) => setLinkWlText(e.target.value)} rows={3}
              placeholder={t("whitelistPh")}
              className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-blue-600"
            />
          </label>
          <label className="flex items-center gap-2 text-[11px] text-zinc-300 mt-1.5 cursor-pointer">
            <input type="checkbox" checked={cfg.linkAllowSubs} onChange={(e) => patch({ linkAllowSubs: e.target.checked })} className="accent-blue-500" />
            {t("linkAllowSubs")}
          </label>
        </RuleBlock>

        <RuleBlock
          title={t("capsTitle")} desc={t("capsDesc")}
          enabled={cfg.capsEnabled} onToggle={(b) => patch({ capsEnabled: b })}
          action={cfg.capsAction} onAction={(a) => patch({ capsAction: a })}
          timeoutSecs={cfg.capsTimeoutSecs} onTimeout={(n) => patch({ capsTimeoutSecs: n })}
        >
          <NumField label={t("capsMinLetters")} value={cfg.capsMinLetters} onChange={(n) => patch({ capsMinLetters: n })} min={1} max={200} />
          <NumField label={t("capsMaxRatio")} value={cfg.capsMaxRatioPct} onChange={(n) => patch({ capsMaxRatioPct: n })} min={1} max={100} suffix="%" />
        </RuleBlock>

        <RuleBlock
          title={t("lengthTitle")} desc={t("lengthDesc")}
          enabled={cfg.lengthEnabled} onToggle={(b) => patch({ lengthEnabled: b })}
          action={cfg.lengthAction} onAction={(a) => patch({ lengthAction: a })}
          timeoutSecs={cfg.lengthTimeoutSecs} onTimeout={(n) => patch({ lengthTimeoutSecs: n })}
        >
          <NumField label={t("lengthMax")} value={cfg.lengthMax} onChange={(n) => patch({ lengthMax: n })} min={1} max={5000} />
        </RuleBlock>

        <RuleBlock
          title={t("repeatTitle")} desc={t("repeatDesc")}
          enabled={cfg.repeatEnabled} onToggle={(b) => patch({ repeatEnabled: b })}
          action={cfg.repeatAction} onAction={(a) => patch({ repeatAction: a })}
          timeoutSecs={cfg.repeatTimeoutSecs} onTimeout={(n) => patch({ repeatTimeoutSecs: n })}
        >
          <NumField label={t("repeatCharRun")} value={cfg.repeatCharRun} onChange={(n) => patch({ repeatCharRun: n })} min={2} max={200} />
          <NumField label={t("repeatWordRun")} value={cfg.repeatWordRun} onChange={(n) => patch({ repeatWordRun: n })} min={2} max={100} />
        </RuleBlock>

        <RuleBlock
          title={t("zalgoTitle")} desc={t("zalgoDesc")}
          enabled={cfg.zalgoEnabled} onToggle={(b) => patch({ zalgoEnabled: b })}
          action={cfg.zalgoAction} onAction={(a) => patch({ zalgoAction: a })}
          timeoutSecs={cfg.zalgoTimeoutSecs} onTimeout={(n) => patch({ zalgoTimeoutSecs: n })}
        >
          <NumField label={t("zalgoMaxRatio")} value={cfg.zalgoMaxRatioPct} onChange={(n) => patch({ zalgoMaxRatioPct: n })} min={1} max={100} suffix="%" />
        </RuleBlock>
      </div>

      {/* Exemptions */}
      <div className="border border-zinc-800 bg-black/20 p-3 mt-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">{t("exemptHeader")}</div>
        <div className="flex flex-wrap gap-4">
          {([["exemptSubs", t("exemptSubs")], ["exemptVips", t("exemptVips")], ["exemptMods", t("exemptMods")]] as const).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300">
              <input type="checkbox" checked={cfg[k]} onChange={(e) => patch({ [k]: e.target.checked })} className="accent-blue-500" />
              {label}
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving || pending}
        className="mt-3 w-full px-4 py-2.5 bg-green-700 hover:bg-green-600 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        {t("saveBtn")}
      </button>
    </SectionCard>
  );
}

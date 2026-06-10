"use client";
// src/components/admin/sections/BotConfig.tsx — lazily-loaded Discord bot reward config.
import { useState } from "react";
import { Bot, Loader2, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard, FieldInput } from "../shared";
import type { BotConfigData } from "../types";

export function BotConfigCard({
  config, onToast, onSuccess, pending,
}: {
  config: BotConfigData;
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.botConfig");
  const [messageReward, setMessageReward] = useState(config.messageReward.toString());
  const [messageCooldownSeconds, setMessageCooldownSeconds] = useState(config.messageCooldownSeconds.toString());
  const [voiceRewardPerMinute, setVoiceRewardPerMinute] = useState(config.voiceRewardPerMinute.toString());
  const [voiceTickSeconds, setVoiceTickSeconds] = useState(config.voiceTickSeconds.toString());
  const [afkGivesReward, setAfkGivesReward] = useState(config.afkGivesReward);
  const [mutedGivesReward, setMutedGivesReward] = useState(config.mutedGivesReward);
  const [enabled, setEnabled] = useState(config.enabled);
  const [hhEnabled, setHhEnabled] = useState(config.happyHourEnabled ?? false);
  const [hhStart, setHhStart] = useState(String(config.happyHourStart ?? 19));
  const [hhEnd, setHhEnd] = useState(String(config.happyHourEnd ?? 22));
  const [hhMult, setHhMult] = useState(String(config.happyHourMultiplier ?? 2));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/bot-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageReward: parseInt(messageReward),
          messageCooldownSeconds: parseInt(messageCooldownSeconds),
          voiceRewardPerMinute: parseInt(voiceRewardPerMinute),
          voiceTickSeconds: parseInt(voiceTickSeconds),
          afkGivesReward,
          mutedGivesReward,
          enabled,
          happyHourEnabled: hhEnabled,
          happyHourStart: parseInt(hhStart),
          happyHourEnd: parseInt(hhEnd),
          happyHourMultiplier: parseFloat(hhMult),
        }),
      });
      const data = await res.json();
      if (!res.ok) onToast("err", data.error ?? t("err"));
      else {
        onToast("ok", t("saved"));
        onSuccess();
      }
    } finally { setBusy(false); }
  }

  return (
    <SectionCard title={t("title")} icon={Bot}>
      <p className="text-zinc-500 text-xs mb-3">
        {t("intro")}
      </p>

      <div className="space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-green-500"
          />
          <span className="text-xs font-bold tracking-widest uppercase text-zinc-300">
            {t("enabledLabel")}
          </span>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <FieldInput label={t("messageReward")} value={messageReward} onChange={setMessageReward} type="number" />
          <FieldInput label={t("messageCooldown")} value={messageCooldownSeconds} onChange={setMessageCooldownSeconds} type="number" />
          <FieldInput label={t("voiceReward")} value={voiceRewardPerMinute} onChange={setVoiceRewardPerMinute} type="number" />
          <FieldInput label={t("voiceTick")} value={voiceTickSeconds} onChange={setVoiceTickSeconds} type="number" />
        </div>

        <div className="flex gap-4 pt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={afkGivesReward}
              onChange={(e) => setAfkGivesReward(e.target.checked)}
              className="accent-purple-500"
            />
            <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">
              {t("afkLabel")}
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={mutedGivesReward}
              onChange={(e) => setMutedGivesReward(e.target.checked)}
              className="accent-blue-500"
            />
            <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">
              {t("mutedLabel")}
            </span>
          </label>
        </div>

        {/* Happy hours: portal-side GT-earn multiplier inside a Europe/Warsaw window */}
        <div className="border border-amber-900/50 bg-amber-950/15 rounded p-3 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hhEnabled}
              onChange={(e) => setHhEnabled(e.target.checked)}
              className="accent-amber-500"
            />
            <span className="text-xs font-bold tracking-widest uppercase text-amber-300">
              🔥 {t("happyTitle")}
            </span>
          </label>
          <p className="text-[10px] text-zinc-500">{t("happyDesc")}</p>
          <div className="grid grid-cols-3 gap-2">
            <FieldInput label={t("happyStart")} value={hhStart} onChange={setHhStart} type="number" />
            <FieldInput label={t("happyEnd")} value={hhEnd} onChange={setHhEnd} type="number" />
            <FieldInput label={t("happyMult")} value={hhMult} onChange={setHhMult} type="number" />
          </div>
        </div>

        <button
          onClick={save}
          disabled={busy || pending}
          className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {t("saveBtn")}
        </button>
      </div>
    </SectionCard>
  );
}

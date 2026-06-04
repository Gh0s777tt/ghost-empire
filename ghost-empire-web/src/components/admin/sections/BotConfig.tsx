"use client";
// src/components/admin/sections/BotConfig.tsx — lazily-loaded Discord bot reward config.
import { useState } from "react";
import { Bot, Loader2, Check } from "lucide-react";
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
  const [messageReward, setMessageReward] = useState(config.messageReward.toString());
  const [messageCooldownSeconds, setMessageCooldownSeconds] = useState(config.messageCooldownSeconds.toString());
  const [voiceRewardPerMinute, setVoiceRewardPerMinute] = useState(config.voiceRewardPerMinute.toString());
  const [voiceTickSeconds, setVoiceTickSeconds] = useState(config.voiceTickSeconds.toString());
  const [afkGivesReward, setAfkGivesReward] = useState(config.afkGivesReward);
  const [mutedGivesReward, setMutedGivesReward] = useState(config.mutedGivesReward);
  const [enabled, setEnabled] = useState(config.enabled);
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
        }),
      });
      const data = await res.json();
      if (!res.ok) onToast("err", data.error ?? "Błąd");
      else {
        onToast("ok", "Bot config zaktualizowany. Bot zaaplikuje przy następnym fetch'u (~60s).");
        onSuccess();
      }
    } finally { setBusy(false); }
  }

  return (
    <SectionCard title="Bot Discord — konfiguracja nagród" icon={Bot}>
      <p className="text-zinc-500 text-xs mb-3">
        Bot pobiera te wartości z API co ~60s. Zmiany zaaplikują się automatycznie bez restartu bota.
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
            Bot ENABLED — gdy wyłączone, bot nie nalicza tokenów
          </span>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <FieldInput label="Tokenów za wiadomość" value={messageReward} onChange={setMessageReward} type="number" />
          <FieldInput label="Cooldown wiadomości (s)" value={messageCooldownSeconds} onChange={setMessageCooldownSeconds} type="number" />
          <FieldInput label="Tokeny / min voice" value={voiceRewardPerMinute} onChange={setVoiceRewardPerMinute} type="number" />
          <FieldInput label="Voice tick (s)" value={voiceTickSeconds} onChange={setVoiceTickSeconds} type="number" />
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
              AFK channel daje tokeny
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
              Muteowani dostają tokeny (słuchanie = aktywność)
            </span>
          </label>
        </div>

        <button
          onClick={save}
          disabled={busy || pending}
          className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Zapisz config bota
        </button>
      </div>
    </SectionCard>
  );
}

"use client";
// src/components/CommandHelp.tsx
// Reusable "Commands" popover (#703): a small button that opens a window listing the chat/bot
// commands for a given feature + what each does, so anyone can see how to use it from chat.
// Fed by FEATURE_COMMANDS (literal triggers) + the `commandHelp` i18n namespace (descriptions).
// Neutral styling so it reads well on both the Midnight-Neon app and the Cinematic-Mono admin.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Terminal, X } from "lucide-react";
import { FEATURE_COMMANDS } from "@/lib/command-reference";
import { useFocusTrap } from "@/lib/use-focus-trap";

export function CommandHelp({ feature }: { feature: string }) {
  const t = useTranslations("commandHelp");
  const [open, setOpen] = useState(false);
  const ref = useFocusTrap<HTMLDivElement>(open, { onEscape: () => setOpen(false) });
  const cmds = FEATURE_COMMANDS[feature] ?? [];
  if (cmds.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 px-2 py-1 transition-colors"
      >
        <Terminal className="w-3 h-3" /> {t("button")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={t("title")}
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-950 border border-zinc-700 max-w-md w-full p-5 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg text-white tracking-wider flex items-center gap-2">
                <Terminal className="w-4 h-4 text-red-500" /> {t("title")}
              </h3>
              <button onClick={() => setOpen(false)} aria-label={t("close")} className="text-zinc-500 hover:text-red-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              {cmds.map((c) => (
                <div key={c.cmd} className="border border-zinc-800 bg-black/40 p-2.5">
                  <code className="text-sm font-mono text-red-300 break-words">{c.cmd}</code>
                  <p className="text-xs text-zinc-400 mt-1">{t(c.descKey)}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] font-mono text-zinc-600 mt-3 leading-snug">{t("note")}</p>
          </div>
        </div>
      )}
    </>
  );
}

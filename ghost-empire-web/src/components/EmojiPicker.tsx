"use client";
// src/components/EmojiPicker.tsx
// Lightweight, dependency-free emoji picker button. Click → popover with a curated set
// of stream-friendly emojis + a quick filter. Calls onPick(emoji); the parent decides
// where to insert (usually appends to a text field). No external emoji dataset.
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Smile, Search } from "lucide-react";

const GROUPS: Array<{ label: string; emojis: string[] }> = [
  { label: "Twarze", emojis: ["😀","😁","😂","🤣","😎","😍","🥰","😘","😜","🤪","😏","😬","😱","😭","😡","🤬","🥳","🤔","😴","🤯","🥶","🤡","💀","👻","🤖","😈","🙈"] },
  { label: "Gesty", emojis: ["👍","👎","👌","🤙","✌️","🤞","🤟","🙏","👏","🙌","💪","🫡","🤝","👋","🫶","🤌","☝️","👀"] },
  { label: "Serca", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","💖","💯","🔥","✨","⭐","🌟","💥","⚡"] },
  { label: "Gaming", emojis: ["🎮","🕹️","🎯","🏆","🥇","👑","💎","🗡️","🛡️","💣","🎲","🃏","🚀","👾","🎰","🧠"] },
  { label: "Stream", emojis: ["📺","🎥","🎬","🎙️","🔴","🟣","🟢","🔔","📢","💸","💰","🎁","🎉","🎊","🍿","☕","🍕","👽"] },
];

const ALL = GROUPS.flatMap((g) => g.emojis);

export function EmojiPicker({ onPick, title }: { onPick: (emoji: string) => void; title?: string }) {
  const t = useTranslations("admin.emojiPicker");
  const label = title ?? t("insert");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = q.trim() ? ALL.filter((e) => e.includes(q.trim())) : null;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="px-2 py-1.5 border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-all"
      >
        <Smile className="w-4 h-4" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t("dialogLabel")}
          className="absolute end-0 z-50 mt-1 w-64 max-h-72 overflow-y-auto border border-zinc-700 bg-zinc-950 shadow-2xl p-2"
        >
          <div className="flex items-center gap-1.5 mb-2 border border-zinc-800 px-2 py-1">
            <Search className="w-3 h-3 text-zinc-500 shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full bg-transparent text-xs text-white outline-hidden"
            />
          </div>
          {filtered ? (
            <div className="grid grid-cols-8 gap-0.5">
              {filtered.length === 0 ? (
                <span className="col-span-8 text-[11px] text-zinc-600 py-2 text-center">{t("empty")}</span>
              ) : filtered.map((e, i) => <EmojiBtn key={i} e={e} onPick={onPick} />)}
            </div>
          ) : (
            GROUPS.map((g) => (
              <div key={g.label} className="mb-2">
                <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 mb-1">{g.label}</div>
                <div className="grid grid-cols-8 gap-0.5">
                  {g.emojis.map((e, i) => <EmojiBtn key={i} e={e} onPick={onPick} />)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function EmojiBtn({ e, onPick }: { e: string; onPick: (emoji: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(e)}
      className="text-lg leading-none p-1 hover:bg-zinc-800 rounded-sm"
      title={e}
    >
      {e}
    </button>
  );
}

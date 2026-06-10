"use client";
// src/components/admin/AdminAssistant.tsx
// Floating AI helper for the admin panel: the user describes a goal, the
// assistant answers with numbered steps and /admin#section links rendered as
// buttons that jump straight to the section. History survives a refresh via
// sessionStorage; the AI provider/key comes from the Integrations section.
import { useEffect, useRef, useState } from "react";
import { Sparkles, X, SendHorizonal, Loader2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };
const STORE = "ge-admin-assistant";
const MAX_WINDOW = 12; // keep in sync with the API route

export function AdminAssistant({
  sections, onJump,
}: {
  sections: Array<{ id: string; label: string }>;
  onJump: (id: string) => void;
}) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Restore / persist the conversation for this tab.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE);
      if (raw) setMsgs(JSON.parse(raw) as Msg[]);
    } catch { /* corrupted storage — start fresh */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-30))); } catch { /* full */ }
  }, [msgs]);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [open, msgs, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setNotConfigured(false);
    const next: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-MAX_WINDOW), locale }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (res.status === 503 && data.error === "ai-not-configured") {
        setNotConfigured(true);
      } else if (!res.ok || !data.reply) {
        setMsgs((m) => [...m, { role: "assistant", content: `⚠️ ${data.error ?? t("aiError")}` }]);
      } else {
        setMsgs((m) => [...m, { role: "assistant", content: data.reply! }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: `⚠️ ${t("aiError")}` }]);
    } finally {
      setBusy(false);
    }
  }

  // /admin#<id> in assistant text → button jumping to the section.
  function renderContent(text: string) {
    const parts = text.split(/(\/admin#[a-z]+)/g);
    return parts.map((part, i) => {
      const m = /^\/admin#([a-z]+)$/.exec(part);
      if (!m) return <span key={i}>{part}</span>;
      const id = m[1];
      const label = sections.find((s) => s.id === id)?.label;
      // hallucinated / not-permitted section → leave it as plain text
      if (!label) return <span key={i}>{part}</span>;
      return (
        <button
          key={i}
          type="button"
          onClick={() => onJump(id)}
          className="inline-flex items-center gap-0.5 px-1 mx-0.5 border border-red-800 bg-red-950/40 text-red-300 hover:text-white hover:border-red-600 text-[10px] font-mono uppercase tracking-wider align-middle transition-colors"
        >
          ▸ {label}
        </button>
      );
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("aiTitle")}
        className="fixed bottom-6 left-6 z-40 flex items-center gap-2 border border-red-800 bg-zinc-950/90 backdrop-blur-xs px-3 py-2.5 text-[11px] font-mono uppercase tracking-widest text-red-300 hover:text-white hover:border-red-600 shadow-2xl transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        {t("aiOpenLabel")}
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-6 left-6 z-40 w-[min(380px,calc(100vw-3rem))] flex flex-col border border-zinc-700 bg-zinc-950/95 backdrop-blur-sm shadow-2xl"
      style={{ clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))" }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800">
        <Sparkles className="w-4 h-4 text-red-400" />
        <span className="font-display text-sm text-white tracking-wider">{t("aiTitle").toUpperCase()}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto text-zinc-500 hover:text-white transition-colors"
          aria-label={t("aiClose")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto max-h-[50vh] min-h-40 p-3 space-y-3 text-xs leading-relaxed">
        {msgs.length === 0 && (
          <div className="border-l-2 border-red-800 pl-2 text-zinc-400">{t("aiGreeting")}</div>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={cn(
              "whitespace-pre-wrap",
              m.role === "user"
                ? "border-l-2 border-zinc-600 pl-2 text-zinc-300"
                : "border-l-2 border-red-800 pl-2 text-zinc-200",
            )}
          >
            {m.role === "assistant" ? renderContent(m.content) : m.content}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("aiThinking")}
          </div>
        )}
        {notConfigured && (
          <div className="border border-orange-800 bg-orange-950/30 p-2 text-orange-200">
            {t("aiNotConfigured")}{" "}
            <button
              type="button"
              onClick={() => onJump("integrations")}
              className="underline text-orange-300 hover:text-white"
            >
              {t("aiGoConfigure")}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-zinc-800 p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
          placeholder={t("aiPlaceholder")}
          rows={2}
          className="flex-1 bg-black/30 border border-zinc-800 focus:border-red-700 px-2 py-1.5 text-xs text-white outline-hidden resize-none placeholder:text-zinc-600"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !input.trim()}
          className="p-2 border border-zinc-700 text-zinc-300 hover:text-white hover:border-red-600 disabled:opacity-40 transition-colors"
          aria-label={t("aiSend")}
        >
          <SendHorizonal className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

"use client";
// src/components/HelpAssistant.tsx
// The portal-wide help assistant: a floating "?" button on every page (mounted in
// the locale layout). Opening it shows ALWAYS-ON static help — quick links to the
// main pages + a short FAQ — and, for logged-in viewers, an AI chat box. The AI is
// a bonus: when the streamer has no AI plan/key the composer shows a gentle
// "unavailable" note and the static help carries the experience. Hidden on /admin
// (the panel has its own assistant) and never rendered on OBS overlays (those live
// outside the [locale] layout entirely).
import { useEffect, useRef, useState } from "react";
import { HelpCircle, X, SendHorizonal, Loader2, Sparkles } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useSession, signIn } from "next-auth/react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { apiPost, ApiError } from "@/lib/api-client";
import { HELP_PAGES } from "@/lib/help-assistant";

type Msg = { role: "user" | "assistant"; content: string };
const MAX_WINDOW = 10; // keep in sync with the API route's MAX_MESSAGES

// Quick links: internal path → nav.* label key. Reuses the existing nav labels so
// nothing drifts. Only points at pages every viewer can reach.
const QUICK_LINKS: ReadonlyArray<{ href: string; navKey: string }> = [
  { href: "/shop", navKey: "shop" },
  { href: "/kasyno", navKey: "casino" },
  { href: "/wheel", navKey: "wheel" },
  { href: "/clans", navKey: "clans" },
  { href: "/clips", navKey: "clips" },
  { href: "/sounds", navKey: "sounds" },
  { href: "/ranking", navKey: "ranking" },
  { href: "/achievements", navKey: "achievements" },
  { href: "/profile", navKey: "profile" },
];

const FAQ_KEYS = ["earn", "link", "clans", "casino", "portal"] as const;
const KNOWN_PATHS = new Set(HELP_PAGES.map((p) => p.path));

export function HelpAssistant() {
  const t = useTranslations("assistant");
  const nav = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [open, msgs, busy]);

  // The admin panel has its own assistant — don't double up there.
  if (pathname.startsWith("/admin")) return null;

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const next: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setBusy(true);
    try {
      const data = await apiPost<{ reply?: string }>("/api/assistant", {
        messages: next.slice(-MAX_WINDOW),
        locale,
      });
      setMsgs((m) => [...m, { role: "assistant", content: data.reply ?? `⚠️ ${t("error")}` }]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setAiUnavailable(true);
      } else if (err instanceof ApiError && err.status === 401) {
        setAiUnavailable(true);
      } else if (err instanceof ApiError && err.status === 429) {
        setMsgs((m) => [...m, { role: "assistant", content: `⚠️ ${t("rateLimited")}` }]);
      } else {
        setMsgs((m) => [...m, { role: "assistant", content: `⚠️ ${t("error")}` }]);
      }
    } finally {
      setBusy(false);
    }
  }

  // Linkify bare paths ("/shop") the AI mentions → clickable internal links.
  function renderReply(text: string) {
    const parts = text.split(/(\/[a-z-]+)/g);
    return parts.map((part, i) => {
      if (KNOWN_PATHS.has(part)) {
        return (
          <Link
            key={i}
            href={part}
            onClick={() => setOpen(false)}
            className="text-red-300 underline underline-offset-2 hover:text-white"
          >
            {part}
          </Link>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("open")}
        aria-label={t("open")}
        className="fixed bottom-5 end-5 z-40 flex items-center gap-2 border border-red-800 bg-zinc-950/90 backdrop-blur-xs px-3 py-2.5 text-[11px] font-mono uppercase tracking-widest text-red-300 hover:text-white hover:border-red-600 shadow-2xl transition-colors"
      >
        <HelpCircle className="w-4 h-4" />
        <span className="hidden sm:inline">{t("open")}</span>
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-5 end-5 z-40 w-[min(380px,calc(100vw-2.5rem))] flex flex-col border border-zinc-700 bg-zinc-950/95 backdrop-blur-sm shadow-2xl"
      style={{ clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))" }}
      role="dialog"
      aria-label={t("title")}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800">
        <HelpCircle className="w-4 h-4 text-red-400" />
        <span className="font-display text-sm text-white tracking-wider">{t("title").toUpperCase()}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto text-zinc-500 hover:text-white transition-colors"
          aria-label={t("close")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto max-h-[60vh] min-h-40 p-3 space-y-4 text-xs leading-relaxed">
        <p className="text-zinc-400">{t("intro")}</p>

        {/* Quick links — always available, the backbone of the help. */}
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">{t("quickLinks")}</div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="px-2 py-1 border border-zinc-800 bg-black/30 text-zinc-300 hover:text-white hover:border-red-700 transition-colors"
              >
                {nav(l.navKey)}
              </Link>
            ))}
          </div>
        </div>

        {/* FAQ — native <details> for zero-JS accessibility. */}
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">{t("faqTitle")}</div>
          <div className="space-y-1">
            {FAQ_KEYS.map((k) => (
              <details key={k} className="border border-zinc-800 bg-black/20 open:border-zinc-700">
                <summary className="cursor-pointer select-none px-2 py-1.5 text-zinc-200 hover:text-white marker:text-red-500">
                  {t(`faq.${k}.q`)}
                </summary>
                <p className="px-2 pb-2 pt-0.5 text-zinc-400">{t(`faq.${k}.a`)}</p>
              </details>
            ))}
          </div>
        </div>

        {/* AI conversation (logged-in only). */}
        {msgs.length > 0 && (
          <div className="space-y-3 border-t border-zinc-800 pt-3">
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
                {m.role === "assistant" ? renderReply(m.content) : m.content}
              </div>
            ))}
          </div>
        )}
        {busy && (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("thinking")}
          </div>
        )}
        {aiUnavailable && (
          <div className="border border-zinc-700 bg-zinc-900/50 p-2 text-zinc-400">{t("aiUnavailable")}</div>
        )}
      </div>

      {/* Composer (logged-in) or a sign-in nudge (guests). Static help stays usable either way. */}
      {status === "authenticated" ? (
        <div className="flex items-end gap-2 border-t border-zinc-800 p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
            }}
            placeholder={t("placeholder")}
            rows={2}
            className="flex-1 bg-black/30 border border-zinc-800 focus:border-red-700 px-2 py-1.5 text-xs text-white outline-hidden resize-none placeholder:text-zinc-600"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            className="p-2 border border-zinc-700 text-zinc-300 hover:text-white hover:border-red-600 disabled:opacity-40 transition-colors"
            aria-label={t("send")}
          >
            <SendHorizonal className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void signIn()}
          className="flex items-center justify-center gap-2 border-t border-zinc-800 p-2.5 text-xs text-zinc-400 hover:text-white transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5 text-red-400" /> {t("loginToAsk")}
        </button>
      )}
    </div>
  );
}

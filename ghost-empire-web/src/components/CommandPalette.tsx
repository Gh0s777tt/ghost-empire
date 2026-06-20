"use client";
// src/components/CommandPalette.tsx
// Global quick-nav palette (#548). Cmd/Ctrl+K opens a fuzzy search over the portal's
// pages; ↑↓ to move, ⏎ to jump, esc to close. Mounted in the locale layout. Pure
// matching lives in lib/command-palette; labels reuse the `nav` namespace so the
// palette is localized for free. No schema, no network.
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Search, CornerDownLeft } from "lucide-react";
import { COMMANDS, filterCommands } from "@/lib/command-palette";

export function CommandPalette() {
  const tn = useTranslations("nav");
  const t = useTranslations("commandPalette");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve each command's label once per locale + build its searchable string.
  const all = useMemo(
    () =>
      COMMANDS.map((c) => {
        let label = c.id;
        try { label = tn(c.labelKey); } catch { /* missing key → fall back to id */ }
        return { ...c, label, search: `${label} ${c.keywords}` };
      }),
    [tn],
  );
  const results = useMemo(() => filterCommands(all, query), [all, query]);

  // Cmd/Ctrl+K toggles; Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSel(0);
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
  }, [open]);
  useEffect(() => { setSel(0); }, [query]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const r = results[sel]; if (r) go(r.href); }
  }

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] px-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("placeholder")}
      onClick={() => setOpen(false)}
    >
      <div className="w-full max-w-lg border border-zinc-800 bg-zinc-950 rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 border-b border-zinc-800">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={t("placeholder")}
            className="flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-zinc-600"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-zinc-600">{t("empty")}</div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.id}
                onMouseEnter={() => setSel(i)}
                onClick={() => go(r.href)}
                className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${i === sel ? "bg-red-950/40 text-white" : "text-zinc-300 hover:bg-zinc-900"}`}
              >
                <span className="flex-1 truncate">{r.label}</span>
                <span className="text-[10px] font-mono text-zinc-600">{r.href}</span>
                {i === sel && <CornerDownLeft className="w-3 h-3 text-zinc-500 shrink-0" />}
              </button>
            ))
          )}
        </div>
        <div className="px-3 py-1.5 border-t border-zinc-800 text-[10px] text-zinc-600 flex items-center gap-3">
          <span>↑↓ {t("navigate")}</span>
          <span>⏎ {t("open")}</span>
          <span>esc {t("close")}</span>
        </div>
      </div>
    </div>
  );
}

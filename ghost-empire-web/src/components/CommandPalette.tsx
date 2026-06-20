"use client";
// src/components/CommandPalette.tsx
// Global quick-nav palette (#548, +user search #549). Cmd/Ctrl+K opens a fuzzy search
// over the portal's pages AND (async) viewers; ↑↓ to move across both, ⏎ to jump, esc
// to close. Mounted in the locale layout. Page matching is pure (lib/command-palette);
// user search hits /api/search/users (debounced, ≥2 chars).
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Search, CornerDownLeft, User as UserIcon } from "lucide-react";
import { COMMANDS, filterCommands } from "@/lib/command-palette";
import { displayNick } from "@/lib/utils";
import { useFocusTrap } from "@/lib/use-focus-trap";

type UserHit = { username: string; displayName: string | null; image: string | null; level: number };
type Entry = { key: string; label: string; href: string; hint?: string; image?: string | null; isUser?: boolean };

export function CommandPalette() {
  const tn = useTranslations("nav");
  const t = useTranslations("commandPalette");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [users, setUsers] = useState<UserHit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  // Focus trap: on open focuses the input, traps Tab inside the dialog, Esc closes,
  // and focus is RESTORED to the trigger element on close. Reused by GiftButton.
  const dialogRef = useFocusTrap<HTMLDivElement>(open, { onEscape: () => setOpen(false), initialFocus: inputRef });

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
  const pageHits = useMemo(() => filterCommands(all, query), [all, query]);

  // Combined, navigable list: pages first, then matching viewers.
  const entries: Entry[] = useMemo(() => {
    const pages: Entry[] = pageHits.map((c) => ({ key: `c:${c.id}`, label: c.label, href: c.href, hint: c.href }));
    const people: Entry[] = users.map((u) => ({ key: `u:${u.username}`, label: displayNick(u.displayName, u.username), href: `/u/${u.username}`, hint: `@${u.username}`, image: u.image, isUser: true }));
    return [...pages, ...people];
  }, [pageHits, users]);

  // Cmd/Ctrl+K toggles (global); Esc-to-close + focus are handled by useFocusTrap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset the query/selection/results each time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSel(0);
      setUsers([]);
    }
  }, [open]);
  useEffect(() => { setSel(0); }, [query]);

  // Debounced viewer search (≥2 chars).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setUsers([]); return; }
    let cancelled = false;
    const id = setTimeout(() => {
      fetch(`/api/search/users?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d: { users?: UserHit[] }) => { if (!cancelled) setUsers(d?.users ?? []); })
        .catch(() => { if (!cancelled) setUsers([]); });
    }, 280);
    return () => { cancelled = true; clearTimeout(id); };
  }, [query]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, entries.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const r = entries[sel]; if (r) go(r.href); }
  }

  if (!open) return null;
  const firstUserIdx = entries.findIndex((e) => e.isUser);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] px-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("placeholder")}
      onClick={() => setOpen(false)}
    >
      <div ref={dialogRef} className="w-full max-w-lg border border-zinc-800 bg-zinc-950 rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 border-b border-zinc-800">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={t("placeholder")}
            role="combobox"
            aria-expanded={entries.length > 0}
            aria-controls="cmdk-listbox"
            aria-autocomplete="list"
            aria-activedescendant={entries[sel] ? `cmdk-opt-${sel}` : undefined}
            className="flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-zinc-600"
          />
        </div>
        <div id="cmdk-listbox" role="listbox" aria-label={t("placeholder")} className="max-h-[50vh] overflow-y-auto py-1">
          {entries.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-zinc-600">{t("empty")}</div>
          ) : (
            entries.map((r, i) => (
              <div key={r.key}>
                {i === firstUserIdx && <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-widest text-zinc-600">{t("users")}</div>}
                <button
                  id={`cmdk-opt-${i}`}
                  role="option"
                  aria-selected={i === sel}
                  tabIndex={-1}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => go(r.href)}
                  className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${i === sel ? "bg-red-950/40 text-white" : "text-zinc-300 hover:bg-zinc-900"}`}
                >
                  {r.isUser &&
                    (r.image ? (
                      <img src={r.image} alt="" className="w-4 h-4 rounded-full shrink-0 object-cover" />
                    ) : (
                      <UserIcon className="w-4 h-4 text-zinc-500 shrink-0" />
                    ))}
                  <span className="flex-1 truncate">{r.label}</span>
                  <span className="text-[10px] font-mono text-zinc-600">{r.hint}</span>
                  {i === sel && <CornerDownLeft className="w-3 h-3 text-zinc-500 shrink-0" />}
                </button>
              </div>
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

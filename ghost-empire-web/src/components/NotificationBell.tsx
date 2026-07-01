"use client";
// src/components/NotificationBell.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Bell, Check, X, Trophy, Gift, Package, Sparkles, AlertCircle } from "lucide-react";
import { timeAgo, cn } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";
import { apiGet, apiPost } from "@/lib/api-client";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  icon: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

const TYPE_ICON: Record<string, typeof Bell> = {
  achievement: Trophy,
  task_reward: Sparkles,
  shop_delivered: Package,
  event_win: Gift,
  system: AlertCircle,
};

// Visibility-aware polling: a hidden tab doesn't poll at all; an open dropdown polls
// faster (the user is looking at it), a closed bell just keeps the badge fresh.
const POLL_OPEN = 30_000;
const POLL_CLOSED = 120_000;

export function NotificationBell() {
  const t = useTranslations("notifications");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiGet<{ items: Notification[]; unreadCount: number }>("/api/notifications");
      setItems(data.items);
      setUnread(data.unreadCount);
    } catch {
      // silently ignore — connectivity issues
    }
  }, []);

  // Initial + visibility-aware polling: skip entirely while the tab is hidden and
  // catch up the moment it becomes visible again.
  useEffect(() => {
    fetchNotifications();
    const tick = () => { if (document.visibilityState === "visible") void fetchNotifications(); };
    const iv = setInterval(tick, open ? POLL_OPEN : POLL_CLOSED);
    const onVisible = () => { if (document.visibilityState === "visible") void fetchNotifications(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVisible); };
  }, [fetchNotifications, open]);

  // Badging API (#775): mirror the unread count onto the installed-PWA app icon
  // (home-screen/taskbar badge). Feature-detected; a no-op everywhere unsupported.
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (unread > 0) nav.setAppBadge?.(unread).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [unread]);

  // Click outside (or Escape) to close
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  async function markAllRead() {
    setLoading(true);
    try {
      await apiPost("/api/notifications", { all: true });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch {
      // non-ok / connectivity → leave state as-is
    } finally {
      setLoading(false);
    }
  }

  async function markOneRead(id: string) {
    // Optimistic
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    setUnread((c) => Math.max(0, c - 1));

    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch {
      // Revert on error
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: false } : n)),
      );
      setUnread((c) => c + 1);
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-8 h-8 flex items-center justify-center border border-zinc-800 bg-zinc-950 hover:border-zinc-700 transition-colors"
        aria-label={unread > 0 ? t("titleUnread", { count: unread }) : t("title")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notif-panel"
      >
        <Bell className="w-3.5 h-3.5 text-zinc-400" />
        {unread > 0 && (
          <span className="absolute -top-1 -end-1 min-w-[16px] h-4 px-1 bg-red-600 text-white text-[9px] font-bold flex items-center justify-center font-mono leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notif-panel"
          role="dialog"
          aria-label={t("title")}
          className="absolute end-0 top-full mt-1 w-80 sm:w-96 max-w-[calc(100vw-2rem)] border border-zinc-800 bg-zinc-950/98 backdrop-blur-md shadow-2xl z-50"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Bell className="w-3.5 h-3.5 text-red-500" />
              <span className="font-display text-sm text-white tracking-wider">{t("heading")}</span>
              {unread > 0 && (
                <span className="text-[9px] font-mono uppercase tracking-widest text-red-400">
                  {t("newCount", { count: unread })}
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                disabled={loading}
                className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-red-400 disabled:opacity-50"
              >
                {t("markAll")}
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                <p className="text-zinc-500 text-xs">{t("empty")}</p>
              </div>
            ) : (
              items.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onClick={() => {
                    if (!n.read) markOneRead(n.id);
                    if (n.link) setOpen(false);
                  }}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification: n,
  onClick,
}: {
  notification: Notification;
  onClick: () => void;
}) {
  const TypeIcon = TYPE_ICON[n.type] ?? AlertCircle;
  const locale = useLocale();
  const inner = (
    <>
      <div className="shrink-0 pt-0.5">
        {n.icon ? (
          <span className="text-xl">{n.icon}</span>
        ) : (
          <TypeIcon className="w-5 h-5 text-zinc-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <span className="text-sm text-white font-medium leading-tight">{n.title}</span>
          {!n.read && <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0 mt-1.5" />}
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">{n.message}</p>
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mt-1">
          {timeAgo(n.createdAt, locale)}
        </div>
      </div>
    </>
  );

  // Real interactive element (keyboard-accessible) instead of a clickable <div>. #audit-v2 a11y
  const cls = cn(
    "flex gap-3 px-3 py-2.5 border-b border-zinc-900 last:border-0 cursor-pointer transition-colors w-full text-left",
    n.read ? "hover:bg-zinc-900/50" : "bg-red-950/10 hover:bg-red-950/20",
  );
  if (n.link) {
    return (
      <Link href={n.link} onClick={onClick} className={cn(cls, "block")}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

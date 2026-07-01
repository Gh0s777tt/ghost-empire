"use client";
// src/components/OnlineNowBadge.tsx
// "● N online now" chip (#767) — live portal presence with a small avatar row of
// recently-active signed-in users. Hides itself entirely when presence is dormant
// (no Redis) or nobody is online, so it can sit on the home hero risk-free.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiGet } from "@/lib/api-client";

type Snap = {
  active: boolean;
  online?: number;
  users?: { username: string | null; displayName: string | null; image: string | null }[];
};

export function OnlineNowBadge() {
  const t = useTranslations("home");
  const [snap, setSnap] = useState<Snap | null>(null);

  useEffect(() => {
    let stopped = false;
    const load = () =>
      apiGet<Snap>("/api/presence")
        .then((s) => { if (!stopped) setSnap(s); })
        .catch(() => {});
    load();
    const iv = setInterval(load, 30_000);
    return () => { stopped = true; clearInterval(iv); };
  }, []);

  if (!snap?.active || !snap.online || snap.online < 1) return null;
  const users = (snap.users ?? []).filter((u) => u.image).slice(0, 5);

  return (
    <div className="inline-flex items-center gap-2.5 px-3 py-1.5 border border-emerald-800/60 bg-emerald-950/30 text-sm text-emerald-300">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
      </span>
      <span className="font-bold tabular-nums">{t("onlineNow", { n: snap.online })}</span>
      {users.length > 0 && (
        <span className="flex -space-x-2 ms-1">
          {users.map((u, i) => (
            <img
              key={i}
              src={u.image!}
              alt={u.displayName || u.username || ""}
              title={u.displayName || u.username || ""}
              className="w-5 h-5 rounded-full border border-emerald-900 object-cover bg-zinc-900"
              loading="lazy"
              decoding="async"
            />
          ))}
        </span>
      )}
    </div>
  );
}

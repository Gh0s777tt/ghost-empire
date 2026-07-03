"use client";
// src/components/admin/sections/RoleRoster.tsx
// Role roster (#700): a read-only "who holds what role" list for the portal — owner / admin /
// moderator (with each mod's granular permissions) — so the owner can see staff at a glance.
// Data from /api/admin/role-roster (admin-gated, tenant-scoped). Set roles via UserRolesCard above.
import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Crown, ShieldCheck, UserCog, Loader2, Ban } from "lucide-react";
import { SectionCard } from "../shared";
import { apiGet } from "@/lib/api-client";
import { displayNick } from "@/lib/utils";
import { Link } from "@/i18n/navigation";

type RosterUser = {
  id: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
  isAdmin: boolean;
  isModerator: boolean;
  modPermissions: string[];
  isBanned: boolean;
  isOwner: boolean;
};

export function RoleRoster() {
  const t = useTranslations("admin");
  const [data, setData] = useState<{ users: RosterUser[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setData(await apiGet<{ users: RosterUser[] }>("/api/admin/role-roster")); }
    catch { /* keep null → empty */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const users = data?.users ?? [];
  const owners = users.filter((u) => u.isOwner).length;
  const admins = users.filter((u) => u.isAdmin && !u.isOwner).length;
  const mods = users.filter((u) => u.isModerator && !u.isAdmin).length;

  return (
    <SectionCard title={t("rosterTitle")} icon={UserCog}>
      {loading ? (
        <div className="text-zinc-600 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> …</div>
      ) : users.length === 0 ? (
        <p className="text-zinc-500 text-sm">{t("rosterEmpty")}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
            <span>👑 {t("rosterOwner")}: <span className="text-white">{owners}</span></span>
            <span>🛡️ {t("rosterAdmins")}: <span className="text-white">{admins}</span></span>
            <span>⚙️ {t("rosterMods")}: <span className="text-white">{mods}</span></span>
          </div>
          <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
            {users.map((u) => (
              <RosterRow key={u.id} u={u} t={t} />
            ))}
          </div>
        </>
      )}
      <p className="text-[10px] font-mono text-zinc-600 mt-3 leading-snug">{t("rosterNote")}</p>
    </SectionCard>
  );
}

function RosterRow({ u, t }: { u: RosterUser; t: (k: string) => string }) {
  const name = displayNick(u.displayName, u.username);
  return (
    <div className="border border-zinc-800 bg-black/30 p-2.5 flex items-center gap-3">
      {u.image ? (
        <img src={u.image} alt="" width={32} height={32} loading="lazy" referrerPolicy="no-referrer" className="w-8 h-8 object-cover border border-zinc-800 shrink-0" />
      ) : (
        <img src="/brand/eforge-mark.svg" alt="" width={32} height={32} className="w-8 h-8 object-cover border border-zinc-800 bg-black shrink-0" loading="lazy" decoding="async" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {u.username ? (
            <Link href={`/u/${u.username}`} className="text-sm text-white font-medium truncate hover:text-red-400">{name}</Link>
          ) : (
            <span className="text-sm text-white font-medium truncate">{name}</span>
          )}
          {u.isBanned && (
            <span className="text-[9px] font-bold tracking-widest uppercase border border-red-700 bg-red-950/50 text-red-300 px-1 inline-flex items-center gap-1">
              <Ban className="w-2.5 h-2.5" /> BANNED
            </span>
          )}
        </div>
        {u.username && <div className="text-[10px] font-mono text-zinc-500 truncate">@{u.username}</div>}
        {/* Moderator permissions */}
        {!u.isAdmin && u.isModerator && (
          <div className="flex flex-wrap gap-1 mt-1">
            {u.modPermissions.length === 0 ? (
              <span className="text-[9px] font-mono text-zinc-600">{t("rosterNoPerms")}</span>
            ) : (
              u.modPermissions.map((p) => (
                <span key={p} className="text-[9px] font-mono tracking-wide px-1.5 py-0.5 border border-blue-900 bg-blue-950/30 text-blue-300">{p}</span>
              ))
            )}
          </div>
        )}
      </div>
      {/* Role badge (highest first) */}
      <div className="shrink-0">
        {u.isOwner ? (
          <span className="text-[10px] font-bold tracking-widest uppercase border border-amber-500 bg-amber-600/15 text-amber-300 px-2 py-0.5 inline-flex items-center gap-1">
            <Crown className="w-3 h-3" /> {t("rosterOwner")}
          </span>
        ) : u.isAdmin ? (
          <span className="text-[10px] font-bold tracking-widest uppercase border border-red-500 bg-red-600/15 text-red-300 px-2 py-0.5 inline-flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> {t("rosterAdmin")}
          </span>
        ) : (
          <span className="text-[10px] font-bold tracking-widest uppercase border border-blue-500 bg-blue-600/15 text-blue-300 px-2 py-0.5 inline-flex items-center gap-1">
            <UserCog className="w-3 h-3" /> {t("rosterMod")}
          </span>
        )}
      </div>
    </div>
  );
}

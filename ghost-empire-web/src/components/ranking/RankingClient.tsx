"use client";
// src/components/ranking/RankingClient.tsx
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import HowItWorks from "@/components/HowItWorks";
import { Link } from "@/i18n/navigation";
import {
  Trophy, TrendingUp, Sparkles, Flame, Crown, Medal, ShieldCheck,
  X, Loader2, Check, Coins, Heart, UserCog, Ban, CalendarDays,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { rankForLevel, cn, displayNick } from "@/lib/utils";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { useTenantBranding } from "@/components/TenantBranding";
import { apiPost, apiPostStepUp, ApiError } from "@/lib/api-client";
import { useFocusTrap } from "@/lib/use-focus-trap";

type Sort = "tokens" | "totalEarned" | "weekly" | "level" | "streak";

type User = {
  id: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
  tokens: number;
  totalEarned: number;
  level: number;
  xp: number;
  prestige?: number;
  streak: number;
  weekly?: number; // GT earned in the last 7 days (only present for sort="weekly")
  isAdmin: boolean;
  isBanned?: boolean;
};

const SORT_META: Record<
  Sort,
  { icon: typeof Trophy; suffix: string; color: string }
> = {
  tokens:      { icon: Trophy,       suffix: "GT", color: "#E50914" },
  totalEarned: { icon: TrendingUp,   suffix: "GT", color: "#10b981" },
  weekly:      { icon: CalendarDays, suffix: "GT", color: "#38bdf8" },
  level:       { icon: Sparkles,     suffix: "",   color: "#a855f7" },
  streak:      { icon: Flame,        suffix: "",   color: "#FF4500" },
};

const PODIUM_STYLE = [
  { color: "#FFD700", label: "1.", border: "border-yellow-500", glow: "shadow-yellow-500/30" },
  { color: "#C0C0C0", label: "2.", border: "border-zinc-400",   glow: "shadow-zinc-400/30"   },
  { color: "#CD7F32", label: "3.", border: "border-orange-700", glow: "shadow-orange-700/30" },
];

type Permissions = {
  canGrantTokens: boolean;
  canSetRole: boolean;
  canBan: boolean;
};

export function RankingClient({
  sort,
  topUsers,
  totalRanked,
  totalUsers,
  currentUserId,
  myRank,
  isAdmin, // misleading name — actually "canDoAnyAdminAction"; kept for backwards compat
  permissions = { canGrantTokens: false, canSetRole: false, canBan: false },
}: {
  sort: Sort;
  topUsers: User[];
  totalRanked: number;
  totalUsers: number;
  currentUserId: string | null;
  myRank: { position: number; user: User } | null;
  isAdmin: boolean;
  permissions?: Permissions;
}) {
  const t = useTranslations("ranking");
  const fmt = useLocaleFmt();
  const { tokenSymbol } = useTenantBranding();
  const [adminTarget, setAdminTarget] = useState<User | null>(null);
  const meta = SORT_META[sort];
  const Icon = meta.icon;
  const sortShorts: Record<Sort, string> = {
    tokens: t("sortTokensShort"), totalEarned: t("sortEarnedShort"), weekly: t("sortWeeklyShort"),
    level: t("sortLevelShort"), streak: t("sortStreakShort"),
  };
  const sortLabels: Record<Sort, string> = {
    tokens: t("sortTokensLabel"), totalEarned: t("sortEarnedLabel"), weekly: t("sortWeeklyLabel"),
    level: t("sortLevelLabel"), streak: t("sortStreakLabel"),
  };

  const podium = topUsers.slice(0, 3);
  const rest = topUsers.slice(3);

  function formatValue(u: User): string {
    const v = sort === "weekly" ? (u.weekly ?? 0) : u[sort];
    if (sort === "level") return `LVL ${v}`;
    if (sort === "streak") return `${v} ${t("streakUnit", { count: v })}`;
    return `${fmt(v)} ${meta.suffix === "GT" ? tokenSymbol : meta.suffix}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="w-6 h-6 text-red-500" />
            <h1
              className="font-display text-4xl text-white tracking-wider"
              style={{ textShadow: "2px 0 0 rgba(229,9,20,0.6), -2px 0 0 rgba(139,0,0,0.4)" }}
            >
              {t("title")}
            </h1>
          </div>
          <p className="text-zinc-500 text-sm">
            {t("subtitle")}
          </p>
          <HowItWorks>{t("help")}</HowItWorks>
        </div>
        <div className="text-end">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            {t("rankedLabel")}
          </div>
          <div className="font-mono text-2xl text-white tabular-nums">
            {fmt(totalRanked)}{" "}
            <span className="text-zinc-600 text-sm">/ {fmt(totalUsers)}</span>
          </div>
        </div>
      </div>

      {/* Sort tabs */}
      <div className="flex flex-wrap gap-2" data-tour="ranking-sort">
        {(Object.keys(SORT_META) as Sort[]).map((k) => {
          const m = SORT_META[k];
          const TabIcon = m.icon;
          const active = sort === k;
          return (
            <Link
              key={k}
              href={`/ranking?sort=${k}`}
              scroll={false}
              prefetch
              className={cn(
                "px-3 py-2 border text-[11px] font-semibold tracking-widest uppercase flex items-center gap-2 transition-all",
                active
                  ? "border-red-500 bg-red-600/15 text-red-300"
                  : "border-zinc-800 bg-zinc-950/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700",
              )}
            >
              <TabIcon className="w-3.5 h-3.5" />
              {sortShorts[k]}
            </Link>
          );
        })}
      </div>

      {topUsers.length === 0 ? (
        <EmptyState
          icon={<Icon className="w-6 h-6" />}
          title={t("emptyTitle")}
          message={t("emptyMsg", { category: sortLabels[sort].toLowerCase() })}
        />
      ) : (
        <>
          {/* Podium */}
          {podium.length >= 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Mobile: just stack 1,2,3. Desktop: 2,1,3 (1 in middle, raised) */}
              {(podium.length === 3
                ? [podium[1], podium[0], podium[2]]
                : podium
              ).map((u, viewIdx) => {
                const actualIdx =
                  podium.length === 3 ? [1, 0, 2][viewIdx] : viewIdx;
                const style = PODIUM_STYLE[actualIdx];
                const rank = rankForLevel(u.level);
                const isMe = u.id === currentUserId;
                const center = podium.length === 3 && viewIdx === 1;
                return (
                  <Link
                    key={u.id}
                    href={u.username ? `/u/${u.username}` : "#"}
                    onClick={(e) => {
                      if (isAdmin) {
                        e.preventDefault();
                        setAdminTarget(u);
                      }
                    }}
                    className={cn(
                      "border-2 bg-zinc-950/80 backdrop-blur-xs p-4 sm:p-5 flex flex-col items-center text-center transition-all relative",
                      style.border,
                      center && "sm:-mt-4 sm:scale-105",
                      isMe && "ring-2 ring-red-500/40 ring-offset-2 ring-offset-black",
                      "cursor-pointer hover:brightness-110",
                    )}
                    style={{
                      clipPath:
                        "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
                    }}
                  >
                    {actualIdx === 0 && (
                      <Crown
                        className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6"
                        style={{ color: style.color }}
                        fill={style.color}
                      />
                    )}

                    <div
                      className="font-display text-3xl tracking-wider mb-2"
                      style={{ color: style.color }}
                    >
                      {style.label}
                    </div>

                    {u.image ? (
                      <img
                        src={u.image}
                        alt=""
                        className="w-16 h-16 sm:w-20 sm:h-20 border-2 object-cover mb-3"
                        style={{ borderColor: style.color }}
                      />
                    ) : (
                      <img
                        src="/brand/skull.png"
                        alt=""
                        className="w-16 h-16 sm:w-20 sm:h-20 border-2 object-cover bg-black mb-3"
                        style={{ borderColor: style.color }}
                      />
                    )}

                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-bold text-white text-sm truncate max-w-[140px]">
                        {displayNick(u.displayName, u.username)}
                      </span>
                      {u.isAdmin && <ShieldCheck className="w-3 h-3 text-red-500" />}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">
                      @{u.username ?? "—"}
                    </div>

                    <div
                      className="font-mono text-xl font-bold tabular-nums"
                      style={{ color: style.color }}
                    >
                      {formatValue(u)}
                    </div>

                    <div
                      className="text-[10px] font-mono uppercase tracking-widest mt-1.5"
                      style={{ color: rank.color }}
                    >
                      {rank.emoji} LVL {u.level}{u.prestige ? ` ✦${u.prestige}` : ""} · {rank.name}
                    </div>

                    {isMe && (
                      <div className="text-[9px] font-bold tracking-widest uppercase text-red-400 mt-2">
                        {t("itsYou")}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Table (positions 4+) */}
          {rest.length > 0 && (
            <div
              className="border border-zinc-800 bg-zinc-950/80 backdrop-blur-xs max-h-[34rem] overflow-y-auto"
              style={{
                clipPath:
                  "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
              }}
            >
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-zinc-800 bg-zinc-950 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                    <th className="text-start p-3 w-16">#</th>
                    <th className="text-start p-3">{t("thUser")}</th>
                    <th className="text-end p-3 hidden sm:table-cell">{t("thLevel")}</th>
                    <th className="text-end p-3">{sortShorts[sort]}</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map((u, i) => (
                    <UserRow
                      key={u.id}
                      position={i + 4}
                      user={u}
                      isMe={u.id === currentUserId}
                      sortLabel={formatValue(u)}
                      onAdminClick={isAdmin ? () => setAdminTarget(u) : undefined}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* My rank if outside top 100 */}
          {myRank && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 px-1">
                {t("yourPosition")}
              </div>
              <div
                className="border-2 border-red-900/50 bg-red-950/10 backdrop-blur-xs overflow-hidden"
                style={{
                  clipPath:
                    "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
                }}
              >
                <table className="w-full">
                  <tbody>
                    <UserRow
                      position={myRank.position}
                      user={myRank.user}
                      isMe={true}
                      sortLabel={formatValue(myRank.user)}
                    />
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Admin quick-actions modal */}
      {adminTarget && (
        <AdminUserActions
          user={adminTarget}
          permissions={permissions}
          onClose={() => setAdminTarget(null)}
        />
      )}
    </div>
  );
}

function UserRow({
  position,
  user,
  isMe,
  sortLabel,
  onAdminClick,
}: {
  position: number;
  user: User;
  isMe: boolean;
  sortLabel: string;
  onAdminClick?: () => void;
}) {
  const t = useTranslations("ranking");
  const fmt = useLocaleFmt();
  const router = useRouter();
  const rank = rankForLevel(user.level);
  // Clickable: admin → modal, else navigate to public profile (if username exists)
  const handleClick = onAdminClick
    ? onAdminClick
    : user.username
      ? () => router.push(`/u/${user.username}`)
      : undefined;

  return (
    <tr
      onClick={handleClick}
      role={handleClick ? "button" : undefined}
      className={cn(
        "border-b border-zinc-900 last:border-0 transition-colors",
        isMe ? "bg-red-950/20" : "hover:bg-zinc-900/50",
        handleClick && "cursor-pointer",
      )}
    >
      <td className="p-3 font-mono text-zinc-500 tabular-nums">
        <div className="flex items-center gap-1.5">
          {position <= 10 && position > 3 && (
            <Medal className="w-3.5 h-3.5 text-zinc-600" />
          )}
          <span className={position <= 10 ? "text-white" : ""}>{position}</span>
        </div>
      </td>
      <td className="p-3">
        <div className="flex items-center gap-3 min-w-0">
          {user.image ? (
            <img src={user.image} alt="" width={32} height={32} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-8 h-8 object-cover border border-zinc-800 shrink-0" />
          ) : (
            <img src="/brand/skull.png" alt="" width={32} height={32} className="w-8 h-8 border border-zinc-800 object-cover bg-black shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-white font-medium truncate">
                {displayNick(user.displayName, user.username)}
              </span>
              {user.isAdmin && <ShieldCheck className="w-3 h-3 text-red-500 shrink-0" />}
              {user.isBanned && (
                <span className="text-[9px] font-bold tracking-widest uppercase border border-red-700 bg-red-950/50 text-red-300 px-1 shrink-0 flex items-center gap-1">
                  <Ban className="w-2.5 h-2.5" /> BANNED
                </span>
              )}
              {isMe && (
                <span className="text-[9px] font-bold tracking-widest uppercase text-red-400 shrink-0">
                  {t("itsYouShort")}
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono text-zinc-500 truncate">
              @{user.username ?? "—"}
            </div>
          </div>
        </div>
      </td>
      <td className="p-3 text-end hidden sm:table-cell">
        <span
          className="text-[10px] font-mono uppercase tracking-widest"
          style={{ color: rank.color }}
        >
          {rank.emoji} LVL {user.level}{user.prestige ? ` ✦${user.prestige}` : ""}
        </span>
      </td>
      <td className="p-3 text-end">
        <span className="font-mono text-sm font-bold text-white tabular-nums">
          {sortLabel}
        </span>
      </td>
    </tr>
  );
}

// ============== ADMIN QUICK-ACTIONS MODAL ==============

function AdminUserActions({
  user,
  permissions,
  onClose,
}: {
  user: User;
  permissions: Permissions;
  onClose: () => void;
}) {
  const t = useTranslations("ranking");
  const fmt = useLocaleFmt();
  const { tokenSymbol } = useTenantBranding();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  // Grant tokens form
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  // Role toggles
  const [makeAdmin, setMakeAdmin] = useState(user.isAdmin);
  const [makeMod, setMakeMod] = useState(false); // unknown from User type, default false
  const [makeDonator, setMakeDonator] = useState(false);

  function showToast(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4500);
  }

  async function grantTokens(value?: number) {
    const amt = value ?? parseInt(amount);
    if (!Number.isFinite(amt) || amt === 0) {
      showToast("err", t("admAmountZero"));
      return;
    }
    setBusy(true);
    try {
      const data = await apiPostStepUp<{ newBalance: number }>("/api/admin/grant-tokens", {
        target: user.username ?? user.id,
        amount: amt,
        reason: reason || "admin_quick_action",
      });
      const delta = `${amt > 0 ? "+" : ""}${fmt(amt)}`;
      showToast("ok", t("admGranted", { delta, user: user.username ?? "user", balance: fmt(data.newBalance) }));
      setAmount("");
      startTransition(() => router.refresh());
    } catch (err) {
      showToast("err", err instanceof ApiError ? err.message : t("err"));
    } finally { setBusy(false); }
  }

  async function banUser(durationDays: number) {
    const reason = prompt(t("admBanReasonPrompt")) ?? undefined;
    if (!confirm(durationDays > 0 ? t("admBanConfirmTemp", { days: durationDays }) : t("admBanConfirmPerm"))) return;
    setBusy(true);
    try {
      await apiPostStepUp("/api/admin/ban-user", { target: user.username ?? user.id, action: "ban", durationDays, reason });
      showToast("ok", durationDays > 0
        ? t("admBannedTemp", { user: user.username ?? "User", days: durationDays })
        : t("admBannedPerm", { user: user.username ?? "User" }));
      startTransition(() => router.refresh());
    } catch (err) {
      showToast("err", err instanceof ApiError ? err.message : t("err"));
    } finally { setBusy(false); }
  }

  async function unbanUser() {
    setBusy(true);
    try {
      await apiPostStepUp("/api/admin/ban-user", { target: user.username ?? user.id, action: "unban" });
      showToast("ok", t("admUnbanned", { user: user.username ?? "User" }));
      startTransition(() => router.refresh());
    } catch (err) {
      showToast("err", err instanceof ApiError ? err.message : t("err"));
    } finally { setBusy(false); }
  }

  async function setRole(role: "admin" | "moderator" | "donator", enable: boolean) {
    setBusy(true);
    try {
      await apiPost("/api/admin/user-roles", { target: user.username ?? user.id, role, enable });
      showToast("ok", enable ? t("admRoleGranted", { role }) : t("admRoleRevoked", { role }));
      startTransition(() => router.refresh());
    } catch (err) {
      showToast("err", err instanceof ApiError ? err.message : t("err"));
    } finally { setBusy(false); }
  }

  const dialogRef = useFocusTrap<HTMLDivElement>(true, { onEscape: () => { if (!busy) onClose(); } });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={displayNick(user.displayName, user.username)}
        className="bg-zinc-950 border-2 border-red-900/50 max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{
          clipPath:
            "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))",
        }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          {user.image ? (
            <img src={user.image} alt="" width={48} height={48} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-12 h-12 border-2 border-red-700 object-cover shrink-0" />
          ) : (
            <img src="/brand/skull.png" alt="" width={48} height={48} className="w-12 h-12 border-2 border-red-700 object-cover bg-black shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-display text-xl text-white tracking-wider truncate">
                {displayNick(user.displayName, user.username)}
              </h3>
              {user.isAdmin && <ShieldCheck className="w-4 h-4 text-red-500" />}
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              @{user.username ?? "—"} · LVL {user.level}{user.prestige ? ` ✦${user.prestige}` : ""} · {fmt(user.tokens)} {tokenSymbol}
            </div>
          </div>
          <button onClick={onClose} disabled={busy} className="text-zinc-500 hover:text-red-400 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick token grants */}
        {permissions.canGrantTokens && (
        <div className="space-y-2 mb-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1 flex items-center gap-1.5">
            <Coins className="w-3 h-3" /> {t("admQuickGrant")}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[100, 500, 1000, 5000, 10000, -500].map((v) => (
              <button
                key={v}
                onClick={() => grantTokens(v)}
                disabled={busy}
                className={cn(
                  "px-2 py-2 border text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50",
                  v > 0
                    ? "border-green-800 hover:border-green-500 text-green-300 hover:bg-green-950/40"
                    : "border-red-800 hover:border-red-500 text-red-300 hover:bg-red-950/40",
                )}
              >
                {v > 0 ? "+" : ""}{fmt(v)} {tokenSymbol}
              </button>
            ))}
          </div>

          {/* Custom amount */}
          <div className="flex gap-1.5 pt-1">
            <input
              type="number"
              placeholder={t("admCustomAmount")}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-white font-mono outline-hidden focus:border-red-600 placeholder:text-zinc-700"
            />
            <input
              type="text"
              placeholder={t("admReason")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="flex-1 border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-white outline-hidden focus:border-red-600 placeholder:text-zinc-700"
            />
            <button
              onClick={() => grantTokens()}
              disabled={busy || !amount}
              className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              GO
            </button>
          </div>
        </div>
        )}

        {/* Role toggles — admin-only */}
        {permissions.canSetRole && (
        <div className="space-y-2 mb-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1 flex items-center gap-1.5">
            <UserCog className="w-3 h-3" /> {t("admRoles")}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => { setMakeAdmin(!makeAdmin); setRole("admin", !makeAdmin); }}
              disabled={busy}
              className={cn(
                "px-2 py-2 border text-[10px] font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-1.5 disabled:opacity-50",
                makeAdmin ? "border-red-500 bg-red-600/20 text-red-300" : "border-zinc-800 text-zinc-500 hover:text-zinc-300",
              )}
            >
              <Crown className="w-3 h-3" /> ADMIN {makeAdmin ? "✓" : ""}
            </button>
            <button
              onClick={() => { setMakeMod(!makeMod); setRole("moderator", !makeMod); }}
              disabled={busy}
              className={cn(
                "px-2 py-2 border text-[10px] font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-1.5 disabled:opacity-50",
                makeMod ? "border-blue-500 bg-blue-600/20 text-blue-300" : "border-zinc-800 text-zinc-500 hover:text-zinc-300",
              )}
            >
              <ShieldCheck className="w-3 h-3" /> MOD {makeMod ? "✓" : ""}
            </button>
            <button
              onClick={() => { setMakeDonator(!makeDonator); setRole("donator", !makeDonator); }}
              disabled={busy}
              className={cn(
                "px-2 py-2 border text-[10px] font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-1.5 disabled:opacity-50",
                makeDonator ? "border-yellow-500 bg-yellow-600/20 text-yellow-300" : "border-zinc-800 text-zinc-500 hover:text-zinc-300",
              )}
            >
              <Heart className="w-3 h-3" /> DONATOR {makeDonator ? "✓" : ""}
            </button>
          </div>
          <p className="text-[9px] font-mono text-zinc-600 leading-snug">
            {t("admRolesNote")}
          </p>
        </div>
        )}

        {/* Ban / Unban */}
        {permissions.canBan && (
        <div className="space-y-2 mb-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1 flex items-center gap-1.5">
            <Ban className="w-3 h-3" /> {t("admBan")}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <button
              onClick={() => banUser(1)}
              disabled={busy || user.isAdmin}
              className="px-2 py-2 border border-orange-800 hover:border-orange-500 text-orange-300 hover:bg-orange-950/40 text-[10px] font-bold tracking-widest uppercase disabled:opacity-30 disabled:cursor-not-allowed"
              title={user.isAdmin ? t("admBanAdminTitle") : t("admBan1dTitle")}
            >
              {t("admBan1d")}
            </button>
            <button
              onClick={() => banUser(7)}
              disabled={busy || user.isAdmin}
              className="px-2 py-2 border border-orange-800 hover:border-orange-500 text-orange-300 hover:bg-orange-950/40 text-[10px] font-bold tracking-widest uppercase disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {t("admBan7d")}
            </button>
            <button
              onClick={() => banUser(30)}
              disabled={busy || user.isAdmin}
              className="px-2 py-2 border border-red-800 hover:border-red-500 text-red-300 hover:bg-red-950/40 text-[10px] font-bold tracking-widest uppercase disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {t("admBan30d")}
            </button>
            <button
              onClick={() => banUser(0)}
              disabled={busy || user.isAdmin}
              className="px-2 py-2 border-2 border-red-700 hover:bg-red-950 text-red-200 text-[10px] font-bold tracking-widest uppercase disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1"
            >
              <Ban className="w-3 h-3" /> {t("admBanPerm")}
            </button>
          </div>
          <button
            onClick={unbanUser}
            disabled={busy}
            className="w-full px-3 py-1.5 border border-green-800 hover:border-green-500 text-green-300 text-[10px] font-bold tracking-widest uppercase disabled:opacity-50"
          >
            {t("admUnban")}
          </button>
        </div>
        )}

        {/* Links to profile + full admin */}
        <div className="grid grid-cols-2 gap-2">
          {user.username && (
            <Link
              href={`/u/${user.username}`}
              className="text-center px-3 py-2 border border-zinc-800 hover:border-red-500 text-zinc-400 hover:text-red-400 text-[10px] font-bold tracking-widest uppercase"
            >
              {t("admPublicProfile")}
            </Link>
          )}
          <Link
            href="/admin"
            className="text-center px-3 py-2 border border-zinc-800 hover:border-red-500 text-zinc-400 hover:text-red-400 text-[10px] font-bold tracking-widest uppercase"
          >
            {t("admFullAdmin")}
          </Link>
        </div>

        {toast && (
          <div
            className={cn(
              "mt-3 px-3 py-2 text-xs flex items-center gap-2",
              toast.kind === "ok" ? "border border-green-700 bg-green-950/40 text-green-200" : "border border-red-700 bg-red-950/40 text-red-200",
            )}
          >
            {toast.kind === "ok" ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
            <span>{toast.msg}</span>
          </div>
        )}
      </div>
    </div>
  );
}

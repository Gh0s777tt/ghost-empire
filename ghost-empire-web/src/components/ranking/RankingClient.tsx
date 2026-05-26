"use client";
// src/components/ranking/RankingClient.tsx
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Trophy, TrendingUp, Sparkles, Flame, Crown, Medal, ShieldCheck,
  X, Loader2, Check, Coins, Heart, UserCog,
} from "lucide-react";
import { fmt, rankForLevel, cn } from "@/lib/utils";

type Sort = "tokens" | "totalEarned" | "level" | "streak";

type User = {
  id: string;
  username: string | null;
  displayName: string | null;
  name: string | null;
  image: string | null;
  tokens: number;
  totalEarned: number;
  level: number;
  xp: number;
  streak: number;
  isAdmin: boolean;
};

const SORT_META: Record<
  Sort,
  { label: string; short: string; icon: typeof Trophy; suffix: string; color: string }
> = {
  tokens:      { label: "BALANS GHOST TOKENS", short: "BALANS",     icon: Trophy,     suffix: "GT",    color: "#E50914" },
  totalEarned: { label: "ŁĄCZNIE ZAROBIONE",   short: "ZAROBIONE",  icon: TrendingUp, suffix: "GT",    color: "#10b981" },
  level:       { label: "POZIOM (LEVEL)",       short: "LEVEL",     icon: Sparkles,   suffix: "",      color: "#a855f7" },
  streak:      { label: "STREAK (DNI Z RZĘDU)", short: "STREAK",    icon: Flame,      suffix: "dni",   color: "#FF4500" },
};

const PODIUM_STYLE = [
  { color: "#FFD700", label: "1.", border: "border-yellow-500", glow: "shadow-yellow-500/30" },
  { color: "#C0C0C0", label: "2.", border: "border-zinc-400",   glow: "shadow-zinc-400/30"   },
  { color: "#CD7F32", label: "3.", border: "border-orange-700", glow: "shadow-orange-700/30" },
];

export function RankingClient({
  sort,
  topUsers,
  totalRanked,
  totalUsers,
  currentUserId,
  myRank,
  isAdmin,
}: {
  sort: Sort;
  topUsers: User[];
  totalRanked: number;
  totalUsers: number;
  currentUserId: string | null;
  myRank: { position: number; user: User } | null;
  isAdmin: boolean;
}) {
  const [adminTarget, setAdminTarget] = useState<User | null>(null);
  const meta = SORT_META[sort];
  const Icon = meta.icon;

  const podium = topUsers.slice(0, 3);
  const rest = topUsers.slice(3);

  function valueOf(u: User): string {
    const v = u[sort];
    if (sort === "level") return `LVL ${v}`;
    if (sort === "streak") return `${v} ${v === 1 ? "dzień" : "dni"}`;
    return `${fmt(v)} ${meta.suffix}`;
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
              RANKING
            </h1>
          </div>
          <p className="text-zinc-500 text-sm">
            Najlepsi członkowie Ghost Empire. Przegrupowuj wg metryki.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            W rankingu
          </div>
          <div className="font-mono text-2xl text-white tabular-nums">
            {fmt(totalRanked)}{" "}
            <span className="text-zinc-600 text-sm">/ {fmt(totalUsers)}</span>
          </div>
        </div>
      </div>

      {/* Sort tabs */}
      <div className="flex flex-wrap gap-2">
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
              {m.short}
            </Link>
          );
        })}
      </div>

      {topUsers.length === 0 ? (
        <div className="border border-zinc-800 bg-zinc-950/50 p-12 text-center">
          <Icon className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500">
            Nikt jeszcze nie ma punktów w kategorii "{meta.label.toLowerCase()}".
          </p>
        </div>
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
                  <div
                    key={u.id}
                    onClick={isAdmin ? () => setAdminTarget(u) : undefined}
                    role={isAdmin ? "button" : undefined}
                    className={cn(
                      "border-2 bg-zinc-950/80 backdrop-blur-sm p-4 sm:p-5 flex flex-col items-center text-center transition-all relative",
                      style.border,
                      center && "sm:-mt-4 sm:scale-105",
                      isMe && "ring-2 ring-red-500/40 ring-offset-2 ring-offset-black",
                      isAdmin && "cursor-pointer hover:brightness-110",
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
                      <div
                        className="w-16 h-16 sm:w-20 sm:h-20 border-2 bg-zinc-900 flex items-center justify-center text-3xl mb-3"
                        style={{ borderColor: style.color }}
                      >
                        👻
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-bold text-white text-sm truncate max-w-[140px]">
                        {u.displayName ?? u.name ?? "Anonim"}
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
                      {valueOf(u)}
                    </div>

                    <div
                      className="text-[10px] font-mono uppercase tracking-widest mt-1.5"
                      style={{ color: rank.color }}
                    >
                      {rank.emoji} LVL {u.level} · {rank.name}
                    </div>

                    {isMe && (
                      <div className="text-[9px] font-bold tracking-widest uppercase text-red-400 mt-2">
                        TO TY
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Table (positions 4+) */}
          {rest.length > 0 && (
            <div
              className="border border-zinc-800 bg-zinc-950/80 backdrop-blur-sm overflow-hidden"
              style={{
                clipPath:
                  "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
              }}
            >
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                    <th className="text-left p-3 w-16">#</th>
                    <th className="text-left p-3">User</th>
                    <th className="text-right p-3 hidden sm:table-cell">Level</th>
                    <th className="text-right p-3">{meta.short}</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map((u, i) => (
                    <UserRow
                      key={u.id}
                      position={i + 4}
                      user={u}
                      isMe={u.id === currentUserId}
                      sortLabel={valueOf(u)}
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
                Twoja pozycja
              </div>
              <div
                className="border-2 border-red-900/50 bg-red-950/10 backdrop-blur-sm overflow-hidden"
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
                      sortLabel={valueOf(myRank.user)}
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
  const rank = rankForLevel(user.level);
  return (
    <tr
      onClick={onAdminClick}
      role={onAdminClick ? "button" : undefined}
      className={cn(
        "border-b border-zinc-900 last:border-0 transition-colors",
        isMe ? "bg-red-950/20" : "hover:bg-zinc-900/50",
        onAdminClick && "cursor-pointer",
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
            <img src={user.image} alt="" className="w-8 h-8 object-cover border border-zinc-800 flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 border border-zinc-800 bg-zinc-900 flex items-center justify-center text-sm flex-shrink-0">
              👻
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-white font-medium truncate">
                {user.displayName ?? user.name ?? "Anonim"}
              </span>
              {user.isAdmin && <ShieldCheck className="w-3 h-3 text-red-500 flex-shrink-0" />}
              {isMe && (
                <span className="text-[9px] font-bold tracking-widest uppercase text-red-400 flex-shrink-0">
                  TY
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono text-zinc-500 truncate">
              @{user.username ?? "—"}
            </div>
          </div>
        </div>
      </td>
      <td className="p-3 text-right hidden sm:table-cell">
        <span
          className="text-[10px] font-mono uppercase tracking-widest"
          style={{ color: rank.color }}
        >
          {rank.emoji} LVL {user.level}
        </span>
      </td>
      <td className="p-3 text-right">
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
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
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
      showToast("err", "Wpisz kwotę != 0");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/grant-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: user.username ?? user.id,
          amount: amt,
          reason: reason || "admin_quick_action",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast("err", data.error ?? "Błąd");
      } else {
        showToast("ok", `${amt > 0 ? "+" : ""}${fmt(amt)} GT → ${user.username ?? "user"}. Balans: ${fmt(data.newBalance)}`);
        setAmount("");
        startTransition(() => router.refresh());
      }
    } finally { setBusy(false); }
  }

  async function setRole(role: "admin" | "moderator" | "donator", enable: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/user-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: user.username ?? user.id, role, enable }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast("err", data.error ?? "Błąd");
      } else {
        showToast("ok", `${enable ? "Nadano" : "Odebrano"} ${role}`);
        startTransition(() => router.refresh());
      }
    } finally { setBusy(false); }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => !busy && onClose()}
    >
      <div
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
            <img src={user.image} alt="" className="w-12 h-12 border-2 border-red-700 object-cover flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 border-2 border-red-700 bg-zinc-900 flex items-center justify-center text-xl flex-shrink-0">👻</div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-display text-xl text-white tracking-wider truncate">
                {user.displayName ?? user.name ?? "Anonim"}
              </h3>
              {user.isAdmin && <ShieldCheck className="w-4 h-4 text-red-500" />}
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              @{user.username ?? "—"} · LVL {user.level} · {fmt(user.tokens)} GT
            </div>
          </div>
          <button onClick={onClose} disabled={busy} className="text-zinc-500 hover:text-red-400 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick token grants */}
        <div className="space-y-2 mb-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1 flex items-center gap-1.5">
            <Coins className="w-3 h-3" /> Szybki grant tokenów
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
                {v > 0 ? "+" : ""}{fmt(v)} GT
              </button>
            ))}
          </div>

          {/* Custom amount */}
          <div className="flex gap-1.5 pt-1">
            <input
              type="number"
              placeholder="Custom kwota"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-white font-mono outline-none focus:border-red-600 placeholder:text-zinc-700"
            />
            <input
              type="text"
              placeholder="Powód"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="flex-1 border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-red-600 placeholder:text-zinc-700"
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

        {/* Role toggles */}
        <div className="space-y-2 mb-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1 flex items-center gap-1.5">
            <UserCog className="w-3 h-3" /> Role
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
            Klik = toggle. Stan rzeczywisty z bazy może się różnić od UI tu — odśwież po zmianach.
          </p>
        </div>

        {/* Link to full admin */}
        <Link
          href="/admin"
          className="block w-full text-center px-3 py-2 border border-zinc-800 hover:border-red-500 text-zinc-400 hover:text-red-400 text-[10px] font-bold tracking-widest uppercase"
        >
          → Pełen panel admin (sklep, eventy, audit log)
        </Link>

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

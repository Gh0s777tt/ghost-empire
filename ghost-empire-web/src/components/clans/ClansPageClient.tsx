"use client";
// src/components/clans/ClansPageClient.tsx
// Clans/teams — found or join a clan, pour GT into the shared treasury (a sink),
// and climb the treasury leaderboard. Data + actions via /api/clans.
import { useState, useEffect, useCallback } from "react";
import { Loader2, Crown, Users, LogOut, Plus, Coins } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { signIn } from "next-auth/react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { emitBalance } from "@/lib/balance-bus";
import { useTenantBranding } from "@/components/TenantBranding";
import { TAG_MAX, NAME_MAX, normalizeClanTag } from "@/lib/clans";

type Member = { id: string; username: string | null; displayName: string | null; image: string | null; level: number; clanRole: string | null };
type MyClan = { id: string; name: string; tag: string; treasury: number; ownerUserId: string; members: Member[] };
type LeaderRow = { id: string; name: string; tag: string; treasury: number; members: number };
type ClansData = { myClan: MyClan | null; balance: number; createCost: number; leaderboard: LeaderRow[] };

export function ClansPageClient({ isAuthenticated }: { isAuthenticated: boolean }) {
  const t = useTranslations("clans");
  const nf = useLocale();
  const { tokenSymbol } = useTenantBranding();
  const sym = tokenSymbol || "GT";

  const [loading, setLoading] = useState(isAuthenticated);
  const [data, setData] = useState<ClansData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [newTag, setNewTag] = useState("");
  const [joinTag, setJoinTag] = useState("");
  const [contrib, setContrib] = useState("");

  const load = useCallback(async () => {
    try { setData(await apiGet<ClansData>("/api/clans")); }
    catch { /* leave empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAuthenticated) void load(); }, [isAuthenticated, load]);

  function flash(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 2800);
  }

  async function act(action: string, payload: Record<string, unknown>, okMsg?: string): Promise<boolean> {
    setBusy(action);
    try {
      const r = await apiPost<{ balance?: number; newBalance?: number }>("/api/clans", { action, ...payload });
      const bal = r.newBalance ?? r.balance;
      if (typeof bal === "number") emitBalance(bal);
      if (okMsg) flash("ok", okMsg);
      await load();
      return true;
    } catch (err) {
      flash("err", err instanceof ApiError ? err.message : t("errGeneric"));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (await act("create", { name: newName.trim(), tag: newTag }, t("created"))) { setNewName(""); setNewTag(""); }
  }
  async function join() {
    if (await act("join", { tag: joinTag }, t("joined"))) setJoinTag("");
  }
  async function leave() {
    if (confirm(t("leaveConfirm"))) await act("leave", {}, t("left"));
  }
  async function contribute() {
    const amount = parseInt(contrib || "0", 10);
    if (await act("contribute", { amount }, t("contributed", { n: amount.toLocaleString(nf) }))) setContrib("");
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">{t("title")}</h1>
      <p className="text-zinc-500 text-sm mb-6">{t("subtitle")}</p>

      {toast && (
        <div className={`mb-4 text-sm px-3 py-2 rounded-lg border ${toast.kind === "ok" ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-300" : "border-red-800/60 bg-red-950/30 text-red-300"}`}>
          {toast.msg}
        </div>
      )}

      {!isAuthenticated ? (
        <div className="border border-zinc-800 bg-black/40 rounded-xl p-8 text-center">
          <Users className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
          <h2 className="text-lg font-bold text-white mb-1">{t("guestTitle")}</h2>
          <p className="text-zinc-400 text-sm mb-4">{t("guestText")}</p>
          <button onClick={() => signIn()} className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "var(--brand)" }}>{t("login")}</button>
        </div>
      ) : loading ? (
        <div className="text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}</div>
      ) : !data ? (
        <div className="text-sm text-zinc-500 text-center py-8 border border-zinc-900 bg-black/20 rounded-xl">{t("errGeneric")}</div>
      ) : (
        <div className="space-y-6">
          {data.myClan ? (
            <div className="border border-zinc-800 bg-black/40 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 rounded bg-white/5 text-xs font-mono font-bold" style={{ color: "var(--brand)" }}>[{data.myClan.tag}]</span>
                <h2 className="text-lg font-bold text-white truncate">{data.myClan.name}</h2>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="border border-zinc-800 bg-black/30 p-3">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("treasury")}</div>
                  <div className="text-sm font-bold text-white tabular-nums">{data.myClan.treasury.toLocaleString(nf)} {sym}</div>
                </div>
                <div className="border border-zinc-800 bg-black/30 p-3">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("members")}</div>
                  <div className="text-sm font-bold text-white tabular-nums">{data.myClan.members.length}</div>
                </div>
              </div>

              <div className="space-y-1 mb-4">
                {data.myClan.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 text-sm border border-zinc-900 bg-black/20 px-2 py-1.5 rounded">
                    {m.clanRole === "owner" ? <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : <Users className="w-3.5 h-3.5 text-zinc-600 shrink-0" />}
                    <span className="text-zinc-200 truncate flex-1">{m.displayName || m.username || "—"}</span>
                    <span className="text-[11px] font-mono text-zinc-500 shrink-0">lvl {m.level}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mb-2">
                <input value={contrib} inputMode="numeric" placeholder={t("contributePlaceholder")}
                  onChange={(e) => setContrib(e.target.value.replace(/[^0-9]/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") void contribute(); }}
                  className="flex-1 bg-black/60 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm tabular-nums focus:outline-none focus:border-zinc-500" />
                <button onClick={() => void contribute()} disabled={busy !== null}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 inline-flex items-center gap-2" style={{ background: "var(--brand)" }}>
                  {busy === "contribute" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />} {t("contributeBtn")}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-600">{t("balance", { n: data.balance.toLocaleString(nf), sym })}</span>
                <button onClick={() => void leave()} disabled={busy !== null} className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 disabled:opacity-50">
                  <LogOut className="w-3.5 h-3.5" /> {t("leave")}
                </button>
              </div>
              <p className="text-[11px] text-zinc-600 mt-2">{t("sinkNote")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border border-zinc-800 bg-black/40 rounded-xl p-4">
                <h3 className="text-sm font-bold text-white mb-2">{t("createTitle")}</h3>
                <input value={newName} maxLength={NAME_MAX} placeholder={t("createName")} onChange={(e) => setNewName(e.target.value)}
                  className="w-full mb-2 bg-black/60 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-500" />
                <input value={newTag} maxLength={TAG_MAX} placeholder={t("createTag")} onChange={(e) => setNewTag(normalizeClanTag(e.target.value))}
                  className="w-full mb-2 bg-black/60 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm font-mono uppercase focus:outline-none focus:border-zinc-500" />
                <button onClick={() => void create()} disabled={busy !== null}
                  className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 inline-flex items-center justify-center gap-2" style={{ background: "var(--brand)" }}>
                  {busy === "create" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {t("createBtn", { cost: data.createCost.toLocaleString(nf) })}
                </button>
                <p className="text-[11px] text-zinc-600 mt-2">{t("createHint")}</p>
              </div>
              <div className="border border-zinc-800 bg-black/40 rounded-xl p-4">
                <h3 className="text-sm font-bold text-white mb-2">{t("joinTitle")}</h3>
                <input value={joinTag} maxLength={TAG_MAX} placeholder={t("joinTag")} onChange={(e) => setJoinTag(normalizeClanTag(e.target.value))}
                  onKeyDown={(e) => { if (e.key === "Enter") void join(); }}
                  className="w-full mb-2 bg-black/60 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm font-mono uppercase focus:outline-none focus:border-zinc-500" />
                <button onClick={() => void join()} disabled={busy !== null}
                  className="w-full px-3 py-2 rounded-lg text-sm font-semibold border border-zinc-700 text-zinc-200 hover:border-zinc-500 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                  {busy === "join" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />} {t("joinBtn")}
                </button>
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t("leaderboardTitle")}</div>
            {data.leaderboard.length === 0 ? (
              <div className="text-xs text-zinc-600 text-center py-4 border border-zinc-900 bg-black/20 rounded-lg">{t("lbEmpty")}</div>
            ) : (
              <div className="space-y-1">
                {data.leaderboard.map((c, i) => {
                  const mine = data.myClan?.id === c.id;
                  return (
                    <div key={c.id} className={`flex items-center gap-3 px-3 py-2 rounded border ${mine ? "border-[color:var(--brand)] bg-white/5" : "border-zinc-900 bg-black/20"}`}>
                      <span className="w-5 text-center text-xs font-mono text-zinc-500 shrink-0">{i + 1}</span>
                      <span className="px-1.5 py-0.5 rounded bg-white/5 text-[11px] font-mono font-bold shrink-0" style={{ color: "var(--brand)" }}>{c.tag}</span>
                      <span className="text-sm text-zinc-200 truncate flex-1">{c.name}{mine && <span className="text-[10px] text-zinc-500"> · {t("you")}</span>}</span>
                      <span className="text-[11px] font-mono text-zinc-500 shrink-0 inline-flex items-center gap-1"><Users className="w-3 h-3" />{c.members}</span>
                      <span className="text-xs font-mono text-zinc-300 tabular-nums shrink-0 w-24 text-right">{c.treasury.toLocaleString(nf)} {sym}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

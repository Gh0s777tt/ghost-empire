"use client";
// src/components/admin/sections/MergeUsers.tsx — lazily-loaded duplicate-account merge tool.
import { useState, useEffect, useCallback } from "react";
import { GitMerge, AlertTriangle, Loader2, History, Eye } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { SectionCard } from "../shared";
import { apiGet, apiPost, apiPostStepUp, ApiError } from "@/lib/api-client";

type MergeUser = {
  id: string;
  username: string | null;
  displayName: string | null;
  email: string | null;
  image: string | null;
  discordId: string | null;
  tokens: number;
  totalEarned: number;
  totalDonated: number;
  level: number;
  isAdmin: boolean;
  isModerator: boolean;
  isBanned: boolean;
  createdAt: string;
  accountsCount: number;
  connectionsCount: number;
  transactionsCount: number;
  donationsCount: number;
  achievementsCount: number;
  connections: Array<{ platform: string; username: string }>;
};

type MergeGroup = {
  reason: string;
  matchOn: string;
  users: MergeUser[];
};

type MergePreview = {
  primary: { id: string; username: string | null; tokens: number };
  secondary: { id: string; username: string | null; tokens: number };
  willMove: Record<string, number>;
  conflicts: {
    accountProviders: string[];
    connectionPlatforms: string[];
    achievements: number;
    socialLinks: number;
    eventEntries: number;
    dropClaims: number;
  };
  finalPrimaryTokens: number;
};

export function MergeUsersSection({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.mergeUsers");
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<MergeGroup[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ groups?: MergeGroup[] }>("/api/admin/merge-users");
      setGroups(data.groups ?? []);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0) {
        setError(err.message || t("loadError"));
        setGroups([]);
      } else {
        setError(t("netErr"));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  return (
    <SectionCard title={t("title")} icon={GitMerge}>
      <div className="border border-orange-900 bg-orange-950/20 px-3 py-2.5 text-xs text-orange-200 mb-4 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-orange-400" />
        <div>
          {t.rich("warning", { b: (c) => <strong>{c}</strong> })}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={load}
          disabled={loading || pending}
          className="text-[10px] font-mono uppercase tracking-widest border border-zinc-700 hover:border-red-700 text-zinc-300 hover:text-white px-2.5 py-1.5 transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <History className="w-3 h-3" />}
          {t("rescan")}
        </button>
        <span className="text-[10px] text-zinc-500">
          {t("detectHint")}
        </span>
      </div>

      {error && (
        <div className="border border-red-700 bg-red-950/40 px-3 py-2 text-xs text-red-200 mb-3">
          {error}
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <div className="border border-zinc-800 bg-black/30 p-6 text-center text-zinc-500 text-sm">
          {t("empty")}
        </div>
      )}

      <div className="space-y-4">
        {groups.map((g, i) => (
          <DuplicateGroupCard
            key={`${g.reason}-${i}`}
            group={g}
            onToast={onToast}
            onSuccess={() => { onSuccess(); void load(); }}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function DuplicateGroupCard({
  group, onToast, onSuccess,
}: {
  group: MergeGroup;
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
}) {
  const t = useTranslations("admin.mergeUsers");
  const nf = useLocale();
  const MERGE_REASON_LABEL = t.raw("reason") as Record<string, string>;
  // Pick primary by default = the user with most tokens (likely the "real" account)
  const defaultPrimaryId = group.users.reduce((acc, u) => (u.tokens > acc.tokens ? u : acc), group.users[0]).id;
  const [primaryId, setPrimaryId] = useState<string>(defaultPrimaryId);
  const [secondaryId, setSecondaryId] = useState<string>(
    group.users.find((u) => u.id !== defaultPrimaryId)?.id ?? "",
  );
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [executing, setExecuting] = useState(false);

  const secondary = group.users.find((u) => u.id === secondaryId);
  const expectedConfirm = secondary?.username ?? "";

  async function loadPreview() {
    if (!secondaryId || primaryId === secondaryId) return;
    setPreviewing(true);
    setPreview(null);
    try {
      const data = await apiPost<MergePreview>("/api/admin/merge-users", { action: "preview", primary: primaryId, secondary: secondaryId });
      setPreview(data);
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || "Preview failed") : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function execute() {
    if (confirmText.trim() !== expectedConfirm) {
      onToast("err", t("confirmRequired"));
      return;
    }
    setExecuting(true);
    try {
      const data = await apiPostStepUp<{ summary: { tokens: number; transactions: number } }>("/api/admin/merge-users", {
        action: "execute",
        primary: primaryId,
        secondary: secondaryId,
        confirm: confirmText.trim(),
      });
      onToast("ok", t("merged", { tokens: String(data.summary.tokens), txn: String(data.summary.transactions) }));
      setPreview(null);
      setConfirmText("");
      onSuccess();
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || "Merge failed") : "Merge failed");
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="border border-zinc-800 bg-black/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 border border-red-700 bg-red-950/30 text-red-300">
          {MERGE_REASON_LABEL[group.reason]}
        </span>
        <span className="text-[10px] font-mono text-zinc-500">{group.matchOn}</span>
      </div>

      {/* User comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {group.users.map((u) => {
          const isPrim = u.id === primaryId;
          const isSec = u.id === secondaryId;
          return (
            <div
              key={u.id}
              className={cn(
                "border p-3 cursor-pointer transition-colors",
                isPrim ? "border-green-700 bg-green-950/20" :
                isSec ? "border-orange-700 bg-orange-950/20" :
                "border-zinc-800 bg-black/30 hover:border-zinc-600",
              )}
              onClick={() => {
                // Click cycles role: primary → secondary → unselected → primary
                if (isPrim) {
                  // Make this secondary, pick another as primary
                  const other = group.users.find((x) => x.id !== u.id);
                  if (other) {
                    setPrimaryId(other.id);
                    setSecondaryId(u.id);
                    setPreview(null);
                  }
                } else if (isSec) {
                  setSecondaryId("");
                  setPreview(null);
                } else {
                  setSecondaryId(u.id);
                  setPreview(null);
                }
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {u.image ? (

                    <img src={u.image} alt="" width={32} height={32} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full border border-zinc-800" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800" />
                  )}
                  <div>
                    <div className="text-sm font-bold text-white">{u.displayName || u.username || u.id.slice(-6)}</div>
                    <div className="text-[10px] font-mono text-zinc-500">@{u.username ?? "?"}</div>
                  </div>
                </div>
                <div>
                  {isPrim && <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-green-700 bg-green-950/40 text-green-300">Primary</span>}
                  {isSec  && <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-orange-700 bg-orange-950/40 text-orange-300">Secondary</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono">
                <div className="text-zinc-500">Tokens</div>
                <div className="text-white text-right">{u.tokens.toLocaleString(nf)}</div>
                <div className="text-zinc-500">Earned</div>
                <div className="text-white text-right">{u.totalEarned.toLocaleString(nf)}</div>
                <div className="text-zinc-500">Donated</div>
                <div className="text-white text-right">{(u.totalDonated / 100).toFixed(2)} PLN</div>
                <div className="text-zinc-500">Level</div>
                <div className="text-white text-right">{u.level}</div>
                <div className="text-zinc-500">Transactions</div>
                <div className="text-white text-right">{u.transactionsCount}</div>
                <div className="text-zinc-500">Achievements</div>
                <div className="text-white text-right">{u.achievementsCount}</div>
                <div className="text-zinc-500">Accounts</div>
                <div className="text-white text-right">{u.accountsCount}</div>
                <div className="text-zinc-500">Connections</div>
                <div className="text-white text-right">{u.connectionsCount}</div>
                <div className="text-zinc-500">{t("created")}</div>
                <div className="text-white text-right">{new Date(u.createdAt).toLocaleDateString(nf)}</div>
              </div>

              {(u.isAdmin || u.isModerator || u.isBanned) && (
                <div className="flex gap-1 mt-2">
                  {u.isAdmin     && <span className="text-[9px] px-1.5 py-0.5 border border-red-700 bg-red-950/40 text-red-300">ADMIN</span>}
                  {u.isModerator && <span className="text-[9px] px-1.5 py-0.5 border border-blue-700 bg-blue-950/40 text-blue-300">MOD</span>}
                  {u.isBanned    && <span className="text-[9px] px-1.5 py-0.5 border border-zinc-700 bg-black/40 text-zinc-400">BANNED</span>}
                </div>
              )}

              {u.connections.length > 0 && (
                <div className="mt-2 text-[10px] text-zinc-500">
                  {t("platforms")} {u.connections.map((c) => `${c.platform}=${c.username}`).join(", ")}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Preview + execute */}
      {primaryId && secondaryId && primaryId !== secondaryId && (
        <div className="border border-zinc-800 bg-black/50 p-3 space-y-3">
          {!preview ? (
            <button
              onClick={loadPreview}
              disabled={previewing}
              className="text-[10px] font-mono uppercase tracking-widest border border-zinc-700 hover:border-red-700 text-zinc-200 hover:text-white px-3 py-1.5 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {previewing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
              {t("showPreview")}
            </button>
          ) : (
            <>
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                {t("willMoveHeader", { sec: preview.secondary.username ?? "?", prim: preview.primary.username ?? "?" })}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px] font-mono">
                {Object.entries(preview.willMove).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-zinc-500">{k}</span>
                    <span className="text-white">{v}</span>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-zinc-400">
                {t.rich("finalTokens", { b: (c) => <strong className="text-white">{c}</strong>, n: preview.finalPrimaryTokens.toLocaleString(nf) })}
              </div>

              {(preview.conflicts.accountProviders.length > 0 ||
                preview.conflicts.connectionPlatforms.length > 0 ||
                preview.conflicts.achievements > 0 ||
                preview.conflicts.socialLinks > 0 ||
                preview.conflicts.eventEntries > 0 ||
                preview.conflicts.dropClaims > 0) && (
                <div className="border border-orange-900 bg-orange-950/20 p-2 text-[11px] text-orange-200">
                  <div className="font-bold mb-1">{t("conflicts")}</div>
                  {preview.conflicts.accountProviders.length > 0 && (
                    <div>Account providers: {preview.conflicts.accountProviders.join(", ")}</div>
                  )}
                  {preview.conflicts.connectionPlatforms.length > 0 && (
                    <div>Connection platforms: {preview.conflicts.connectionPlatforms.join(", ")}</div>
                  )}
                  {preview.conflicts.achievements > 0 && <div>Achievements: {preview.conflicts.achievements}</div>}
                  {preview.conflicts.socialLinks > 0 && <div>Social links: {preview.conflicts.socialLinks}</div>}
                  {preview.conflicts.eventEntries > 0 && <div>Event entries: {preview.conflicts.eventEntries}</div>}
                  {preview.conflicts.dropClaims > 0 && <div>Drop claims: {preview.conflicts.dropClaims}</div>}
                </div>
              )}

              <div className="border-t border-zinc-800 pt-3">
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
                  {t.rich("confirmLabel", { code: (c) => <code className="text-orange-300">{c}</code>, name: expectedConfirm })}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={expectedConfirm}
                    className="flex-1 border border-zinc-700 bg-black/40 px-2.5 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600"
                  />
                  <button
                    onClick={execute}
                    disabled={executing || confirmText.trim() !== expectedConfirm}
                    className="text-[10px] font-mono uppercase tracking-widest bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 transition-colors flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {executing ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitMerge className="w-3 h-3" />}
                    {t("mergeNow")}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

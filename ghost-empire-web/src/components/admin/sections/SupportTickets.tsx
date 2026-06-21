"use client";
// src/components/admin/sections/SupportTickets.tsx — lazily-loaded viewer-support inbox.
// Lists this portal's tickets, lets the owner reply / resolve / reopen; every reply and
// resolve notifies the viewer. Backed by /api/admin/support-tickets (GET + PATCH).
import { useState, useEffect, useCallback } from "react";
import { LifeBuoy, Loader2, Send, Check, RotateCcw } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPatch, ApiError } from "@/lib/api-client";

type StatusFilter = "open" | "resolved" | "all";

type AdminTicket = {
  id: string;
  subject: string;
  message: string;
  status: string;
  adminReply: string | null;
  createdAt: string;
  resolvedAt: string | null;
  user: { id: string; username: string | null; displayName: string | null; image: string | null };
};

export function SupportTicketsManager({
  onToast, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.supportTickets");
  const nf = useLocale();
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (status: StatusFilter) => {
    setLoading(true);
    try {
      const d = await apiGet<{ tickets: AdminTicket[]; openCount: number }>(`/api/admin/support-tickets?status=${status}`);
      setTickets(d.tickets ?? []);
      setOpenCount(d.openCount ?? 0);
    } catch { /* keep current */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(filter); }, [filter, load]);

  async function act(id: string, action: "reply" | "resolve" | "reopen") {
    const reply = (replies[id] ?? "").trim();
    if (action === "reply" && reply.length < 1) { onToast("err", t("emptyReply")); return; }
    setBusyId(id);
    try {
      await apiPatch("/api/admin/support-tickets", { ticketId: id, action, ...(reply ? { reply } : {}) });
      onToast("ok", t(`done_${action}`));
      setReplies((r) => { const n = { ...r }; delete n[id]; return n; });
      await load(filter);
    } catch (e) {
      onToast("err", e instanceof ApiError ? e.message : t("err"));
    } finally { setBusyId(null); }
  }

  const who = (u: AdminTicket["user"]) => u.displayName || u.username || t("anon");

  return (
    <SectionCard title={t("title")} icon={LifeBuoy}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro")}</p>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 mb-4">
        {(["open", "resolved", "all"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest border transition-colors ${
              filter === f ? "border-red-700 bg-red-950/40 text-white" : "border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600"
            }`}
          >
            {t(`filter_${f}`)}{f === "open" && openCount > 0 ? ` (${openCount})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("loading")}</div>
      ) : tickets.length === 0 ? (
        <p className="text-zinc-500 text-sm py-4 text-center">{t("empty")}</p>
      ) : (
        <div className="space-y-3">
          {tickets.map((tk) => {
            const resolved = tk.status === "resolved";
            const busy = busyId === tk.id;
            return (
              <div key={tk.id} className="border border-zinc-800 bg-black/30 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white flex-1 min-w-0 truncate">{tk.subject}</span>
                  <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border ${resolved ? "border-emerald-700 text-emerald-300" : "border-amber-700 text-amber-300"}`}>
                    {resolved ? t("statusResolved") : t("statusOpen")}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                  {who(tk.user)} · {new Date(tk.createdAt).toLocaleString(nf, { dateStyle: "short", timeStyle: "short" })}
                </div>
                <p className="text-xs text-zinc-300 mt-2 whitespace-pre-wrap break-words">{tk.message}</p>

                {tk.adminReply && (
                  <div className="mt-2 border-s-2 border-sky-700 ps-2">
                    <div className="text-[9px] font-mono uppercase tracking-widest text-sky-400 flex items-center gap-1"><Check className="w-3 h-3" /> {t("yourReply")}</div>
                    <p className="text-[11px] text-zinc-300 mt-0.5 whitespace-pre-wrap break-words">{tk.adminReply}</p>
                  </div>
                )}

                {/* Reply box + actions */}
                <div className="mt-3 space-y-2">
                  <textarea
                    value={replies[tk.id] ?? ""}
                    onChange={(e) => setReplies((r) => ({ ...r, [tk.id]: e.target.value }))}
                    placeholder={tk.adminReply ? t("replyAgainPh") : t("replyPh")}
                    maxLength={2000}
                    rows={2}
                    className="w-full border border-zinc-800 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600 resize-y"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => act(tk.id, "reply")}
                      disabled={busy || pending}
                      className="px-3 py-1.5 bg-sky-700 hover:bg-sky-600 disabled:opacity-40 text-white text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5"
                    >
                      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} {t("send")}
                    </button>
                    {resolved ? (
                      <button
                        type="button"
                        onClick={() => act(tk.id, "reopen")}
                        disabled={busy || pending}
                        className="px-3 py-1.5 border border-zinc-700 hover:border-zinc-500 disabled:opacity-40 text-zinc-300 text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3 h-3" /> {t("reopen")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => act(tk.id, "resolve")}
                        disabled={busy || pending}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5"
                      >
                        <Check className="w-3 h-3" /> {t("resolve")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

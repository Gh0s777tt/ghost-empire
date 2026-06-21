"use client";
// src/components/profile/SupportTicketCard.tsx
// Viewer support tickets (#audit5): collapsible /profile card to open a ticket to the streamer
// and see your own tickets + admin replies. Loads on first open. Mirrors the standalone-card
// pattern of ShippingProfileCard/DataExportCard.
import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { LifeBuoy, Loader2, ChevronDown, Send, Check } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type Ticket = {
  id: string;
  subject: string;
  message: string;
  status: string;
  adminReply: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export function SupportTicketCard() {
  const t = useTranslations("supportTicket");
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ tickets: Ticket[] }>("/api/profile/tickets");
      setTickets(d.tickets ?? []);
    } catch { /* leave empty */ } finally { setLoaded(true); }
  }, []);
  useEffect(() => { if (open && !loaded) void load(); }, [open, loaded, load]);

  async function submit() {
    if (subject.trim().length < 3 || message.trim().length < 5) { setMsg({ kind: "err", text: t("tooShort") }); return; }
    setBusy(true); setMsg(null);
    try {
      await apiPost("/api/profile/tickets", { subject: subject.trim(), message: message.trim() });
      setSubject(""); setMessage("");
      setMsg({ kind: "ok", text: t("sent") });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : t("err") });
    } finally { setBusy(false); }
  }

  return (
    <div className="border border-zinc-800 bg-zinc-950/60 rounded-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 text-start hover:bg-white/[0.02] transition-colors rounded-xl"
      >
        <LifeBuoy className="w-5 h-5 text-sky-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white">{t("title")}</div>
          <div className="text-[11px] text-zinc-500">{t("subtitle")}</div>
        </div>
        <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* New ticket */}
          <div className="space-y-2">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("subjectPh")}
              maxLength={120}
              className="w-full border border-zinc-800 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-sky-600"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("messagePh")}
              maxLength={2000}
              rows={3}
              className="w-full border border-zinc-800 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-sky-600 resize-y"
            />
            {msg && (
              <div role={msg.kind === "ok" ? "status" : "alert"} className={`text-xs ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</div>
            )}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="min-h-[40px] px-3 py-2 bg-sky-700 hover:bg-sky-600 disabled:opacity-40 text-white text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5 rounded-lg"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {t("send")}
            </button>
          </div>

          {/* My tickets */}
          {!loaded ? (
            <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("loading")}</div>
          ) : tickets.length === 0 ? (
            <p className="text-[11px] text-zinc-600">{t("empty")}</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {tickets.map((tk) => (
                <div key={tk.id} className="border border-zinc-800 bg-black/30 p-2.5 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white truncate flex-1">{tk.subject}</span>
                    <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border ${tk.status === "resolved" ? "border-emerald-700 text-emerald-300" : "border-amber-700 text-amber-300"}`}>
                      {tk.status === "resolved" ? t("statusResolved") : t("statusOpen")}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 whitespace-pre-wrap break-words">{tk.message}</p>
                  {tk.adminReply && (
                    <div className="mt-2 border-s-2 border-sky-700 ps-2">
                      <div className="text-[9px] font-mono uppercase tracking-widest text-sky-400 flex items-center gap-1"><Check className="w-3 h-3" /> {t("reply")}</div>
                      <p className="text-[11px] text-zinc-300 mt-0.5 whitespace-pre-wrap break-words">{tk.adminReply}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

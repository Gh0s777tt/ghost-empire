"use client";
// src/components/admin/sections/ChatCommands.tsx — lazily-loaded chat commands manager
// (incl. conditional gating: requiresLive / activeFromMinute).
import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Loader2, Eye, EyeOff, Pencil, Trash2, Check, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { SectionCard, ListSearch } from "../shared";
import { filterByText } from "@/lib/list-filter";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type ChatCommandRow = {
  id: string;
  trigger: string;
  response: string;
  cooldownSeconds: number;
  enabled: boolean;
  requiresLive: boolean;
  activeFromMinute: number;
};

export function ChatCommandsManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.chatCommands");
  const tc = useTranslations("common");
  const [loading, setLoading] = useState(true);
  const [commands, setCommands] = useState<ChatCommandRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Create / edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fTrigger, setFTrigger] = useState("");
  const [fResponse, setFResponse] = useState("");
  const [fCooldown, setFCooldown] = useState("15");
  const [fRequiresLive, setFRequiresLive] = useState(false);
  const [fActiveFrom, setFActiveFrom] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ commands?: ChatCommandRow[] }>("/api/admin/chat-commands");
      setCommands(data.commands ?? []);
    } catch { /* keep current */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function call(action: string, payload: Record<string, unknown>) {
    try {
      await apiPost("/api/admin/chat-commands", { action, ...payload });
      return true;
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
      return false;
    }
  }

  function resetForm() {
    setEditingId(null);
    setFTrigger("");
    setFResponse("");
    setFCooldown("15");
    setFRequiresLive(false);
    setFActiveFrom("0");
  }

  function startEdit(c: ChatCommandRow) {
    setEditingId(c.id);
    setFTrigger(c.trigger);
    setFResponse(c.response);
    setFCooldown(String(c.cooldownSeconds));
    setFRequiresLive(c.requiresLive);
    setFActiveFrom(String(c.activeFromMinute));
  }

  async function submit() {
    const trigger = fTrigger.trim().toLowerCase();
    const response = fResponse.trim();
    const cooldownSeconds = Math.max(0, parseInt(fCooldown, 10) || 0);
    const activeFromMinute = Math.max(0, parseInt(fActiveFrom, 10) || 0);
    if (!trigger || !response) {
      onToast("err", t("fieldsRequired"));
      return;
    }
    setBusy("form");
    const fields = { trigger, response, cooldownSeconds, requiresLive: fRequiresLive, activeFromMinute };
    const ok = editingId
      ? await call("update", { id: editingId, ...fields })
      : await call("create", fields);
    if (ok) {
      onToast("ok", editingId ? t("saved") : t("created"));
      resetForm();
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  async function toggleEnabled(c: ChatCommandRow) {
    setBusy(c.id);
    if (await call("update", { id: c.id, enabled: !c.enabled })) await load();
    setBusy(null);
  }

  async function deleteCmd(c: ChatCommandRow) {
    if (!confirm(t("deleteConfirm", { trigger: c.trigger }))) return;
    setBusy(c.id);
    if (await call("delete", { id: c.id })) {
      onToast("ok", t("deleted"));
      if (editingId === c.id) resetForm();
      await load();
    }
    setBusy(null);
  }

  return (
    <SectionCard title={t("title")} icon={MessageSquare}>
      <p className="text-zinc-500 text-xs mb-3">
        {t.rich("intro", { b: (c) => <strong>{c}</strong>, code: (c) => <code className="text-zinc-300">{c}</code> })}
      </p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : (
        <div className="space-y-2 mb-4">
          {commands.length > 8 && (
            <ListSearch value={query} onChange={setQuery} placeholder={tc("searchPlaceholder")} shown={filterByText(commands, query, (c) => [c.trigger, c.response]).length} total={commands.length} />
          )}
          {commands.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
              {t("empty")}
            </div>
          ) : (
            (() => {
              const filtered = filterByText(commands, query, (c) => [c.trigger, c.response]);
              if (filtered.length === 0) return <p className="text-zinc-600 text-sm py-1">{tc("noResults")}</p>;
              return filtered.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "border bg-black/30 p-3",
                  c.enabled ? "border-zinc-800" : "border-zinc-900 opacity-60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[11px] font-mono px-1.5 py-0.5 border border-red-800 bg-red-950/30 text-red-300 shrink-0">
                      {c.trigger}
                    </span>
                    {c.requiresLive && (
                      <span className="text-[9px] font-mono px-1 py-0.5 border border-green-800 bg-green-950/30 text-green-400 shrink-0" title={t("liveTitle")}>
                        LIVE
                      </span>
                    )}
                    {c.activeFromMinute > 0 && (
                      <span className="text-[9px] font-mono px-1 py-0.5 border border-zinc-700 text-zinc-400 shrink-0" title={t("activeFromTitle", { min: c.activeFromMinute })}>
                        ≥{c.activeFromMinute}min
                      </span>
                    )}
                    <span className="text-sm text-zinc-300 truncate">{c.response}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-mono text-zinc-600 mr-1" title={t("cooldownTitle")}>{c.cooldownSeconds}s</span>
                    <button
                      onClick={() => toggleEnabled(c)}
                      disabled={busy === c.id || pending}
                      className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center"
                      title={c.enabled ? t("disable") : t("enable")}
                    >
                      {c.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => startEdit(c)}
                      disabled={busy === c.id || pending}
                      className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center"
                      title={t("editTitle")}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteCmd(c)}
                      disabled={busy === c.id || pending}
                      className="text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-6 h-6 flex items-center justify-center"
                      title={t("deleteTitle")}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
              ));
            })()
          )}
        </div>
      )}

      {/* Create / edit form */}
      <div className="border border-zinc-800 bg-black/30 p-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
          {editingId ? t("editForm") : t("addForm")}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_90px] gap-2 mb-2">
          <input
            value={fTrigger}
            onChange={(e) => setFTrigger(e.target.value)}
            placeholder={t("triggerPh")}
            className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono focus:border-red-700 outline-hidden"
          />
          <input
            value={fResponse}
            onChange={(e) => setFResponse(e.target.value)}
            placeholder={t("responsePh")}
            className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
          />
          <input
            type="number"
            value={fCooldown}
            onChange={(e) => setFCooldown(e.target.value)}
            min={0}
            title={t("cooldownInputTitle")}
            className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2">
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={fRequiresLive}
              onChange={(e) => setFRequiresLive(e.target.checked)}
              className="accent-red-600"
            />
            {t("onlyLive")}
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400">
            {t("activeFromLabel")}
            <input
              type="number"
              value={fActiveFrom}
              onChange={(e) => setFActiveFrom(e.target.value)}
              min={0}
              title={t("activeFromInputTitle")}
              className="w-16 bg-black border border-zinc-800 px-2 py-1 text-sm text-white focus:border-red-700 outline-hidden"
            />
          </label>
          <span className="text-[10px] text-zinc-600">{t.rich("subRequiredNote", { code: (c) => <span className="font-mono">{c}</span>, event: "stream.online" })}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={submit}
            disabled={busy === "form" || pending}
            className="bg-red-900/40 border border-red-800 hover:border-red-600 text-red-200 px-3 py-1.5 text-xs font-mono uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy === "form" ? <Loader2 className="w-3 h-3 animate-spin" /> : editingId ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {editingId ? t("saveBtn") : t("addBtn")}
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              disabled={busy === "form"}
              className="border border-zinc-800 hover:border-zinc-600 text-zinc-400 px-3 py-1.5 text-xs font-mono uppercase tracking-widest"
            >
              {t("cancel")}
            </button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

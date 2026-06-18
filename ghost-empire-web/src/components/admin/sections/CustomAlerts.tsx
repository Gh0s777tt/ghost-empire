"use client";
// src/components/admin/sections/CustomAlerts.tsx — lazily-loaded custom (manual) alerts.
import { useState, useEffect } from "react";
import { Bell, Plus, Loader2, Check, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard, FieldInput, FieldTextarea } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { AlertCard } from "@/components/AlertCard";

type CustomAlertRow = { id: string; label: string; title: string; message: string; icon: string | null; accent: string | null; amount: number | null; amountLabel: string | null };

export function CustomAlertsCard({
  onToast,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.customAlerts");
  const [list, setList] = useState<CustomAlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomAlertRow | null>(null);
  const [creating, setCreating] = useState(false);

  const [label, setLabel] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [icon, setIcon] = useState("🔔");
  const [accent, setAccent] = useState("#E50914");
  const [useAccent, setUseAccent] = useState(false);
  const [amount, setAmount] = useState("");
  const [amountLabel, setAmountLabel] = useState("");

  async function load() {
    try {
      const d = await apiGet<{ customAlerts?: CustomAlertRow[] }>("/api/admin/custom-alerts");
      setList(d.customAlerts ?? []);
    } catch { /* keep */ } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function openCreate() {
    setEditing(null); setCreating(true);
    setLabel(""); setTitle(""); setMessage(""); setIcon("🔔"); setAccent("#E50914"); setUseAccent(false); setAmount(""); setAmountLabel("");
  }
  function openEdit(a: CustomAlertRow) {
    setCreating(false); setEditing(a);
    setLabel(a.label); setTitle(a.title); setMessage(a.message); setIcon(a.icon ?? "🔔");
    setAccent(a.accent ?? "#E50914"); setUseAccent(!!a.accent); setAmount(a.amount?.toString() ?? ""); setAmountLabel(a.amountLabel ?? "");
  }

  async function call(payload: Record<string, unknown>, okMsg?: string) {
    setBusy(typeof payload.id === "string" ? payload.id : "new");
    try {
      await apiPost("/api/admin/custom-alerts", payload);
      if (okMsg) onToast("ok", okMsg);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0) onToast("err", err.message || t("err"));
      else onToast("err", t("netErr"));
      return false;
    } finally { setBusy(null); }
  }

  async function save() {
    const ok = await call(
      { action: editing ? "update" : "create", id: editing?.id, label, title, message, icon, accent: useAccent ? accent : null, amount, amountLabel },
      editing ? t("saved") : t("created"),
    );
    if (ok) { setEditing(null); setCreating(false); await load(); }
  }

  const previewAccent = useAccent ? accent : "#E50914";

  return (
    <SectionCard title={t("title")} icon={Bell}>
      <div className="space-y-4">
        <p className="text-zinc-500 text-xs leading-relaxed">
          {t.rich("intro", { b: (c) => <strong className="text-zinc-300">{c}</strong> })}
        </p>

        {!(creating || editing) && (
          <button onClick={openCreate} className="w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2">
            <Plus className="w-3.5 h-3.5" /> {t("newAlert")}
          </button>
        )}

        {(creating || editing) && (
          <div className="border border-zinc-800 bg-black/30 p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <FieldInput label={t("nameLabel")} value={label} onChange={setLabel} placeholder={t("namePh")} />
              <FieldInput label={t("iconLabel")} value={icon} onChange={setIcon} placeholder="🔔" />
            </div>
            <FieldInput label={t("titleLabel")} value={title} onChange={setTitle} placeholder="🚨 RAID!" />
            <FieldTextarea label={t("messageLabel")} value={message} onChange={setMessage} emoji />
            <div className="grid grid-cols-2 gap-2">
              <FieldInput label={t("amountLabel")} value={amount} onChange={setAmount} type="number" />
              <FieldInput label={t("amountLabelLabel")} value={amountLabel} onChange={setAmountLabel} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={useAccent} onChange={(e) => setUseAccent(e.target.checked)} className="accent-red-500" />
              <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">{t("useAccentLabel")}</span>
              {useAccent && <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-7 w-12 bg-black border border-zinc-800 cursor-pointer" />}
            </label>

            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("previewLabel")}</label>
              <div className="border border-zinc-800 rounded-sm p-4" style={{ background: "repeating-conic-gradient(#18181b 0% 25%, #0a0a0a 0% 50%) 50% / 24px 24px" }}>
                <AlertCard
                  alert={{ title: title || t("previewTitle"), message: message || t("previewMessage"), icon, actorName: null, actorImage: null, amount: amount ? parseInt(amount) : null, amountLabel: amountLabel || null }}
                  accent={previewAccent}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setEditing(null); setCreating(false); }} className="flex-1 px-4 py-2 border border-zinc-800 hover:border-zinc-700 text-zinc-400 text-xs font-bold tracking-widest uppercase transition-all">{t("cancel")}</button>
              <button onClick={save} disabled={busy !== null || !label.trim() || !title.trim()} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {busy === "new" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {editing ? t("saveBtn") : t("createBtn")}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
        ) : (
          <div className="space-y-1">
            {list.length === 0 && <p className="text-zinc-600 text-sm">{t("empty")}</p>}
            {list.map((a) => (
              <div key={a.id} className="flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-2 py-1.5">
                <span className="text-lg shrink-0">{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{a.label}</div>
                  <div className="text-[10px] text-zinc-500 truncate">{a.title}</div>
                </div>
                {a.accent && <span className="w-3 h-3 rounded-full shrink-0" style={{ background: a.accent }} title={a.accent} />}
                <button
                  onClick={() => call({ action: "fire", id: a.id }, t("fired", { label: a.label }))}
                  disabled={busy !== null}
                  title={t("fireTitle")}
                  className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50"
                >
                  {t("fireBtn")}
                </button>
                <button onClick={() => openEdit(a)} disabled={busy !== null} title={t("editTitle")} className="text-zinc-500 hover:text-white disabled:opacity-50"><Pencil className="w-3.5 h-3.5" /></button>
                <button
                  onClick={async () => { if (window.confirm(t("deleteConfirm", { label: a.label })) && await call({ action: "delete", id: a.id }, t("deleted"))) await load(); }}
                  disabled={busy !== null}
                  title={t("deleteTitle")}
                  className="text-zinc-500 hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

"use client";
// src/components/admin/sections/DatabaseReset.tsx — lazily-loaded danger-zone DB reset.
// Two scopes (#741): wipe EVERY portal, or just ONE (so resetting e-forge doesn't nuke the rest).
// The confirmation phrase is "USUŃ WSZYSTKO" for the global wipe, or the exact portal SLUG for a
// scoped one — you must type the thing you're deleting.
import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { AlertTriangle, Trash2, Loader2, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPostStepUp, ApiError } from "@/lib/api-client";

type Portal = { id: string; slug: string; name: string; users: number };

export function DatabaseResetCard({
  onToast, onSuccess,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.databaseReset");
  const ALL_PHRASE = "USUŃ WSZYSTKO"; // backend-matched literal for the global wipe
  const [scope, setScope] = useState<"all" | "tenant">("tenant");
  const [portals, setPortals] = useState<Portal[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<{ tenants: Portal[] }>("/api/admin/tenants")
      .then((d) => { setPortals(d.tenants); if (d.tenants.length && !tenantId) setTenantId(d.tenants[0].id); })
      .catch(() => { /* not the platform owner / pre-tenant — only the global wipe is available */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch the portal list once on mount; `tenantId` is deliberately excluded so picking a portal doesn't refetch (#779)
  }, []);

  const selectedPortal = portals.find((p) => p.id === tenantId) ?? null;
  const expected = scope === "all" ? ALL_PHRASE : (selectedPortal?.slug ?? "");
  const armed = expected.length > 0 && confirm.trim() === expected && (scope === "all" || !!tenantId);

  async function submit() {
    if (!armed) return;
    if (!window.confirm(t("lastWarning"))) return;
    setBusy(true);
    try {
      const payload = scope === "tenant" ? { confirm: confirm.trim(), scope, tenantId } : { confirm: confirm.trim(), scope };
      const data = await apiPostStepUp<{ deletedUsers: number; selfDeleted: boolean }>("/api/admin/reset-database", payload);
      onToast("ok", t("resetDone", { count: data.deletedUsers }));
      if (data.selfDeleted) {
        setTimeout(() => signOut({ callbackUrl: "/welcome" }), 1800); // acting admin's account was wiped
      } else {
        setConfirm(""); onSuccess();
      }
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0) onToast("err", err.message || t("err"));
      else onToast("err", t("netErr"));
      setBusy(false);
    }
  }

  return (
    <SectionCard title={t("title")} icon={AlertTriangle}>
      {/* Backup — grab a copy before doing anything destructive */}
      <div className="mb-3 border border-zinc-800 bg-black/30 p-4">
        <p className="text-xs text-zinc-200 font-bold mb-1 flex items-center gap-2">
          <Download className="w-4 h-4 text-green-400" /> {t("backupTitle")}
        </p>
        <p className="text-[11px] text-zinc-500 leading-relaxed mb-2.5">
          {t.rich("backupDesc", { b: (c) => <strong className="text-zinc-300">{c}</strong> })}
        </p>
        <a
          href="/api/admin/backup"
          className="inline-flex items-center gap-2 px-4 py-2 border border-zinc-700 hover:border-green-600 text-green-300 text-xs font-bold tracking-widest uppercase transition-all"
        >
          <Download className="w-3.5 h-3.5" /> {t("downloadBackup")}
        </a>
      </div>

      <div className="space-y-3 border border-red-800 bg-red-950/20 p-4">
        <p className="text-sm text-red-300 font-bold flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> {t("dangerZone")}
        </p>

        {/* Scope: one portal vs all portals */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => { setScope("tenant"); setConfirm(""); }}
            className={`px-3 py-2 text-[11px] font-mono uppercase tracking-widest border transition-colors ${scope === "tenant" ? "border-red-600 bg-red-950/40 text-red-200" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"}`}
          >
            {t("scopeTenant")}
          </button>
          <button
            onClick={() => { setScope("all"); setConfirm(""); }}
            className={`px-3 py-2 text-[11px] font-mono uppercase tracking-widest border transition-colors ${scope === "all" ? "border-red-600 bg-red-950/40 text-red-200" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"}`}
          >
            {t("scopeAll")}
          </button>
        </div>

        {scope === "tenant" ? (
          <div className="space-y-2">
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block">{t("pickPortal")}
              <select
                value={tenantId}
                onChange={(e) => { setTenantId(e.target.value); setConfirm(""); }}
                className="w-full mt-1 bg-black border border-zinc-800 px-2 py-2 text-sm text-white outline-hidden focus:border-red-600"
              >
                {portals.length === 0 && <option value="">—</option>}
                {portals.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.slug}) · {t("usersCount", { count: p.users })}</option>)}
              </select>
            </label>
            <p className="text-xs text-zinc-400 leading-relaxed">{t.rich("scopeTenantDesc", { b: (c) => <strong className="text-white">{c}</strong> })}</p>
          </div>
        ) : (
          <p className="text-xs text-zinc-400 leading-relaxed">{t.rich("dangerDesc1", { b: (c) => <strong className="text-white">{c}</strong> })}</p>
        )}
        <p className="text-xs text-zinc-400 leading-relaxed">{t.rich("dangerDesc2", { b: (c) => <strong className="text-green-300">{c}</strong> })}</p>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            {t.rich("unlockLabel", { red: (c) => <span className="text-red-400 font-bold">{c}</span>, p: expected || "—" })}
          </label>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={expected || "—"}
            disabled={scope === "tenant" && !tenantId}
            className="w-full bg-black border border-zinc-800 px-3 py-2 text-sm text-white focus:border-red-500 outline-hidden disabled:opacity-50"
          />
        </div>
        <button
          onClick={submit}
          disabled={busy || !armed}
          className="w-full px-4 py-2.5 bg-red-700 hover:bg-red-600 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          {scope === "tenant" && selectedPortal ? t("resetBtnTenant", { name: selectedPortal.name }) : t("resetBtn")}
        </button>
      </div>
    </SectionCard>
  );
}

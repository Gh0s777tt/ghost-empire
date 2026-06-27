"use client";
// src/components/admin/sections/AuditLog.tsx
// Lazily-loaded admin audit log (extracted from the AdminClient monolith).
import { History } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { SectionCard } from "../shared";
import type { AuditEntry } from "../types";

// Structural only (emoji + color); labels come from the `admin.auditLog.action` namespace.
const ACTION_META: Record<string, { emoji: string; color: string }> = {
  grant_tokens:        { emoji: "💰", color: "#10b981" },
  create_drop:         { emoji: "🎁", color: "#FF4500" },
  deactivate_drop:     { emoji: "🗑️", color: "#71717a" },
  create_event:        { emoji: "📅", color: "#3b82f6" },
  deactivate_event:    { emoji: "🗑️", color: "#71717a" },
  draw_event:          { emoji: "🎲", color: "#a855f7" },
  deliver_order:       { emoji: "📦", color: "#10b981" },
  refund_order:        { emoji: "↩️", color: "#fbbf24" },
  set_user_role:       { emoji: "👑", color: "#ef4444" },
  set_connection_role: { emoji: "🔗", color: "#a855f7" },
  reset_database:      { emoji: "💥", color: "#ef4444" },
  manage_codes:        { emoji: "🔑", color: "#10b981" },
  manage_achievements: { emoji: "🏆", color: "#fbbf24" },
  manage_polls:        { emoji: "📊", color: "#3b82f6" },
  create_prediction:   { emoji: "🔮", color: "#3b82f6" },
  resolve_prediction:  { emoji: "✅", color: "#10b981" },
  cancel_prediction:   { emoji: "🚫", color: "#fbbf24" },
  test_alert:          { emoji: "🔔", color: "#a855f7" },
  update_alert_settings: { emoji: "⚙️", color: "#71717a" },
  merge_users:         { emoji: "🔀", color: "#a855f7" },
  update_moderation:   { emoji: "🛡️", color: "#3b82f6" },
  update_integrations: { emoji: "🔌", color: "#10b981" },
};

export function AuditLogSection({ auditLog }: { auditLog: AuditEntry[] }) {
  const t = useTranslations("admin.auditLog");
  const nf = useLocale();
  if (auditLog.length === 0) {
    return (
      <SectionCard title={t("secTitle")} icon={History}>
        <p className="text-zinc-500 text-sm">{t("empty")}</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t("title", { count: auditLog.length })} icon={History}>
      <div className="space-y-1 max-h-[500px] overflow-y-auto">
        {auditLog.map((entry) => {
          const meta = ACTION_META[entry.action] ?? { emoji: "•", color: "#71717a" };
          const label = t.has(`action.${entry.action}`) ? t(`action.${entry.action}`) : entry.action;
          const date = new Date(entry.createdAt);
          let detailsText = "";
          if (entry.details) {
            try {
              const parsed = JSON.parse(entry.details);
              detailsText = Object.entries(parsed)
                // Drop keys already shown as the target name (avoids duplication).
                .filter(([k, v]) => v !== null && v !== undefined && v !== "" && k !== "targetUsername" && k !== "username")
                .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
                .join(" · ");
            } catch {
              detailsText = entry.details;
            }
          }
          return (
            <div key={entry.id} className="flex items-start gap-3 border-l-2 border-zinc-800 pl-3 py-1.5">
              <span className="text-base shrink-0">{meta.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap text-sm">
                  <span className="font-semibold text-white">
                    {entry.adminName ?? t("accountDeleted")}
                  </span>
                  <span className="font-bold" style={{ color: meta.color }}>
                    {label}
                  </span>
                  {entry.targetName && (
                    <>
                      <span className="text-zinc-600">→</span>
                      <span className="font-semibold text-white">{entry.targetName}</span>
                    </>
                  )}
                  <span className="text-[10px] font-mono text-zinc-700 ml-auto whitespace-nowrap">
                    {date.toLocaleString(nf, { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
                {detailsText && (
                  <div className="text-[11px] font-mono text-zinc-500 leading-snug mt-0.5 break-all">
                    {detailsText}
                  </div>
                )}
                {entry.ipAddress && (
                  <div className="text-[9px] font-mono text-zinc-700 mt-0.5">
                    IP: {entry.ipAddress}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

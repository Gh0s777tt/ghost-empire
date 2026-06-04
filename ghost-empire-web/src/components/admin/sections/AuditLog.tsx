// src/components/admin/sections/AuditLog.tsx
// Lazily-loaded admin audit log (extracted from the AdminClient monolith).
import { History } from "lucide-react";
import { SectionCard } from "../shared";
import type { AuditEntry } from "../types";

const ACTION_LABEL: Record<string, { label: string; emoji: string; color: string }> = {
  grant_tokens:        { label: "Grant tokenów",   emoji: "💰", color: "#10b981" },
  create_drop:         { label: "Nowy drop",       emoji: "🎁", color: "#FF4500" },
  deactivate_drop:     { label: "Dezakt. drop",    emoji: "🗑️", color: "#71717a" },
  create_event:        { label: "Nowy event",      emoji: "📅", color: "#3b82f6" },
  deactivate_event:    { label: "Dezakt. event",   emoji: "🗑️", color: "#71717a" },
  draw_event:          { label: "Losowanie",       emoji: "🎲", color: "#a855f7" },
  deliver_order:       { label: "Dostarczone",     emoji: "📦", color: "#10b981" },
  refund_order:        { label: "Zwrot",           emoji: "↩️", color: "#fbbf24" },
  set_user_role:       { label: "Rola usera",      emoji: "👑", color: "#ef4444" },
  set_connection_role: { label: "Status platform", emoji: "🔗", color: "#a855f7" },
  reset_database:      { label: "Reset bazy",       emoji: "💥", color: "#ef4444" },
  manage_codes:        { label: "Kody (drop)",      emoji: "🔑", color: "#10b981" },
  manage_achievements: { label: "Osiągnięcia",      emoji: "🏆", color: "#fbbf24" },
  manage_polls:        { label: "Ankieta",          emoji: "📊", color: "#3b82f6" },
  create_prediction:   { label: "Nowa predykcja",   emoji: "🔮", color: "#3b82f6" },
  resolve_prediction:  { label: "Rozstrzygnięcie",  emoji: "✅", color: "#10b981" },
  cancel_prediction:   { label: "Anulow. predykcji", emoji: "🚫", color: "#fbbf24" },
  test_alert:          { label: "Test alert",       emoji: "🔔", color: "#a855f7" },
  update_alert_settings: { label: "Ustaw. alertów", emoji: "⚙️", color: "#71717a" },
  merge_users:         { label: "Scalenie kont",    emoji: "🔀", color: "#a855f7" },
};

export function AuditLogSection({ auditLog }: { auditLog: AuditEntry[] }) {
  if (auditLog.length === 0) {
    return (
      <SectionCard title="Audit log" icon={History}>
        <p className="text-zinc-500 text-sm">Brak akcji admin w bazie. Tu pojawi się każdy grant/draw/refund kto i kiedy.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={`Audit log (ostatnie ${auditLog.length})`} icon={History}>
      <div className="space-y-1 max-h-[500px] overflow-y-auto">
        {auditLog.map((entry) => {
          const meta = ACTION_LABEL[entry.action] ?? { label: entry.action, emoji: "•", color: "#71717a" };
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
                    {entry.adminName ?? "konto usunięte"}
                  </span>
                  <span className="font-bold" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  {entry.targetName && (
                    <>
                      <span className="text-zinc-600">→</span>
                      <span className="font-semibold text-white">{entry.targetName}</span>
                    </>
                  )}
                  <span className="text-[10px] font-mono text-zinc-700 ml-auto whitespace-nowrap">
                    {date.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}
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

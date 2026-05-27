// src/lib/audit.ts
// Persistent audit log for admin actions. Use from every endpoint that mutates
// user state through admin authority. Never blocks the calling request on failure
// — auditing should never break the user flow.
import { prisma } from "@/lib/prisma";

type AdminActionType =
  | "grant_tokens"
  | "create_drop"
  | "deactivate_drop"
  | "create_event"
  | "deactivate_event"
  | "draw_event"
  | "deliver_order"
  | "refund_order"
  | "set_user_role"
  | "set_connection_role"
  | "test_alert"
  | "update_alert_settings"
  | "merge_users"
  | "create_prediction"
  | "resolve_prediction"
  | "cancel_prediction";

export async function logAdminAction(opts: {
  adminId: string;
  adminName?: string | null;
  action: AdminActionType;
  targetType?: string;
  targetId?: string;
  details?: unknown;
  req?: Request;
}) {
  try {
    const ip = opts.req ? extractIp(opts.req) : null;
    await prisma.adminAction.create({
      data: {
        adminId: opts.adminId,
        adminName: opts.adminName ?? null,
        action: opts.action,
        targetType: opts.targetType ?? null,
        targetId: opts.targetId ?? null,
        details: opts.details ? JSON.stringify(opts.details).slice(0, 4000) : null,
        ipAddress: ip,
      },
    });
  } catch (e) {
    // Never throw — audit failure should not break admin actions.
    console.error("[audit] failed to log action:", e);
  }
}

export function extractIp(req: Request): string | null {
  const headers = req.headers;
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real;
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf;
  return null;
}

// src/lib/audit.ts
// Persistent audit log for admin actions. Use from every endpoint that mutates
// user state through admin authority. Never blocks the calling request on failure
// — auditing should never break the user flow.
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { createLogger } from "@/lib/logger";

const log = createLogger("audit");

type AdminActionType =
  | "grant_tokens"
  | "create_drop"
  | "deactivate_drop"
  | "edit_shop_item"
  | "create_shop_item"
  | "create_event"
  | "edit_event"
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
  | "cancel_prediction"
  | "reset_database"
  | "manage_codes"
  | "manage_achievements"
  | "manage_polls"
  | "update_moderation"
  | "update_integrations"
  | "create_obs_rule"
  | "update_obs_rule"
  | "delete_obs_rule"
  | "create_govee_rule"
  | "update_govee_rule"
  | "delete_govee_rule"
  | "update_wheel"
  | "push_broadcast"
  | "respond_ticket"
  | "resolve_bounty"
  | "delete_bounty"
  | "backfill_tenant";

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
    // Stamp the portal where the action happened so the audit log is per-portal (#750):
    // a sub-tenant admin must not see other portals' actions/nicks/IPs.
    const tenantId = await currentTenantId();
    await prisma.adminAction.create({
      data: {
        tenantId,
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
    log.error("failed to log action", e);
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

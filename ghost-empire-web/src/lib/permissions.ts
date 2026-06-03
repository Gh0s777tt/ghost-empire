// src/lib/permissions.ts
// Granular permissions for moderators. Admins implicitly have all.
// Set on User.modPermissions: String[] in DB.

export const MOD_PERMISSIONS = [
  { id: "grant_tokens",    label: "Przyznawanie tokenów",       group: "economy",    desc: "Dodawanie / odejmowanie Ghost Tokens userom (sekcja Użytkownicy)." },
  { id: "manage_shop",     label: "Edycja sklepu",              group: "economy",    desc: "Edycja sklepu, harmonogramu streamów i bota Discord." },
  { id: "deliver_orders",  label: "Realizacja zamówień",        group: "economy",    desc: "Oznaczanie oczekujących zamówień ze sklepu jako zrealizowane." },
  { id: "create_events",   label: "Tworzenie eventów",          group: "events",     desc: "Tworzenie eventów i predykcji (zakładów GT)." },
  { id: "edit_events",     label: "Edycja eventów",             group: "events",     desc: "Edycja istniejących eventów." },
  { id: "draw_events",     label: "Losowanie zwycięzców",       group: "events",     desc: "Losowanie zwycięzców w eventach / giveawayach." },
  { id: "create_drops",    label: "Tworzenie drop codes",       group: "events",     desc: "Tworzenie i zarządzanie drop-code'ami (kody na streamie)." },
  { id: "ban_users",       label: "Banowanie userów",           group: "moderation", desc: "Banowanie userów — blokada konta (czasowa lub stała)." },
  { id: "mute_users",      label: "Mutowanie userów",           group: "moderation", desc: "Wyciszanie userów." },
  { id: "mark_subs",       label: "Flagowanie subskrybentów",   group: "moderation", desc: "Nadawanie statusu sub / mod / VIP per platforma." },
  { id: "view_audit",      label: "Podgląd audit log",          group: "moderation", desc: "Wgląd w log akcji admina i moderacji." },
] as const;

export type ModPermission = (typeof MOD_PERMISSIONS)[number]["id"];

export const PERMISSION_GROUPS: Record<string, { label: string; color: string }> = {
  economy:    { label: "EKONOMIA",   color: "#10b981" },
  events:     { label: "EVENTY",     color: "#a855f7" },
  moderation: { label: "MODERACJA",  color: "#3b82f6" },
};

/**
 * Server-side helper to check if a user (admin or moderator) can perform
 * a specific action. Admins bypass all permission checks.
 */
export function hasPermission(
  user: { isAdmin: boolean; isModerator: boolean; modPermissions: string[] },
  permission: ModPermission,
): boolean {
  if (user.isAdmin) return true;
  if (!user.isModerator) return false;
  return user.modPermissions.includes(permission);
}

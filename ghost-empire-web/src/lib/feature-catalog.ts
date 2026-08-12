// src/lib/feature-catalog.ts
// SINGLE SOURCE OF TRUTH for the per-streamer FEATURE TOGGLES (owner switchboard).
//
// Every user-facing feature a portal owner can turn on/off lives here as one row. BOTH the
// settings UI (client) and the gates (admin nav + public surfaces, server) import this module,
// so it is deliberately PURE — no `next/server`, no Prisma, no React. Adding a feature = one row.
//
// TWO AXES, never conflated:
//   • PLAN (entitlements-core.ts) — the billing tier; platform-controlled; what a portal is even
//     allowed to use. A row's `planFeature` maps it to that gate.
//   • OWNER FLAG (Tenant.featureFlags JSON) — this catalog; the owner turns a feature off WITHIN
//     what the plan already unlocks. An owner flag can only NARROW, never widen (see isFeatureLive).
//
// DEFAULTS: a missing key / NULL featureFlags ⇒ the row's `defaultOn` (almost all true), so an
// un-migrated deploy or a brand-new portal HIDES NOTHING. Only `penalties` defaults OFF (its own
// real-money legal gate stays the source of truth for enablement — see api/admin/penalties).
//
// LABELS are the EXISTING admin `sec*` i18n keys (already translated in 14 locales — zero new
// label strings); DESCRIPTIONS are new `featDesc_*` keys (pl+en authoritative, rest fall back to
// EN per the i18n deep-merge). Both resolved under the `admin` namespace, through the branding
// resolver (%tokenName%/%gt%) — never a founder literal. White-label: this is a PLATFORM feature;
// only the flag VALUES are per-portal.
import { type Plan, type Feature, planHasFeature } from "@/lib/entitlements-core";

/** UI grouping for the settings page, in display order. */
export type FeatureCategory = "games" | "economy" | "overlays" | "community" | "bot" | "integrations" | "lighting";

export const FEATURE_CATEGORIES: FeatureCategory[] = [
  "games",
  "economy",
  "overlays",
  "community",
  "bot",
  "integrations",
  "lighting",
];

export type FeatureRow = {
  /** Stable id. For features backed by an admin section it EQUALS that section's id (so the nav
   *  gate is a trivial id match); page-only features use their own id (casino, companion). */
  key: string;
  /** i18n key (admin namespace) for the switch title — reuses the section's existing `sec*` key. */
  label: string;
  /** i18n key (admin namespace) for the one-line "what it does" description (`featDesc_*`). */
  description: string;
  category: FeatureCategory;
  /** Value used when the tenant has no explicit flag (NULL featureFlags / missing key). */
  defaultOn: boolean;
  /** AdminClient SectionId this row shows/hides. Omitted for page-only features (no admin section). */
  adminSectionId?: string;
  /** Plan capability this ALSO requires (entitlements). If the plan lacks it, the toggle is locked. */
  planFeature?: Feature;
  /** Reserved: a row only the founder portal may see. Unused today ("when unsure → platform"). */
  founderOnly?: boolean;
};

// key === adminSectionId for every section-backed row (keeps the nav gate a plain id match).
export const FEATURE_CATALOG: FeatureRow[] = [
  // ── games ────────────────────────────────────────────────────────────────
  { key: "casino",        label: "featTitle_casino",     description: "featDesc_casino",     category: "games",   defaultOn: true,  planFeature: "casino" }, // public /kasyno page, no dedicated admin section
  { key: "wheel",         label: "secWheel",             description: "secDesc_wheel",      category: "games",   defaultOn: true,  adminSectionId: "wheel",         planFeature: "wheel" },
  { key: "trivia",        label: "secTrivia",            description: "secDesc_trivia",     category: "games",   defaultOn: true,  adminSectionId: "trivia" },
  { key: "companion",     label: "featTitle_companion",  description: "featDesc_companion",  category: "games",   defaultOn: true }, // public companion, no dedicated admin section

  // ── economy ──────────────────────────────────────────────────────────────
  { key: "collectibles",  label: "secCollectibles",      description: "secDesc_collectibles", category: "economy", defaultOn: true, adminSectionId: "collectibles" },
  { key: "shop",          label: "secShop",              description: "secDesc_shop",       category: "economy", defaultOn: true,  adminSectionId: "shop" },
  { key: "drops",         label: "secDrops",             description: "secDesc_drops",      category: "economy", defaultOn: true,  adminSectionId: "drops" },
  { key: "seasons",       label: "secSeasons",           description: "secDesc_seasons",    category: "economy", defaultOn: true,  adminSectionId: "seasons" },
  { key: "achievements",  label: "secAchievements",      description: "secDesc_achievements", category: "economy", defaultOn: true, adminSectionId: "achievements" },
  { key: "soundrewards",  label: "secSoundrewards",      description: "secDesc_soundrewards", category: "economy", defaultOn: true, adminSectionId: "soundrewards" },
  // NOTE: `penalties` (real-money donation penalties) is deliberately NOT a switchboard feature.
  // It already has its OWN dedicated on/off — `PenaltyConfig.enabled` behind the LEGAL_WARNING in
  // api/admin/penalties — which is the single source of truth for whether it actuates. A second,
  // casual switchboard toggle would DESYNC dangerously: flipping it "off" would hide the panel from
  // the nav while donations kept triggering real-money penalties (actuation reads PenaltyConfig,
  // not this flag). So penalties stays out of the catalog; its admin section is always reachable.

  // ── overlays ─────────────────────────────────────────────────────────────
  { key: "goals",         label: "secGoals",             description: "secDesc_goals",      category: "overlays", defaultOn: true, adminSectionId: "goals",    planFeature: "overlays" },
  { key: "alerts",        label: "secAlerts",            description: "secDesc_alerts",     category: "overlays", defaultOn: true, adminSectionId: "alerts",   planFeature: "overlays" },
  { key: "widgets",       label: "secWidgets",           description: "secDesc_widgets",    category: "overlays", defaultOn: true, adminSectionId: "widgets",  planFeature: "overlays" },
  { key: "scenes",        label: "secScenes",            description: "secDesc_scenes",     category: "overlays", defaultOn: true, adminSectionId: "scenes",   planFeature: "overlays" },
  { key: "subathon",      label: "secSubathon",          description: "secDesc_subathon",   category: "overlays", defaultOn: true, adminSectionId: "subathon", planFeature: "subathon" },

  // ── community ────────────────────────────────────────────────────────────
  { key: "predictions",   label: "secPredictions",       description: "secDesc_predictions", category: "community", defaultOn: true, adminSectionId: "predictions", planFeature: "predictions" },
  { key: "bounties",      label: "secBounties",          description: "secDesc_bounties",   category: "community", defaultOn: true, adminSectionId: "bounties" },
  { key: "polls",         label: "secPolls",             description: "secDesc_polls",      category: "community", defaultOn: true, adminSectionId: "polls" },
  { key: "community",     label: "secCommunity",         description: "secDesc_community",  category: "community", defaultOn: true, adminSectionId: "community" },
  { key: "clanwars",      label: "secClanwars",          description: "secDesc_clanwars",   category: "community", defaultOn: true, adminSectionId: "clanwars" },
  { key: "events",        label: "secEvents",            description: "secDesc_events",     category: "community", defaultOn: true, adminSectionId: "events" },
  { key: "sponsors",      label: "secSponsors",          description: "secDesc_sponsors",   category: "community", defaultOn: true, adminSectionId: "sponsors" },
  { key: "payments",      label: "secPayments",          description: "secDesc_payments",   category: "community", defaultOn: true, adminSectionId: "payments" },
  { key: "tickets",       label: "secTickets",           description: "secDesc_tickets",    category: "community", defaultOn: true, adminSectionId: "tickets" },
  { key: "schedule",      label: "secSchedule",          description: "secDesc_schedule",   category: "community", defaultOn: true, adminSectionId: "schedule" },
  { key: "games",         label: "secGames",             description: "secDesc_games",      category: "community", defaultOn: true, adminSectionId: "games" },

  // ── bot ──────────────────────────────────────────────────────────────────
  { key: "songs",         label: "secSongs",             description: "secDesc_songs",      category: "bot", defaultOn: true, adminSectionId: "songs", planFeature: "song_queue" },
  { key: "chat",          label: "secChat",              description: "secDesc_chat",       category: "bot", defaultOn: true, adminSectionId: "chat" },
  { key: "timers",        label: "secTimers",            description: "secDesc_timers",     category: "bot", defaultOn: true, adminSectionId: "timers" },
  { key: "faq",           label: "secFaq",               description: "secDesc_faq",        category: "bot", defaultOn: true, adminSectionId: "faq" },
  { key: "welcome",       label: "secWelcome",           description: "secDesc_welcome",    category: "bot", defaultOn: true, adminSectionId: "welcome" },

  // ── integrations ─────────────────────────────────────────────────────────
  { key: "twitch",        label: "secTwitch",            description: "secDesc_twitch",     category: "integrations", defaultOn: true, adminSectionId: "twitch" },
  { key: "kick",          label: "secKick",              description: "secDesc_kick",       category: "integrations", defaultOn: true, adminSectionId: "kick" },
  { key: "youtube",       label: "secYoutube",           description: "secDesc_youtube",    category: "integrations", defaultOn: true, adminSectionId: "youtube" },
  { key: "rumble",        label: "secRumble",            description: "secDesc_rumble",     category: "integrations", defaultOn: true, adminSectionId: "rumble" },
  { key: "donations",     label: "secDonations",         description: "secDesc_donations",  category: "integrations", defaultOn: true, adminSectionId: "donations" },
  { key: "donationIntegrations", label: "secDonationIntegrations", description: "featDesc_donationIntegrations", category: "integrations", defaultOn: true, adminSectionId: "donationIntegrations" },
  { key: "recap",         label: "secRecap",             description: "secDesc_recap",      category: "integrations", defaultOn: true, adminSectionId: "recap",        planFeature: "ai" },
  { key: "clipdirector",  label: "secClipDirector",      description: "secDesc_clipdirector", category: "integrations", defaultOn: true, adminSectionId: "clipdirector", planFeature: "ai" },
  { key: "notifications", label: "secNotifications",     description: "secDesc_notifications", category: "integrations", defaultOn: true, adminSectionId: "notifications" },
  { key: "webhooks",      label: "secWebhooks",          description: "secDesc_webhooks",   category: "integrations", defaultOn: true, adminSectionId: "webhooks",     planFeature: "webhooks_out" },

  // ── lighting ─────────────────────────────────────────────────────────────
  { key: "obsrules",      label: "secObsRules",          description: "secDesc_obsrules",   category: "lighting", defaultOn: true, adminSectionId: "obsrules" },
  { key: "goverules",     label: "secGoveeRules",        description: "secDesc_goverules",  category: "lighting", defaultOn: true, adminSectionId: "goverules" },
];

export const FEATURE_CATALOG_BY_KEY: Record<string, FeatureRow> = Object.fromEntries(
  FEATURE_CATALOG.map((r) => [r.key, r]),
);

/** All valid feature keys (for validating an incoming flags blob). */
export const FEATURE_KEYS: ReadonlySet<string> = new Set(FEATURE_CATALOG.map((r) => r.key));

/** Coded defaults: { key: defaultOn } for every catalog row. */
export const DEFAULT_FLAGS: Record<string, boolean> = Object.fromEntries(
  FEATURE_CATALOG.map((r) => [r.key, r.defaultOn]),
);

/**
 * Defensively parse an untrusted `Tenant.featureFlags` JSON blob into a clean map. Accepts ONLY
 * known catalog keys with boolean values and drops everything else (mirrors parseTenantSocials).
 * A junk/legacy/hand-edited blob therefore never blanks a portal — unknown keys are ignored and
 * missing keys fall through to `defaultOn` at read time (resolvedFlag). Returns `{}` on non-objects.
 */
export function parseFeatureFlags(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (FEATURE_KEYS.has(k) && typeof v === "boolean") out[k] = v;
  }
  return out;
}

/** The owner's on/off for a feature: explicit flag if set, else the coded default. */
export function resolvedFlag(flags: Record<string, boolean> | null | undefined, key: string): boolean {
  const explicit = flags?.[key];
  if (typeof explicit === "boolean") return explicit;
  return FEATURE_CATALOG_BY_KEY[key]?.defaultOn ?? false;
}

/**
 * Is a feature actually LIVE on this portal? BOTH axes must allow it:
 *   the owner's flag is on (resolvedFlag) AND the plan unlocks it (if the row has a planFeature).
 * This is the single predicate every gate (admin nav + public surfaces) uses. An owner flag can
 * only narrow within the plan — it never grants a feature the plan lacks.
 */
export function isFeatureLive(flags: Record<string, boolean> | null | undefined, plan: Plan, key: string): boolean {
  const row = FEATURE_CATALOG_BY_KEY[key];
  if (!row) return false;
  if (!resolvedFlag(flags, key)) return false;
  return row.planFeature ? planHasFeature(plan, row.planFeature) : true;
}

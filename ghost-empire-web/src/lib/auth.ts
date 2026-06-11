// src/lib/auth.ts
// Auth.js v5 (next-auth@5). Exports { handlers, auth, signIn, signOut } — `auth()`
// replaces v4's getServerSession(authOptions) everywhere. Secret is read from
// AUTH_SECRET, falling back to NEXTAUTH_SECRET so the existing env (and the
// crypto.ts encryption key derived from it) keep working unchanged.
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import TwitchProvider from "next-auth/providers/twitch";
import DiscordProvider from "next-auth/providers/discord";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { currentTenantId } from "@/lib/tenant";
import type { Adapter } from "next-auth/adapters";
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";
import { cookies } from "next/headers";
import { dispatchAlertSafe } from "@/lib/alerts";
import { displayNick } from "@/lib/utils";
import { LINK_COOKIE_NAME, verifyLinkToken, executeAccountLink } from "@/lib/account-linking";
import { checkAndGrantAchievements } from "@/lib/achievements";
import { awardSeasonXp } from "@/lib/seasons";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth");

// Permanent admins by email — these accounts are ALWAYS admin, regardless of DB
// state (survives a database reset / wipe). The owner's email is hardcoded so the
// account can never be locked out; extra emails can be added via ADMIN_EMAILS
// (comma-separated env var).
const PERMANENT_ADMIN_EMAILS = new Set(
  ["dzierzawskii98.dam@gmail.com", ...(process.env.ADMIN_EMAILS ?? "").split(",")]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);
export function isPermanentAdminEmail(email?: string | null): boolean {
  return !!email && PERMANENT_ADMIN_EMAILS.has(email.toLowerCase());
}

// Custom Kick provider — KICK isn't built into next-auth.
// API docs: https://docs.kick.com/getting-started/kick-developer-api
type KickProfile = {
  id?: number | string;
  user_id?: number | string;
  username?: string;
  name?: string; // Kick's /public/v1/users returns the handle in `name`
  slug?: string; // defensive fallback
  email?: string | null;
  profile_picture?: string | null;
  agreed_to_terms?: boolean;
};

// Shape of provider-specific fields we read off the OAuth `profile` across
// Twitch/Discord/Google/Kick. next-auth's base `Profile` only guarantees a few
// fields, so we narrow to exactly what we touch instead of reaching for `as any`.
type OAuthProfileFields = {
  login?: string; // Twitch
  username?: string; // Discord / Kick
  name?: string; // Kick (handle is in `name`) — read ONLY for Kick so Google's full name is never used
  slug?: string; // Kick fallback
  id?: string | number; // Twitch / Discord / Kick
  sub?: string; // Google / OIDC
};

function KickProvider(opts: OAuthUserConfig<KickProfile>): OAuthConfig<KickProfile> {
  return {
    id: "kick",
    name: "Kick",
    type: "oauth",
    authorization: {
      url: "https://id.kick.com/oauth/authorize",
      params: {
        scope: "user:read",
        response_type: "code",
      },
    },
    // Kick token endpoint requires client_secret in BODY (not Basic auth header)
    client: {
      token_endpoint_auth_method: "client_secret_post",
    },
    token: {
      url: "https://id.kick.com/oauth/token",
      // next-auth's OAuth token-request `context` isn't usefully typed by the lib.
      async request(context: any): Promise<any> {
        const body = new URLSearchParams();
        body.set("grant_type", "authorization_code");
        body.set("code", context.params.code ?? "");
        body.set("redirect_uri", context.provider.callbackUrl);
        body.set("client_id", context.provider.clientId);
        body.set("client_secret", context.provider.clientSecret);
        if (context.checks?.code_verifier) {
          body.set("code_verifier", context.checks.code_verifier);
        }

        const res = await fetch("https://id.kick.com/oauth/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: body.toString(),
        });
        const text = await res.text();
        log.debug("kick token status", { status: res.status, body: text.slice(0, 500) });
        if (!res.ok) {
          throw new Error(`Kick token exchange failed (${res.status}): ${text}`);
        }
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(text); } catch {
          throw new Error(`Kick token endpoint returned non-JSON: ${text.slice(0, 200)}`);
        }
        return { tokens: parsed };
      },
    },
    userinfo: {
      url: "https://api.kick.com/public/v1/users",
      // Kick's userinfo payload is dynamic; the returned shape is normalized below.
      async request({ tokens }: { tokens: { access_token?: string } }): Promise<any> {
        const res = await fetch("https://api.kick.com/public/v1/users", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const text = await res.text();
        log.debug("kick userinfo status", { status: res.status, body: text.slice(0, 500) });
        let data: unknown;
        try { data = JSON.parse(text); } catch { data = {}; }
        const obj = data as { data?: unknown };
        const profile = Array.isArray(obj?.data) ? obj.data[0] : data;
        return profile ?? {};
      },
    },
    checks: ["pkce", "state"],
    profile(profile) {
      const id = profile.user_id?.toString() ?? profile.id?.toString() ?? "";
      return {
        id,
        // Kick returns the handle in `name`; keep username/slug as defensive fallbacks.
        name: profile.name ?? profile.username ?? profile.slug ?? null,
        email: profile.email ?? null,
        image: profile.profile_picture ?? null,
      };
    },
    options: opts,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,

  // Read AUTH_SECRET (v5 default) or fall back to the legacy NEXTAUTH_SECRET so no
  // env change is needed — crypto.ts derives its encryption key from the same value.
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  // Behind the Vercel proxy — trust the forwarded host for callback URL construction.
  trustHost: true,

  providers: [
    // allowDangerousEmailAccountLinking: true on every OAuth provider —
    // safe because all 4 providers verify email ownership themselves.
    // Without this NextAuth blocks login when an existing user has the same
    // email via different provider (OAuthAccountNotLinked error).
    TwitchProvider({
      clientId: process.env.TWITCH_CLIENT_ID!,
      clientSecret: process.env.TWITCH_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: "openid user:read:email",
          claims: JSON.stringify({
            id_token: {
              email: null,
              picture: null,
              preferred_username: null,
            },
          }),
        },
      },
    }),
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: "identify email guilds",
        },
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          // youtube.readonly → lets us call the YouTube Data API at sign-in to
          // fetch the real channel @handle/title (Google's OIDC profile has none).
          // Adding it means existing users re-consent on next Google login.
          scope: "openid email profile https://www.googleapis.com/auth/youtube.readonly",
        },
      },
    }),
    KickProvider({
      clientId: process.env.KICK_CLIENT_ID!,
      clientSecret: process.env.KICK_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  ],

  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.isAdmin =
          Boolean(user.isAdmin) ||
          isPermanentAdminEmail(user.email) ||
          user.discordId === process.env.ADMIN_DISCORD_ID;
        session.user.isModerator = user.isModerator ?? false;
        session.user.isDonator = user.isDonator ?? false;
        session.user.tokens = user.tokens ?? 0;
        session.user.level = user.level ?? 1;
        session.user.username = user.username ?? null;
        // Multi-tenant (SaaS): expose which tenant the signed-in user belongs to.
        session.user.tenantId = user.tenantId ?? null;
      }
      return session;
    },

    async signIn({ user, account, profile }) {
      if (!account) return true;

      // Narrow the loosely-typed OAuth profile once (see OAuthProfileFields).
      const p = (profile ?? {}) as OAuthProfileFields;

      // === LINK INTENT — process BEFORE the normal flow ===
      // If user initiated /api/profile/connections/link/[provider] while logged in,
      // a signed cookie tells us to bind the resulting OAuth Account to the original
      // user instead of letting NextAuth create a duplicate User.
      let linkSuccessRedirect: string | null = null;
      try {
        const cookieStore = await cookies();
        const intentRaw = cookieStore.get(LINK_COOKIE_NAME)?.value;
        const intent = verifyLinkToken(intentRaw);

        if (intent && intent.provider === account.provider) {
          cookieStore.delete(LINK_COOKIE_NAME);

          const result = await executeAccountLink({
            targetUserId: intent.uid,
            orphanUserId: user.id as string,
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          });

          if (result.kind === "conflict") {
            return `/profile?link_error=${result.reason}`;
          }

          // Mutate user.id so adapter.createSession signs in as the original user,
          // not the just-created OAuth orphan (which executeAccountLink may have deleted).
          (user as { id: string }).id = intent.uid;
          linkSuccessRedirect = `/profile?linked=${account.provider}`;
        }
      } catch (e) {
        log.error("error during link intent processing", e);
        // Fall through to normal sign-in
      }

      try {
        // On first sign-in, set username and link platform
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
        });

        // BLOCK BANNED USERS — site-level ban
        if (dbUser?.isBanned) {
          // Expired bans auto-unban themselves
          if (dbUser.bannedUntil && dbUser.bannedUntil < new Date()) {
            await prisma.user.update({
              where: { id: dbUser.id },
              data: { isBanned: false, bannedUntil: null, banReason: null },
            });
            // Continue with login flow
          } else {
            log.warn("blocked login attempt by banned user", { userId: dbUser.id, username: dbUser.username });
            return "/auth/error?error=AccessDenied";
          }
        }

        if (dbUser) {
          // Permanent admin by email — the owner's account is always admin, even
          // after a database reset. Persisted so isAdmin shows everywhere (not just
          // this session).
          if (isPermanentAdminEmail(user.email) && !dbUser.isAdmin) {
            await prisma.user.update({ where: { id: dbUser.id }, data: { isAdmin: true } });
            dbUser.isAdmin = true;
          }

          // Google's OAuth profile (scope: openid email profile) exposes only the
          // user's real full name (user.name) — it has NO handle/nick. Using that
          // as the public username/displayName leaks the first+last name into the
          // ranking. Fall back to the email local-part (the user's self-chosen
          // identifier) instead. Twitch/Discord/Kick all provide a real handle, so
          // they never reach this fallback.
          const isGoogle = account.provider === "google";
          const emailLocal = user.email?.split("@")[0] || undefined;

          // === YouTube handle — Google's OIDC profile has NO channel handle, so we
          // call the YouTube Data API (needs the youtube.readonly scope) to fetch the
          // real channel title + @handle. Fails gracefully if the scope/API isn't
          // available yet (e.g. user hasn't re-consented) so login never breaks.
          let ytHandle: string | undefined; // e.g. "@Gh0s77tt"
          let ytTitle: string | undefined; // e.g. "Gh0s77tt"
          if (isGoogle && account.access_token) {
            try {
              const yt = await fetch(
                "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
                { headers: { Authorization: `Bearer ${account.access_token}` } },
              );
              if (yt.ok) {
                const data = (await yt.json()) as {
                  items?: { snippet?: { title?: string; customUrl?: string } }[];
                };
                const snip = data.items?.[0]?.snippet;
                ytTitle = snip?.title || undefined;
                ytHandle = snip?.customUrl || undefined; // "@handle" for channels that set one
              } else {
                log.warn("youtube channels.list — handle not fetched (scope/API not ready?)", { status: yt.status });
              }
            } catch (e) {
              log.error("youtube channel fetch failed", e);
            }
          }

          // Per-provider PUBLIC handle. NEVER user.name for Google — that is the real
          // first+last name and would leak into the ranking / connected accounts.
          const providerHandle =
            p.login || // Twitch
            (account.provider === "kick"
              ? (p.name || p.username || p.slug) // Kick: handle lives in `name`
              : p.username) || // Discord
            ytHandle || // YouTube @handle (fetched above)
            ytTitle || // YouTube channel title (channel without a set handle)
            undefined;

          // Auto-set username if not set yet
          if (!dbUser.username) {
            const rawName =
              providerHandle ||
              emailLocal || // Google with no channel handle → email local-part, NOT full name
              `ghost_${dbUser.id.slice(-6)}`;

            const slug = rawName
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, "_")
              .slice(0, 32);

            const nick = isGoogle ? (ytTitle || slug) : (user.name ?? slug);
            // username is @unique — on a slug collision, retry with an id-suffixed handle
            // so the account still gets a name instead of silently staying "Anonim".
            try {
              await prisma.user.update({
                where: { id: dbUser.id },
                data: { username: slug, displayName: nick },
              });
            } catch {
              await prisma.user
                .update({
                  where: { id: dbUser.id },
                  data: { username: `${slug.slice(0, 24)}_${dbUser.id.slice(-6)}`, displayName: nick },
                })
                .catch(() => {});
            }
          }

          // Google nick: the OIDC profile has no handle, so keep displayName = the YouTube
          // channel title ("Yukon") whenever we can fetch it — even if a placeholder
          // username already exists. Makes Google users show their channel name instead of
          // an email-prefix or "Anonim". [audit fix]
          if (isGoogle && ytTitle && dbUser.displayName !== ytTitle) {
            await prisma.user
              .update({ where: { id: dbUser.id }, data: { displayName: ytTitle } })
              .catch(() => {});
          }

          // Self-heal: attach legacy accounts (created before tenant assignment) to the
          // current tenant on login, so they reappear in tenant-scoped queries like the
          // ranking/leaderboard (which filters by tenantId). New users are handled in the
          // createUser event; this catches accounts that predate it. [audit fix]
          if (!dbUser.tenantId) {
            const tid = await currentTenantId();
            if (tid) {
              await prisma.user.update({ where: { id: dbUser.id }, data: { tenantId: tid } });
              dbUser.tenantId = tid;
            }
          }

          // Save/update connection record
          const platformId =
            p.id?.toString() ||
            p.sub ||
            account.providerAccountId;

          // A connection's public username MUST be a real platform handle. We do
          // NOT fall back to the email local-part here (a Google login without a
          // YouTube handle) — that would surface the user's email prefix as a
          // "@handle" in the public profile / connected-accounts list. Empty →
          // the UI shows a neutral "połączono" until a real handle is fetched
          // (e.g. after re-login with the youtube.readonly scope).
          const platformUsername = providerHandle || "";

          // Connection display name: Google → YouTube channel title (never the full
          // name); other providers → their platform display name.
          const connectionDisplayName = isGoogle
            ? (ytTitle || platformUsername)
            : (user.name ?? "");

          // Map OAuth provider id → semantic platform name we use in DB
          //   google → youtube (because we want one "YouTube" connection per user)
          const platformName =
            account.provider === "google" ? "youtube" : account.provider;

          await prisma.connection.upsert({
            where: {
              userId_platform: {
                userId: dbUser.id,
                platform: platformName,
              },
            },
            update: {
              platformId,
              username: platformUsername,
              displayName: connectionDisplayName,
              avatar: user.image ?? "",
              accessToken: encryptSecret(account.access_token),
              refreshToken: encryptSecret(account.refresh_token),
              tokenExpiry: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
              updatedAt: new Date(),
            },
            create: {
              userId: dbUser.id,
              platform: platformName,
              platformId,
              username: platformUsername,
              displayName: connectionDisplayName,
              avatar: user.image ?? "",
              accessToken: encryptSecret(account.access_token),
              refreshToken: encryptSecret(account.refresh_token),
              tokenExpiry: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
            },
          });

          // Achievement check — platforms_linked (fires after linking a new OAuth provider)
          await checkAndGrantAchievements({ userId: dbUser.id, triggerType: "platforms_linked" });

          // Grant first_login achievement if not already earned
          const alreadyGranted = await prisma.userAchievement.findFirst({
            where: { userId: dbUser.id, achievement: { code: "first_login" } },
          });

          if (!alreadyGranted) {
            const achievement = await prisma.achievement.findFirst({
              where: { code: "first_login", ...(dbUser.tenantId ? { tenantId: dbUser.tenantId } : {}) },
            });
            if (achievement) {
              await prisma.userAchievement.create({
                data: { userId: dbUser.id, achievementId: achievement.id },
              });
            }
          }

          // For Discord logins: always set User.discordId (bot uses it to map awards)
          if (account.provider === "discord") {
            const shouldBeAdmin = platformId === process.env.ADMIN_DISCORD_ID;
            const dataPatch: Record<string, unknown> = {};
            if (dbUser.discordId !== platformId) dataPatch.discordId = platformId;
            if (!dbUser.discordUsername && platformUsername) {
              dataPatch.discordUsername = platformUsername;
            }
            if (shouldBeAdmin && !dbUser.isAdmin) dataPatch.isAdmin = true;
            if (Object.keys(dataPatch).length > 0) {
              await prisma.user.update({
                where: { id: dbUser.id },
                data: dataPatch,
              });
            }
          }
        }
      } catch (error) {
        log.error("SignIn callback error", error);
        // Don't block login on non-critical errors
      }

      return linkSuccessRedirect ?? true;
    },
  },

  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },

  events: {
    async createUser({ user }) {
      // v5 types User.id as optional — bail if missing (can't grant without it).
      if (!user.id) return;
      // New user created — grant 500 welcome tokens
      try {
        // Attach the new account to the current tenant (multi-tenant SaaS) alongside the
        // welcome bonus. Without a tenantId the user is invisible in tenant-scoped queries
        // like the ranking/leaderboard. Single-tenant → default tenant; multi-tenant →
        // the signup host's tenant. [audit fix]
        const tenantId = await currentTenantId();
        // Public nick at signup so a new account is never shown as "Anonim". user.name for
        // a Google login is the real full name — only use it as a nick when it's a single
        // token (a real handle); otherwise fall back to the email local-part. signIn()
        // later upgrades Google users to their YouTube channel title once available.
        const safeNick =
          (user.name && !/\s/.test(user.name) ? user.name : undefined) ||
          user.email?.split("@")[0] ||
          `ghost_${user.id.slice(-6)}`;
        // Tenant-owner bootstrap (Phase 6 onboarding): the FIRST account signing
        // in on a tenant's subdomain with the owner's email becomes that portal's
        // admin. Tenant-scoped by definition — isWrongTenant (#418) keeps this
        // admin out of every other tenant's panel.
        let ownerAdmin = false;
        if (tenantId && user.email) {
          try {
            const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { ownerEmail: true } });
            ownerAdmin = !!t?.ownerEmail && t.ownerEmail.toLowerCase() === user.email.toLowerCase();
          } catch { /* tenant lookup is best-effort */ }
        }
        await prisma.user.update({
          where: { id: user.id },
          data: { tokens: 500, totalEarned: 500, displayName: safeNick, ...(tenantId ? { tenantId } : {}), ...(ownerAdmin ? { isAdmin: true } : {}) },
        });

        await prisma.transaction.create({
          data: {
            userId: user.id,
            type: "earn",
            amount: 500,
            reason: "welcome_bonus",
          },
        });

        // Stream alert — viewer joined Ghost Empire
        await dispatchAlertSafe({
          type: "welcome",
          title: "👻 Nowy duch dołączył!",
          message: "wszedł do Ghost Empire",
          icon: "👻",
          actorName: displayNick(user.name, user.email?.split("@")[0]),
          actorImage: user.image ?? undefined,
          amount: 500,
          amountLabel: "GT",
        }, tenantId);

        // Season XP welcome bump
        await awardSeasonXp(user.id, "welcome");
      } catch (e) {
        log.error("Error granting welcome bonus", e);
      }
    },

    // Fires ONCE, on a new account's FIRST OAuth link, AFTER createUser — unlike the
    // signIn callback, the user row already exists here AND we have the OAuth token. This
    // completes the setup signIn otherwise only does on the user's SECOND login (signIn
    // runs before the user is persisted → its `if (dbUser)` block is skipped on login #1):
    // the public @username, the Google→YouTube channel nick (e.g. "Yukon"), and
    // permanent-admin-by-email. Fully guarded — never blocks login. [audit fix]
    async linkAccount({ user, account }) {
      try {
        const id = user.id;
        if (!id) return;
        const isGoogle = account.provider === "google";
        let handle: string | undefined;   // → @username
        let display: string | undefined;  // → displayName (never the Google real name)
        if (isGoogle && account.access_token) {
          try {
            const yt = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${account.access_token}` } });
            if (yt.ok) {
              const data = (await yt.json()) as { items?: { snippet?: { title?: string; customUrl?: string } }[] };
              const snip = data.items?.[0]?.snippet;
              display = snip?.title || undefined;
              handle = snip?.customUrl || snip?.title || undefined;
            }
          } catch { /* YouTube API not ready (scope not granted) — signIn upgrades it on next login */ }
        } else if (!isGoogle) {
          display = user.name || undefined; // Twitch/Kick/Discord: user.name IS the public handle
          handle = user.name || undefined;
        }
        // permanent-admin-by-email + Google nick upgrade (no unique cols → one safe update)
        const patch: Record<string, unknown> = {};
        if (isPermanentAdminEmail(user.email)) patch.isAdmin = true;
        if (isGoogle && display) patch.displayName = display;
        if (Object.keys(patch).length > 0) {
          await prisma.user.update({ where: { id }, data: patch }).catch((e) => log.error("linkAccount patch failed", e));
        }
        // public @username (UNIQUE → its own collision-safe update so a clash can't lose the patch)
        if (handle) {
          const dbUser = await prisma.user.findUnique({ where: { id }, select: { username: true } });
          if (dbUser && !dbUser.username) {
            const slug = handle.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32) || `ghost_${id.slice(-6)}`;
            await prisma.user.update({ where: { id }, data: { username: slug } })
              .catch(async () => { await prisma.user.update({ where: { id }, data: { username: `${slug.slice(0, 26)}_${id.slice(-4)}` } }).catch(() => {}); });
          }
        }
      } catch (e) {
        log.error("linkAccount setup error", e);
      }
    },
  },

  debug: process.env.NODE_ENV === "development",

  logger: {
    // v5 logger: error receives an Error object directly (v4 passed code+metadata).
    error(error) {
      const e = error as Error & { cause?: unknown };
      log.error("next-auth error", undefined, {
        name: e?.name,
        message: e?.message,
        stack: e?.stack?.split("\n").slice(0, 5).join(" | "),
        cause: e?.cause,
      });
    },
    warn(code) {
      log.warn("next-auth warn", { code });
    },
    debug(message, metadata) {
      if (process.env.NODE_ENV === "development") {
        log.debug(`next-auth ${message}`, { metadata });
      }
    },
  },
});

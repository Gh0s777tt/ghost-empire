// src/lib/auth.ts
import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import TwitchProvider from "next-auth/providers/twitch";
import DiscordProvider from "next-auth/providers/discord";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import type { Adapter } from "next-auth/adapters";
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers/oauth";
import { cookies } from "next/headers";
import { dispatchAlertSafe } from "@/lib/alerts";
import { LINK_COOKIE_NAME, verifyLinkToken, executeAccountLink } from "@/lib/account-linking";
import { checkAndGrantAchievements } from "@/lib/achievements";
import { awardSeasonXp } from "@/lib/seasons";

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
        console.log(`[kick] token status=${res.status} body=${text.slice(0, 500)}`);
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
        console.log(`[kick] userinfo status=${res.status} body=${text.slice(0, 500)}`);
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

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,

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
            orphanUserId: user.id,
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
        console.error("[link] error during link intent processing:", e);
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
            console.warn(`[auth] blocked login attempt by banned user ${dbUser.id} (${dbUser.username})`);
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
                console.warn(`[youtube] channels.list ${yt.status} — handle not fetched (scope/API not ready?)`);
              }
            } catch (e) {
              console.error("[youtube] channel fetch failed:", e);
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

            await prisma.user.update({
              where: { id: dbUser.id },
              data: {
                username: slug,
                // For Google, user.name is the real full name — never expose it.
                // Prefer the YouTube channel title, else the derived handle (slug).
                displayName: isGoogle ? (ytTitle || slug) : (user.name ?? slug),
              },
            });
          }

          // Save/update connection record
          const platformId =
            p.id?.toString() ||
            p.sub ||
            account.providerAccountId;

          const platformUsername =
            providerHandle ||
            emailLocal ||   // email local-part as last resort — NEVER user.name (full name, e.g. Google = leaks real name)
            "";

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
              accessToken: account.access_token,
              refreshToken: account.refresh_token,
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
              accessToken: account.access_token,
              refreshToken: account.refresh_token,
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
            const achievement = await prisma.achievement.findUnique({
              where: { code: "first_login" },
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
        console.error("SignIn callback error:", error);
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
      // New user created — grant 500 welcome tokens
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { tokens: 500, totalEarned: 500 },
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
          actorName: user.name ?? "Anon",
          actorImage: user.image ?? undefined,
          amount: 500,
          amountLabel: "GT",
        });

        // Season XP welcome bump
        await awardSeasonXp(user.id, "welcome");
      } catch (e) {
        console.error("Error granting welcome bonus:", e);
      }
    },
  },

  debug: process.env.NODE_ENV === "development",

  logger: {
    error(code, metadata) {
      // Extract Error properties (non-enumerable so JSON.stringify misses them)
      const err = (metadata as { error?: unknown })?.error;
      let errDetail: Record<string, unknown> = {};
      if (err instanceof Error) {
        errDetail = {
          name: err.name,
          message: err.message,
          stack: err.stack?.split("\n").slice(0, 5).join(" | "),
          cause: err.cause,
        };
      } else if (typeof err === "object" && err !== null) {
        errDetail = err as Record<string, unknown>;
      }
      console.error(
        `[next-auth][error] ${code}`,
        JSON.stringify({ ...metadata, errorDetail: errDetail }, null, 2),
      );
    },
    warn(code) {
      console.warn(`[next-auth][warn] ${code}`);
    },
    debug(code, metadata) {
      if (process.env.NODE_ENV === "development") {
        console.log(`[next-auth][debug] ${code}`, metadata);
      }
    },
  },
};

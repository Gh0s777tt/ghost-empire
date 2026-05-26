// src/lib/auth.ts
import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import TwitchProvider from "next-auth/providers/twitch";
import DiscordProvider from "next-auth/providers/discord";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import type { Adapter } from "next-auth/adapters";
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers/oauth";
import { dispatchAlertSafe } from "@/lib/alerts";

// Custom Kick provider — KICK isn't built into next-auth.
// API docs: https://docs.kick.com/getting-started/kick-developer-api
type KickProfile = {
  id?: number | string;
  user_id?: number | string;
  username?: string;
  email?: string | null;
  profile_picture?: string | null;
  agreed_to_terms?: boolean;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        name: profile.username ?? null,
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
          scope: "openid email profile",
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
          (user as any).isAdmin ??
          (user as any).discordId === process.env.ADMIN_DISCORD_ID;
        session.user.isModerator = (user as any).isModerator ?? false;
        session.user.isDonator = (user as any).isDonator ?? false;
        session.user.tokens = (user as any).tokens ?? 0;
        session.user.level = (user as any).level ?? 1;
        session.user.username = (user as any).username ?? null;
      }
      return session;
    },

    async signIn({ user, account, profile }) {
      if (!account) return true;

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
          // Auto-set username if not set yet
          if (!dbUser.username) {
            const rawName =
              (profile as any)?.login || // Twitch uses login
              (profile as any)?.username ||
              user.name ||
              `ghost_${dbUser.id.slice(-6)}`;

            const slug = rawName
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, "_")
              .slice(0, 32);

            await prisma.user.update({
              where: { id: dbUser.id },
              data: {
                username: slug,
                displayName: user.name ?? slug,
              },
            });
          }

          // Save/update connection record
          const platformId =
            (profile as any)?.id?.toString() ||
            (profile as any)?.sub ||
            account.providerAccountId;

          const platformUsername =
            (profile as any)?.login ||
            (profile as any)?.username ||
            user.name ||
            "";

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
              displayName: user.name ?? "",
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
              displayName: user.name ?? "",
              avatar: user.image ?? "",
              accessToken: account.access_token,
              refreshToken: account.refresh_token,
              tokenExpiry: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
            },
          });

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

      return true;
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

// src/lib/streamlabs.ts
// Streamlabs API integration — OAuth + donation polling + auto-matching.
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { dispatchAlertSafe } from "@/lib/alerts";
import { incrementGoals } from "@/lib/stream-goals";
import { extendSubathon } from "@/lib/subathon";
import { checkAndGrantAchievements } from "@/lib/achievements";
import { httpFetch } from "@/lib/http";
import { awardSeasonXp } from "@/lib/seasons";
import { plnFromCurrency } from "@/lib/economy";
import { getStreamlabsConnection } from "@/lib/platform-tokens";

const STREAMLABS_OAUTH_AUTHORIZE = "https://streamlabs.com/api/v2.0/authorize";
const STREAMLABS_OAUTH_TOKEN = "https://streamlabs.com/api/v2.0/token";
const STREAMLABS_DONATIONS = "https://streamlabs.com/api/v2.0/donations";
const STREAMLABS_USER = "https://streamlabs.com/api/v2.0/user";

const REDIRECT_URI = (process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app")
  + "/api/auth/streamlabs/callback";

export const SCOPES = "donations.read socket.token";

export function getAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.STREAMLABS_CLIENT_ID ?? "",
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    state,
  });
  return `${STREAMLABS_OAUTH_AUTHORIZE}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.STREAMLABS_CLIENT_ID ?? "",
    client_secret: process.env.STREAMLABS_CLIENT_SECRET ?? "",
    redirect_uri: REDIRECT_URI,
    code,
  });
  const res = await httpFetch(STREAMLABS_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Streamlabs token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

type StreamlabsUser = {
  streamlabs?: { id: number; display_name: string };
  twitch?: { display_name: string };
};

export async function fetchUserInfo(accessToken: string): Promise<StreamlabsUser> {
  const res = await httpFetch(`${STREAMLABS_USER}?access_token=${accessToken}`);
  if (!res.ok) {
    throw new Error(`Streamlabs user info fetch failed (${res.status})`);
  }
  return res.json();
}

type StreamlabsDonation = {
  donation_id: number;
  created_at: number;       // unix timestamp
  currency: string;
  amount: string | number;  // sometimes string
  name: string;
  message: string | null;
  email?: string;
  _id?: string;
};

export async function fetchDonations(opts: {
  accessToken: string;
  afterDonationId?: string;
  limit?: number;
}): Promise<StreamlabsDonation[]> {
  const params = new URLSearchParams({
    access_token: opts.accessToken,
    limit: String(opts.limit ?? 50),
    verified: "1", // only verified payments
  });
  if (opts.afterDonationId) {
    params.set("after", opts.afterDonationId);
  }
  const res = await httpFetch(`${STREAMLABS_DONATIONS}?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Streamlabs donations fetch failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return Array.isArray(data?.data) ? data.data : [];
}

/**
 * Try to match a donation to a Ghost Empire user.
 * Strategy:
 *  1. Exact match donor_name → User.username (case-insensitive)
 *  2. Match first @nick in message → User.username
 *  3. Return null (admin can match manually later)
 */
export async function matchDonationToUser(
  donorName: string,
  message: string | null,
  tenantId: string | null,
): Promise<{ userId: string; matchType: string } | null> {
  // Scope the username match to the donation's portal (+ legacy null-tenant users for
  // back-compat) so a donation polled for portal A can't credit a portal-B user sharing
  // a username (#audit3 HIGH-2). NOTE: this is still donor-supplied-name matching, so
  // within a tenant it can mis-attribute — kept as the streamer's accepted auto-match,
  // with manual reconciliation for the rest (/api/admin/donations).
  const tw = tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {};
  // 1. Exact donor name match
  if (donorName) {
    const cleaned = donorName.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: { username: { equals: cleaned, mode: "insensitive" }, ...tw },
      select: { id: true },
    });
    if (user) return { userId: user.id, matchType: "auto_name" };
  }

  // 2. @mention in message
  if (message) {
    const mention = message.match(/@([a-z0-9_]{3,32})/i);
    if (mention) {
      const username = mention[1].toLowerCase();
      const user = await prisma.user.findFirst({
        where: { username: { equals: username, mode: "insensitive" }, ...tw },
        select: { id: true },
      });
      if (user) return { userId: user.id, matchType: "auto_mention" };
    }
  }

  return null;
}

/** Poll Streamlabs for new donations, store them, auto-match where possible. */
export async function pollAndProcessDonations(): Promise<{
  ok: boolean;
  fetched: number;
  matched: number;
  unmatched: number;
  error?: string;
}> {
  const conn = await getStreamlabsConnection();
  if (!conn) return { ok: false, fetched: 0, matched: 0, unmatched: 0, error: "not_connected" };

  let donations: StreamlabsDonation[];
  try {
    donations = await fetchDonations({
      accessToken: decryptSecret(conn.accessToken) ?? "",
      afterDonationId: conn.lastSeenDonationId ?? undefined,
      limit: 50,
    });
  } catch (e) {
    return {
      ok: false,
      fetched: 0,
      matched: 0,
      unmatched: 0,
      error: e instanceof Error ? e.message : "fetch_failed",
    };
  }

  let matched = 0;
  let unmatched = 0;
  const GT_PER_PLN = parseInt(process.env.DONATION_GT_PER_PLN ?? "100", 10);

  for (const d of donations) {
    // Skip if already processed
    const exists = await prisma.donation.findUnique({ where: { externalId: String(d.donation_id) } });
    if (exists) continue;

    const amountFloat = Number(d.amount);
    if (!Number.isFinite(amountFloat) || amountFloat <= 0) continue;
    const amountGrosze = Math.round(amountFloat * 100);

    const match = await matchDonationToUser(d.name, d.message, conn.tenantId);

    if (match) {
      const tokensGranted = Math.round(amountFloat * GT_PER_PLN);
      await prisma.$transaction([
        prisma.donation.create({
          data: {
            tenantId: conn.tenantId, // Batch B: scope to the connection's portal
            externalId: String(d.donation_id),
            source: "streamlabs",
            donorName: d.name.slice(0, 200),
            message: d.message?.slice(0, 2000) ?? null,
            amountGrosze,
            currency: d.currency,
            donatedAt: new Date(d.created_at * 1000),
            userId: match.userId,
            matchedAt: new Date(),
            matchType: match.matchType,
            tokensGranted,
          },
        }),
        prisma.user.update({
          where: { id: match.userId },
          data: {
            isDonator: true,
            totalDonated: { increment: amountGrosze },
            tokens: { increment: tokensGranted },
            totalEarned: { increment: tokensGranted },
          },
        }),
        prisma.transaction.create({
          data: {
            userId: match.userId,
            type: "earn",
            amount: tokensGranted,
            reason: `donation:streamlabs:${d.donation_id}`,
            status: "completed",
            note: d.message?.slice(0, 500) ?? null,
          },
        }),
        prisma.notification.create({
          data: {
            userId: match.userId,
            type: "system",
            title: `Dzięki za donację ${amountFloat.toFixed(2)} ${d.currency}!`,
            message: `Otrzymałeś ${tokensGranted.toLocaleString("pl-PL")} GT. Jesteś teraz Donatorem.`,
            icon: "❤️",
            link: "/profile",
          },
        }),
      ]);

      // Fetch matched user for actor info
      const matchedUser = await prisma.user.findUnique({
        where: { id: match.userId },
        select: { username: true, displayName: true, image: true },
      });
      await dispatchAlertSafe({
        type: "donation",
        title: "❤️ Donacja!",
        message: d.message
          ? `wpłacił z wiadomością: ${d.message.slice(0, 80)}`
          : "wsparł streamera",
        icon: "❤️",
        actorName: matchedUser?.displayName || matchedUser?.username || d.name,
        actorImage: matchedUser?.image ?? undefined,
        amount: Math.round(amountFloat * 100) / 100,
        amountLabel: d.currency,
      }, conn.tenantId);

      // Achievements — donation count + cumulative PLN
      await checkAndGrantAchievements({ userId: match.userId, triggerType: "donations_count" });
      await checkAndGrantAchievements({ userId: match.userId, triggerType: "donations_amount_pln" });
      // Season XP proportional to PLN amount
      await awardSeasonXp(match.userId, "donation_per_pln", amountFloat);

      matched++;
    } else {
      // Unmatched — store for admin reconciliation
      await prisma.donation.create({
        data: {
          tenantId: conn.tenantId, // Batch B: scope to the connection's portal
          externalId: String(d.donation_id),
          source: "streamlabs",
          donorName: d.name.slice(0, 200),
          message: d.message?.slice(0, 2000) ?? null,
          amountGrosze,
          currency: d.currency,
          donatedAt: new Date(d.created_at * 1000),
        },
      });

      // Still alert — streamer wants to see EVERY donation on overlay even if donor isn't linked
      await dispatchAlertSafe({
        type: "donation",
        title: "❤️ Donacja!",
        message: d.message
          ? `wpłacił z wiadomością: ${d.message.slice(0, 80)}`
          : "wsparł streamera",
        icon: "❤️",
        actorName: d.name,
        amount: Math.round(amountFloat * 100) / 100,
        amountLabel: d.currency,
      }, conn.tenantId);

      unmatched++;
    }

    // Bump donations_pln goal — applies to BOTH matched and unmatched donations.
    // Currency conversion shared with YouTube super chats (see economy.ts).
    const plnAmount = plnFromCurrency(amountFloat, d.currency);
    await incrementGoals("donations_pln", Math.floor(plnAmount), conn.tenantId);
    void extendSubathon({ pln: Math.floor(plnAmount) }, conn.tenantId).catch(() => {});
  }

  // Update lastSeenDonationId to most recent (donations[0] is newest by default)
  const newest = donations[0]?.donation_id;
  await prisma.streamlabsConnection.update({
    where: { id: conn.id },
    data: {
      lastPolledAt: new Date(),
      ...(newest ? { lastSeenDonationId: String(newest) } : {}),
    },
  });

  return { ok: true, fetched: donations.length, matched, unmatched };
}

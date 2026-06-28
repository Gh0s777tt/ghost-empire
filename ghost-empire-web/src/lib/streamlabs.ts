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
import { extractDonationCode } from "@/lib/donation-code";
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
 * Try to match a donation to a Ghost Empire user — VERIFIED only (#audit3).
 * The only auto-credit path is a personal donation code (shown on the user's profile)
 * present in the donation message. Donor-name / @mention auto-matching was REMOVED — it
 * let a payer aim a donation's GT at any account they named. Codeless donations return
 * null and land in the manual admin reconciliation queue (/api/admin/donations).
 */
export async function matchDonationToUser(
  message: string | null,
  tenantId: string | null,
): Promise<{ userId: string; matchType: string } | null> {
  const code = extractDonationCode(message);
  if (!code) return null;
  // Scope to the donation's portal (+ legacy null-tenant) for cross-tenant safety; the
  // code is globally unique, so this resolves at most one user.
  const tw = tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {};
  const user = await prisma.user.findFirst({
    where: { donationCode: code, ...tw },
    select: { id: true },
  });
  return user ? { userId: user.id, matchType: "code" } : null;
}

/** Poll Streamlabs for new donations, store them, auto-match where possible. */
export async function pollAndProcessDonations(tenantId?: string | null): Promise<{
  ok: boolean;
  fetched: number;
  matched: number;
  unmatched: number;
  error?: string;
}> {
  // Per-portal: resolve THIS tenant's Streamlabs connection (the cron loops every portal).
  // Downstream writes scope to conn.tenantId, so a sub-tenant's donations stay on its board.
  const conn = await getStreamlabsConnection(tenantId);
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
  // Cap a single donation's GT at ~100k PLN-equivalent so a malformed/huge upstream
  // amount (or a high-nominal currency) can't mint an absurd amount into the economy.
  const MAX_DONATION_GT = GT_PER_PLN * 100_000;

  // Idempotency: ONE batched read of which donation_ids are already stored, instead of a
  // findUnique per donation against the small (max:3) pool (#748). externalId is @unique.
  const processed = new Set(
    (
      await prisma.donation.findMany({
        where: { externalId: { in: donations.map((d) => String(d.donation_id)) } },
        select: { externalId: true },
      })
    ).map((row) => row.externalId),
  );

  for (const d of donations) {
    const externalId = String(d.donation_id);
    // Skip if already processed
    if (processed.has(externalId)) continue;

    const amountFloat = Number(d.amount);
    if (!Number.isFinite(amountFloat) || amountFloat <= 0) continue;
    const amountGrosze = Math.round(amountFloat * 100);

    const match = await matchDonationToUser(d.message, conn.tenantId);

    if (match) {
      // Currency-aware (convert to PLN first) + capped, so non-PLN or malformed amounts
      // don't mint GT 1:1 as if PLN. #audit3 MED-2
      const tokensGranted = Math.min(Math.round(plnFromCurrency(amountFloat, d.currency) * GT_PER_PLN), MAX_DONATION_GT);
      await prisma.$transaction([
        prisma.donation.create({
          data: {
            tenantId: conn.tenantId, // Batch B: scope to the connection's portal
            externalId,
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

    // Both branches above persisted the donation row — remember it so a duplicate id
    // within the same batch can't double-insert (parity with the old per-row check).
    processed.add(externalId);

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

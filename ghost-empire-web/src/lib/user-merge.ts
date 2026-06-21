// src/lib/user-merge.ts
// Admin tool — merge duplicate user accounts that exist from before the
// /api/profile/connections/link flow was added. Destructive: secondary user
// is deleted after their data is moved to primary.
import { prisma } from "@/lib/prisma";

// =====================================================
// Detection — find groups of users likely to be duplicates
// =====================================================

/**
 * Normalize a username for duplicate detection: lowercase, strip everything but a-z0-9.
 * "_Gh0s77tt" and "gh0s77tt" → "gh0s77tt". Empty when nothing alphanumeric remains.
 * Used to catch the same person on a provider that gives no email/discordId (e.g. Twitch),
 * which the email/discord/account-id signals miss. Pure → unit-tested.
 */
export function normalizeUsernameForDedup(username: string | null | undefined): string {
  return (username ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type DuplicateGroup = {
  /** Why these users are flagged as candidates */
  reason: "shared_platform_id" | "shared_email" | "shared_discord_id" | "similar_username";
  /** Human-readable description of the match */
  matchOn: string;
  users: Array<{
    id: string;
    username: string | null;
    displayName: string | null;
    email: string | null;
    image: string | null;
    discordId: string | null;
    tokens: number;
    totalEarned: number;
    totalDonated: number;
    level: number;
    isAdmin: boolean;
    isModerator: boolean;
    isBanned: boolean;
    createdAt: string;
    accountsCount: number;
    connectionsCount: number;
    transactionsCount: number;
    donationsCount: number;
    achievementsCount: number;
    connections: Array<{ platform: string; username: string }>;
  }>;
};

async function summarizeUsers(userIds: string[]) {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    include: {
      _count: {
        select: {
          accounts: true,
          connections: true,
          transactions: true,
          donations: true,
          userAchievements: true,
        },
      },
      connections: { select: { platform: true, username: true } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    image: u.image,
    discordId: u.discordId,
    tokens: u.tokens,
    totalEarned: u.totalEarned,
    totalDonated: u.totalDonated,
    level: u.level,
    isAdmin: u.isAdmin,
    isModerator: u.isModerator,
    isBanned: u.isBanned,
    createdAt: u.createdAt.toISOString(),
    accountsCount: u._count.accounts,
    connectionsCount: u._count.connections,
    transactionsCount: u._count.transactions,
    donationsCount: u._count.donations,
    achievementsCount: u._count.userAchievements,
    connections: u.connections.map((c) => ({ platform: c.platform, username: c.username })),
  }));
}

export async function detectDuplicates(maxGroups = 30): Promise<DuplicateGroup[]> {
  const groups: DuplicateGroup[] = [];

  // 1. Same platformId on Connection → STRONG signal (same Twitch/Kick/YouTube user on multiple GE accounts)
  //    There's a unique constraint on (platform, platformId) — so this shouldn't happen normally,
  //    but if the link flow wasn't used and someone signed up twice on the same platform with
  //    different emails, we'd see it via different platformId. So instead — look for shared
  //    Account.providerAccountId across users (which CAN have duplicates if linking went wrong).
  const dupAccounts = await prisma.account.groupBy({
    by: ["provider", "providerAccountId"],
    _count: { userId: true },
    having: { userId: { _count: { gt: 1 } } },
    orderBy: { _count: { userId: "desc" } },
    take: maxGroups,
  });
  for (const dup of dupAccounts) {
    const accs = await prisma.account.findMany({
      where: { provider: dup.provider, providerAccountId: dup.providerAccountId },
      select: { userId: true },
    });
    const userIds = [...new Set(accs.map((a) => a.userId))];
    if (userIds.length < 2) continue;
    const users = await summarizeUsers(userIds);
    groups.push({
      reason: "shared_platform_id",
      matchOn: `${dup.provider} account ID współdzielony`,
      users,
    });
  }

  // 2. Same email across multiple users (case-insensitive)
  const dupEmails = await prisma.$queryRaw<Array<{ email: string; count: bigint }>>`
    SELECT LOWER(email) as email, COUNT(*)::bigint as count
    FROM users
    WHERE email IS NOT NULL
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
    LIMIT ${maxGroups}
  `;
  for (const dup of dupEmails) {
    const matching = await prisma.user.findMany({
      where: { email: { equals: dup.email, mode: "insensitive" } },
      select: { id: true },
    });
    const userIds = matching.map((m) => m.id);
    if (userIds.length < 2) continue;
    // Skip if already covered by a stronger signal
    if (groups.some((g) => g.users.every((u) => userIds.includes(u.id)))) continue;
    const users = await summarizeUsers(userIds);
    groups.push({
      reason: "shared_email",
      matchOn: `email: ${dup.email}`,
      users,
    });
  }

  // 3. Same discordId across multiple users
  const dupDiscord = await prisma.$queryRaw<Array<{ discord_id: string; count: bigint }>>`
    SELECT "discordId" as discord_id, COUNT(*)::bigint as count
    FROM users
    WHERE "discordId" IS NOT NULL
    GROUP BY "discordId"
    HAVING COUNT(*) > 1
    LIMIT ${maxGroups}
  `;
  for (const dup of dupDiscord) {
    const matching = await prisma.user.findMany({
      where: { discordId: dup.discord_id },
      select: { id: true },
    });
    const userIds = matching.map((m) => m.id);
    if (userIds.length < 2) continue;
    if (groups.some((g) => g.users.every((u) => userIds.includes(u.id)))) continue;
    const users = await summarizeUsers(userIds);
    groups.push({
      reason: "shared_discord_id",
      matchOn: `Discord ID: ${dup.discord_id}`,
      users,
    });
  }

  // 4. Same NORMALIZED username (lowercase, strip non-alphanumeric) — catches the same person
  //    on a provider that supplies no email/discordId (e.g. a Twitch login "gh0s77tt" vs an
  //    existing "_gh0s77tt"), which rules 1-3 miss. WEAKER signal → surfaced for REVIEW only;
  //    the admin still previews + types-to-confirm before any merge runs.
  const withUsernames = await prisma.user.findMany({
    where: { username: { not: null } },
    select: { id: true, username: true },
  });
  const byNorm = new Map<string, string[]>();
  for (const u of withUsernames) {
    const norm = normalizeUsernameForDedup(u.username);
    if (!norm) continue;
    const arr = byNorm.get(norm);
    if (arr) arr.push(u.id);
    else byNorm.set(norm, [u.id]);
  }
  for (const [norm, userIds] of byNorm) {
    if (userIds.length < 2) continue;
    // Skip if a stronger signal (account-id / email / discord) already grouped them.
    if (groups.some((g) => g.users.every((u) => userIds.includes(u.id)))) continue;
    const users = await summarizeUsers(userIds);
    groups.push({ reason: "similar_username", matchOn: `username ≈ ${norm}`, users });
    if (groups.length >= maxGroups) break;
  }

  return groups.slice(0, maxGroups);
}

// =====================================================
// Preview — show admin what the merge will move
// =====================================================

export type MergePreview = {
  primary: { id: string; username: string | null; tokens: number };
  secondary: { id: string; username: string | null; tokens: number };
  willMove: {
    tokens: number;
    transactions: number;
    donations: number;
    notifications: number;
    eventEntries: number;
    raffleTickets: number;
    dropClaims: number;
    achievements: number;
    socialLinks: number;
    userTasks: number;
    accounts: number;
    connections: number;
  };
  conflicts: {
    accountProviders: string[];      // providers primary already has
    connectionPlatforms: string[];    // platforms primary already has
    achievements: number;              // achievements secondary has that primary also has
    socialLinks: number;
    eventEntries: number;
    dropClaims: number;
  };
  finalPrimaryTokens: number;
};

export async function previewMerge(primaryId: string, secondaryId: string): Promise<MergePreview> {
  if (primaryId === secondaryId) throw new Error("primary === secondary");

  const [primary, secondary] = await Promise.all([
    prisma.user.findUnique({ where: { id: primaryId } }),
    prisma.user.findUnique({ where: { id: secondaryId } }),
  ]);
  if (!primary || !secondary) throw new Error("user not found");

  const [
    secAccounts, secConnections, secTransactions, secDonations,
    secNotifications, secEventEntries, secRaffleTickets,
    secUserAchievements, secSocialLinks, secUserTasks, secDropClaims,
    primAccounts, primConnections,
    primAchievementIds, primSocialLinkPlatforms, primEventIds, primDropIds,
  ] = await Promise.all([
    prisma.account.findMany({ where: { userId: secondaryId }, select: { provider: true } }),
    prisma.connection.findMany({ where: { userId: secondaryId }, select: { platform: true } }),
    prisma.transaction.count({ where: { userId: secondaryId } }),
    prisma.donation.count({ where: { userId: secondaryId } }),
    prisma.notification.count({ where: { userId: secondaryId } }),
    prisma.eventEntry.findMany({ where: { userId: secondaryId }, select: { eventId: true } }),
    prisma.raffleTicket.count({ where: { userId: secondaryId } }),
    prisma.userAchievement.findMany({ where: { userId: secondaryId }, select: { achievementId: true } }),
    prisma.socialLink.findMany({ where: { userId: secondaryId }, select: { platform: true } }),
    prisma.userTask.count({ where: { userId: secondaryId } }),
    prisma.dropClaim.findMany({ where: { userId: secondaryId }, select: { dropId: true } }),
    prisma.account.findMany({ where: { userId: primaryId }, select: { provider: true } }),
    prisma.connection.findMany({ where: { userId: primaryId }, select: { platform: true } }),
    prisma.userAchievement.findMany({ where: { userId: primaryId }, select: { achievementId: true } }),
    prisma.socialLink.findMany({ where: { userId: primaryId }, select: { platform: true } }),
    prisma.eventEntry.findMany({ where: { userId: primaryId }, select: { eventId: true } }),
    prisma.dropClaim.findMany({ where: { userId: primaryId }, select: { dropId: true } }),
  ]);

  const primAccountProviders = new Set(primAccounts.map((a) => a.provider));
  const primConnectionPlatforms = new Set(primConnections.map((c) => c.platform));
  const primAchievementSet = new Set(primAchievementIds.map((a) => a.achievementId));
  const primSocialPlatformSet = new Set(primSocialLinkPlatforms.map((s) => s.platform));
  const primEventSet = new Set(primEventIds.map((e) => e.eventId));
  const primDropSet = new Set(primDropIds.map((d) => d.dropId));

  const accountConflicts = secAccounts.filter((a) => primAccountProviders.has(a.provider)).map((a) => a.provider);
  const connectionConflicts = secConnections.filter((c) => primConnectionPlatforms.has(c.platform)).map((c) => c.platform);
  const achievementConflicts = secUserAchievements.filter((ua) => primAchievementSet.has(ua.achievementId)).length;
  const socialLinkConflicts = secSocialLinks.filter((s) => primSocialPlatformSet.has(s.platform)).length;
  const eventEntryConflicts = secEventEntries.filter((e) => primEventSet.has(e.eventId)).length;
  const dropClaimConflicts = secDropClaims.filter((d) => primDropSet.has(d.dropId)).length;

  return {
    primary: { id: primary.id, username: primary.username, tokens: primary.tokens },
    secondary: { id: secondary.id, username: secondary.username, tokens: secondary.tokens },
    willMove: {
      tokens: secondary.tokens,
      transactions: secTransactions,
      donations: secDonations,
      notifications: secNotifications,
      eventEntries: secEventEntries.length - eventEntryConflicts,
      raffleTickets: secRaffleTickets,
      dropClaims: secDropClaims.length - dropClaimConflicts,
      achievements: secUserAchievements.length - achievementConflicts,
      socialLinks: secSocialLinks.length - socialLinkConflicts,
      userTasks: secUserTasks,
      accounts: secAccounts.length - accountConflicts.length,
      connections: secConnections.length - connectionConflicts.length,
    },
    conflicts: {
      accountProviders: accountConflicts,
      connectionPlatforms: connectionConflicts,
      achievements: achievementConflicts,
      socialLinks: socialLinkConflicts,
      eventEntries: eventEntryConflicts,
      dropClaims: dropClaimConflicts,
    },
    finalPrimaryTokens: primary.tokens + secondary.tokens,
  };
}

// =====================================================
// Execute — perform the merge inside one transaction
// =====================================================

export async function executeMerge(opts: {
  primaryUserId: string;
  secondaryUserId: string;
}): Promise<{ ok: true; summary: MergePreview["willMove"] }> {
  const { primaryUserId, secondaryUserId } = opts;
  if (primaryUserId === secondaryUserId) throw new Error("primary === secondary");

  const summary = await prisma.$transaction(async (tx) => {
    const [primary, secondary] = await Promise.all([
      tx.user.findUnique({ where: { id: primaryUserId } }),
      tx.user.findUnique({ where: { id: secondaryUserId } }),
    ]);
    if (!primary) throw new Error(`primary user ${primaryUserId} not found`);
    if (!secondary) throw new Error(`secondary user ${secondaryUserId} not found`);

    // --- Account: skip on provider conflict (primary's account stays) ---
    const primAccountProviders = new Set(
      (await tx.account.findMany({ where: { userId: primaryUserId }, select: { provider: true } }))
        .map((a) => a.provider),
    );
    const secAccounts = await tx.account.findMany({ where: { userId: secondaryUserId } });
    let accountsMoved = 0;
    for (const a of secAccounts) {
      if (primAccountProviders.has(a.provider)) {
        await tx.account.delete({ where: { id: a.id } });
      } else {
        await tx.account.update({ where: { id: a.id }, data: { userId: primaryUserId } });
        accountsMoved++;
      }
    }

    // --- Connection: skip on platform conflict ---
    const primConnectionPlatforms = new Set(
      (await tx.connection.findMany({ where: { userId: primaryUserId }, select: { platform: true } }))
        .map((c) => c.platform),
    );
    const secConnections = await tx.connection.findMany({ where: { userId: secondaryUserId } });
    let connectionsMoved = 0;
    for (const c of secConnections) {
      if (primConnectionPlatforms.has(c.platform)) {
        await tx.connection.delete({ where: { id: c.id } });
      } else {
        await tx.connection.update({ where: { id: c.id }, data: { userId: primaryUserId } });
        connectionsMoved++;
      }
    }

    // --- UserAchievement: skip on achievement conflict (primary keeps theirs) ---
    const primAchievementIds = new Set(
      (await tx.userAchievement.findMany({ where: { userId: primaryUserId }, select: { achievementId: true } }))
        .map((a) => a.achievementId),
    );
    const secAchievements = await tx.userAchievement.findMany({ where: { userId: secondaryUserId } });
    let achievementsMoved = 0;
    for (const ua of secAchievements) {
      if (primAchievementIds.has(ua.achievementId)) {
        await tx.userAchievement.delete({ where: { id: ua.id } });
      } else {
        await tx.userAchievement.update({ where: { id: ua.id }, data: { userId: primaryUserId } });
        achievementsMoved++;
      }
    }

    // --- SocialLink: skip on platform conflict ---
    const primSocialPlatforms = new Set(
      (await tx.socialLink.findMany({ where: { userId: primaryUserId }, select: { platform: true } }))
        .map((s) => s.platform),
    );
    const secSocials = await tx.socialLink.findMany({ where: { userId: secondaryUserId } });
    let socialLinksMoved = 0;
    for (const s of secSocials) {
      if (primSocialPlatforms.has(s.platform)) {
        await tx.socialLink.delete({ where: { id: s.id } });
      } else {
        await tx.socialLink.update({ where: { id: s.id }, data: { userId: primaryUserId } });
        socialLinksMoved++;
      }
    }

    // --- EventEntry: skip on event conflict ---
    const primEventIds = new Set(
      (await tx.eventEntry.findMany({ where: { userId: primaryUserId }, select: { eventId: true } }))
        .map((e) => e.eventId),
    );
    const secEntries = await tx.eventEntry.findMany({ where: { userId: secondaryUserId } });
    let eventEntriesMoved = 0;
    for (const ee of secEntries) {
      if (primEventIds.has(ee.eventId)) {
        await tx.eventEntry.delete({ where: { id: ee.id } });
      } else {
        await tx.eventEntry.update({ where: { id: ee.id }, data: { userId: primaryUserId } });
        eventEntriesMoved++;
      }
    }

    // --- DropClaim: skip on drop conflict ---
    const primDropIds = new Set(
      (await tx.dropClaim.findMany({ where: { userId: primaryUserId }, select: { dropId: true } }))
        .map((d) => d.dropId),
    );
    const secClaims = await tx.dropClaim.findMany({ where: { userId: secondaryUserId } });
    let dropClaimsMoved = 0;
    for (const dc of secClaims) {
      if (primDropIds.has(dc.dropId)) {
        await tx.dropClaim.delete({ where: { id: dc.id } });
      } else {
        await tx.dropClaim.update({ where: { id: dc.id }, data: { userId: primaryUserId } });
        dropClaimsMoved++;
      }
    }

    // --- UserTask: unique on (userId, taskId, date); merge with skipDuplicates pattern ---
    const primUserTasks = await tx.userTask.findMany({
      where: { userId: primaryUserId },
      select: { taskId: true, date: true },
    });
    const primTaskKeySet = new Set(primUserTasks.map((t) => `${t.taskId}|${t.date}`));
    const secTasks = await tx.userTask.findMany({ where: { userId: secondaryUserId } });
    let userTasksMoved = 0;
    for (const ut of secTasks) {
      if (primTaskKeySet.has(`${ut.taskId}|${ut.date}`)) {
        await tx.userTask.delete({ where: { id: ut.id } });
      } else {
        await tx.userTask.update({ where: { id: ut.id }, data: { userId: primaryUserId } });
        userTasksMoved++;
      }
    }

    // --- Plain reparenting (no unique constraints involving userId) ---
    const txnRes = await tx.transaction.updateMany({
      where: { userId: secondaryUserId }, data: { userId: primaryUserId },
    });
    const donRes = await tx.donation.updateMany({
      where: { userId: secondaryUserId }, data: { userId: primaryUserId },
    });
    const notRes = await tx.notification.updateMany({
      where: { userId: secondaryUserId }, data: { userId: primaryUserId },
    });
    const rafRes = await tx.raffleTicket.updateMany({
      where: { userId: secondaryUserId }, data: { userId: primaryUserId },
    });

    // --- Aggregate updates on primary ---
    await tx.user.update({
      where: { id: primaryUserId },
      data: {
        tokens:       { increment: secondary.tokens },
        totalEarned:  { increment: secondary.totalEarned },
        totalSpent:   { increment: secondary.totalSpent },
        totalDonated: { increment: secondary.totalDonated },
        messageCount: { increment: secondary.messageCount },
        voiceMinutes: { increment: secondary.voiceMinutes },
        level: Math.max(primary.level, secondary.level),
        xp:    Math.max(primary.xp, secondary.xp),
        prestige: Math.max(primary.prestige, secondary.prestige), // monotonic in xp, stays consistent with xp:max
        streak: Math.max(primary.streak, secondary.streak),
        isDonator: primary.isDonator || secondary.isDonator,
      },
    });

    // --- Delete secondary user (sessions cascade; everything else already moved) ---
    await tx.discordLinkCode.deleteMany({ where: { userId: secondaryUserId } });
    await tx.user.delete({ where: { id: secondaryUserId } });

    return {
      tokens: secondary.tokens,
      transactions: txnRes.count,
      donations: donRes.count,
      notifications: notRes.count,
      eventEntries: eventEntriesMoved,
      raffleTickets: rafRes.count,
      dropClaims: dropClaimsMoved,
      achievements: achievementsMoved,
      socialLinks: socialLinksMoved,
      userTasks: userTasksMoved,
      accounts: accountsMoved,
      connections: connectionsMoved,
    };
  });

  return { ok: true, summary };
}

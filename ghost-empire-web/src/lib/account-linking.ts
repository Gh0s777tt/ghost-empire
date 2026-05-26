// src/lib/account-linking.ts
// HMAC-signed link intent cookie. Lets a logged-in user initiate an OAuth flow
// that links the resulting provider account to their EXISTING user rather than
// creating a new duplicate user.
//
// Token format: <base64url(payload)>.<base64url(hmac)>
// Payload JSON: { uid: string; provider: string; nonce: string; exp: number }
//
// Signed with NEXTAUTH_SECRET; expires in 5 minutes; one-shot (cleared after read).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "ghost_link_intent";
const TTL_MS = 5 * 60 * 1000;

type LinkPayload = {
  uid: string;
  provider: string;
  nonce: string;
  exp: number;
};

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

function signingKey(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not set");
  return secret;
}

function hmac(payload: string): string {
  return b64urlEncode(createHmac("sha256", signingKey()).update(payload).digest());
}

export function createLinkToken(uid: string, provider: string): string {
  const payload: LinkPayload = {
    uid,
    provider,
    nonce: randomBytes(8).toString("hex"),
    exp: Date.now() + TTL_MS,
  };
  const encoded = b64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = hmac(encoded);
  return `${encoded}.${sig}`;
}

export function verifyLinkToken(token: string | undefined | null): LinkPayload | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot < 1 || dot === token.length - 1) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(encoded);

  // Constant-time compare
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  let parsed: LinkPayload;
  try {
    parsed = JSON.parse(b64urlDecode(encoded).toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed.uid !== "string" || typeof parsed.provider !== "string") return null;
  if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
  return parsed;
}

export const LINK_COOKIE_NAME = COOKIE_NAME;

/** Cookie attributes for the link_intent cookie. Used by both set + clear. */
export function linkCookieAttrs(maxAgeSeconds: number) {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

// =====================================================
// Link execution — called from signIn callback after OAuth completes.
// PrismaAdapter has already created/linked the Account row by this point.
// =====================================================

export type LinkResult =
  | { kind: "success" }
  | { kind: "already_linked" }
  | { kind: "conflict"; reason: "target_missing" | "already_used_by_another" | "already_have_provider" | "internal" };

/**
 * Move the freshly-created Account to the target user (the one who initiated the link).
 * Migrates Connection rows for the same platform, and deletes the orphan user if it
 * was newly-created with no economy data (only the welcome bonus).
 */
export async function executeAccountLink(opts: {
  targetUserId: string;
  orphanUserId: string;       // user.id returned by NextAuth — may be the target or a freshly-created orphan
  provider: string;
  providerAccountId: string;
}): Promise<LinkResult> {
  const { targetUserId, orphanUserId, provider, providerAccountId } = opts;

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) return { kind: "conflict", reason: "target_missing" };

  const accountRow = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
  });
  if (!accountRow) return { kind: "conflict", reason: "internal" };

  // Already correctly linked
  if (accountRow.userId === targetUserId) return { kind: "already_linked" };

  // Account is bound to a user that isn't the one initiating the link AND
  // isn't the newly-created orphan from THIS OAuth flow → real conflict
  if (accountRow.userId !== orphanUserId) {
    return { kind: "conflict", reason: "already_used_by_another" };
  }

  // Target already has another (different) account for the same provider
  const targetExisting = await prisma.account.findFirst({
    where: { userId: targetUserId, provider, id: { not: accountRow.id } },
  });
  if (targetExisting) return { kind: "conflict", reason: "already_have_provider" };

  await prisma.$transaction(async (tx) => {
    // 1. Move Account
    await tx.account.update({
      where: { id: accountRow.id },
      data: { userId: targetUserId },
    });

    // 2. Migrate Connection rows for the same platform (skip if target already has one)
    const orphanConnections = await tx.connection.findMany({
      where: { userId: orphanUserId, platform: provider },
    });
    for (const c of orphanConnections) {
      const targetHas = await tx.connection.findFirst({
        where: { userId: targetUserId, platform: provider },
      });
      if (targetHas) {
        // Target already has a connection for this platform → orphan's is a dup
        await tx.connection.delete({ where: { id: c.id } });
      } else {
        await tx.connection.update({
          where: { id: c.id },
          data: { userId: targetUserId },
        });
      }
    }

    // 3. Delete the orphan user if it's safe — no other auth methods AND no real economy data
    if (orphanUserId === targetUserId) return;
    const remainingAccounts = await tx.account.count({ where: { userId: orphanUserId } });
    if (remainingAccounts > 0) return;

    const orphan = await tx.user.findUnique({
      where: { id: orphanUserId },
      select: {
        tokens: true,
        totalEarned: true,
        isAdmin: true,
        isModerator: true,
        _count: {
          select: { transactions: true, userAchievements: true, socialLinks: true, donations: true },
        },
      },
    });
    if (!orphan) return;

    // 500 + 1 transaction = welcome bonus only (set in events.createUser)
    const hasMeaningfulData =
      orphan.isAdmin ||
      orphan.isModerator ||
      orphan.tokens > 500 ||
      orphan.totalEarned > 500 ||
      orphan._count.transactions > 1 ||
      orphan._count.userAchievements > 0 ||
      orphan._count.socialLinks > 0 ||
      orphan._count.donations > 0;

    if (hasMeaningfulData) {
      console.warn(`[link] orphan user ${orphanUserId} retained — has economy data`);
      return;
    }

    await tx.user.delete({ where: { id: orphanUserId } });
  });

  return { kind: "success" };
}

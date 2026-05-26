// src/app/api/profile/connections/unlink/route.ts
// Disconnect an OAuth provider from the user's account.
// Safety: refuses to remove the last remaining sign-in method (would lock the user out).
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_PROVIDERS = new Set(["twitch", "kick", "discord", "google"]);

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }

  let body: { provider?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const provider = body.provider;
  if (!provider || !ALLOWED_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: "Nieobsługiwany provider" }, { status: 400 });
  }

  const userId = session.user.id;

  // Count this user's auth methods — refuse to unlink the last one
  const allAccounts = await prisma.account.findMany({
    where: { userId },
    select: { id: true, provider: true },
  });
  const targetAccounts = allAccounts.filter((a) => a.provider === provider);

  if (targetAccounts.length === 0) {
    return NextResponse.json(
      { error: "Ta platforma nie jest połączona" },
      { status: 404 },
    );
  }

  if (allAccounts.length <= 1) {
    return NextResponse.json(
      {
        error:
          "To Twoja jedyna metoda logowania. Połącz inną platformę zanim odłączysz tę — inaczej stracisz dostęp do konta.",
      },
      { status: 409 },
    );
  }

  // Map provider id → semantic platform name (matches auth.ts logic)
  const platformName = provider === "google" ? "youtube" : provider;

  await prisma.$transaction([
    prisma.account.deleteMany({ where: { userId, provider } }),
    prisma.connection.deleteMany({ where: { userId, platform: platformName } }),
  ]);

  return NextResponse.json({ ok: true, provider });
}

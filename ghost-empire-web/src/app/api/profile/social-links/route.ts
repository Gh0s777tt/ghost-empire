// src/app/api/profile/social-links/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeMediaUrl } from "@/lib/url-safe";

const ALLOWED_PLATFORMS = ["instagram", "twitter", "tiktok", "youtube", "website"] as const;
type AllowedPlatform = (typeof ALLOWED_PLATFORMS)[number];

function buildUrl(platform: AllowedPlatform, handle: string): string {
  const h = handle.trim().replace(/^@/, "");
  switch (platform) {
    case "instagram": return `https://instagram.com/${h}`;
    case "twitter":   return `https://x.com/${h}`;
    case "tiktok":    return `https://tiktok.com/@${h}`;
    case "youtube":   return h.startsWith("http") ? h : `https://youtube.com/@${h}`;
    case "website":   return h.startsWith("http") ? h : `https://${h}`;
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }

  let body: { platform?: string; handle?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const platform = body.platform as AllowedPlatform;
  const handle = (body.handle ?? "").trim();

  if (!ALLOWED_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "Nieobsługiwana platforma" }, { status: 400 });
  }
  if (!handle || handle.length > 100) {
    return NextResponse.json({ error: "Handle 1-100 znaków" }, { status: 400 });
  }

  // Defensive: the stored url is rendered as an <a href> on profiles — guarantee
  // it's a real http(s) URL (blocks javascript:/data: even if buildUrl is bypassed).
  const url = safeMediaUrl(buildUrl(platform, handle));
  if (!url) {
    return NextResponse.json({ error: "Nieprawidłowy URL" }, { status: 400 });
  }

  const link = await prisma.socialLink.upsert({
    where: { userId_platform: { userId: session.user.id, platform } },
    create: { userId: session.user.id, platform, handle, url },
    update: { handle, url },
  });

  return NextResponse.json({ ok: true, link });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform") as AllowedPlatform | null;

  if (!platform || !ALLOWED_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "Brak platformy" }, { status: 400 });
  }

  await prisma.socialLink.deleteMany({
    where: { userId: session.user.id, platform },
  });

  return NextResponse.json({ ok: true });
}

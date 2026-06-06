// src/app/api/profile/social-links/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeMediaUrl } from "@/lib/url-safe";

// Manual links — no OAuth needed. Socials + streaming + gaming handles. For platforms
// without a public profile URL by handle (PSN / Xbox) we link a well-known lookup site.
const ALLOWED_PLATFORMS = [
  "instagram", "twitter", "tiktok", "youtube", "website",
  "twitch", "kick", "rumble", "trovo", "github",
  "steam", "psn", "xbox", "discord",
] as const;
type AllowedPlatform = (typeof ALLOWED_PLATFORMS)[number];

function buildUrl(platform: AllowedPlatform, handle: string): string {
  const h = handle.trim().replace(/^@/, "");
  switch (platform) {
    case "instagram": return `https://instagram.com/${h}`;
    case "twitter":   return `https://x.com/${h}`;
    case "tiktok":    return `https://tiktok.com/@${h}`;
    case "youtube":   return h.startsWith("http") ? h : `https://youtube.com/@${h}`;
    case "twitch":    return `https://twitch.tv/${h}`;
    case "kick":      return `https://kick.com/${h}`;
    case "rumble":    return h.startsWith("http") ? h : `https://rumble.com/c/${h}`;
    case "trovo":     return `https://trovo.live/s/${h}`;
    case "github":    return `https://github.com/${h}`;
    case "steam":     return h.startsWith("http") ? h : `https://steamcommunity.com/id/${h}`;
    case "psn":       return `https://psnprofiles.com/${h}`;
    case "xbox":      return `https://www.xboxgamertag.com/search/${h}`;
    case "discord":   return h.startsWith("http") ? h : `https://discord.gg/${h}`;
    case "website":   return h.startsWith("http") ? h : `https://${h}`;
  }
}

export async function POST(req: Request) {
  const session = await auth();
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
  const session = await auth();
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

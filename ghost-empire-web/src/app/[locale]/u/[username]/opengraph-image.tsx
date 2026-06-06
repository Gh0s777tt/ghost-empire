// src/app/u/[username]/opengraph-image.tsx
// Dynamic OG image. Uses node runtime for Prisma access.
// Emojis avoided — twemoji needs network fetch which fails intermittently
// on node runtime; using pure CSS text/shapes for reliability.
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { fmt, rankForLevel, displayNick } from "@/lib/utils";

export const alt = "Ghost Empire — User Profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { username },
      select: {
        displayName: true,
        username: true,
        level: true,
        totalEarned: true,
        streak: true,
        messageCount: true,
        isAdmin: true,
        isModerator: true,
        isDonator: true,
      },
    });
  } catch {
    user = null;
  }

  if (!user) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#000",
            color: "#71717a",
            fontSize: 48,
            fontFamily: "sans-serif",
          }}
        >
          User not found
        </div>
      ),
      { ...size },
    );
  }

  const rank = rankForLevel(user.level);
  const displayName = displayNick(user.displayName, user.username);
  const initial = displayName.charAt(0).toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 60,
          background: "#000",
          backgroundImage: `radial-gradient(circle at 30% 30%, ${rank.color}40 0%, transparent 60%), radial-gradient(circle at 70% 70%, rgba(139,0,0,0.3) 0%, transparent 50%)`,
          fontFamily: "sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 50,
              height: 50,
              display: "flex",
              background: "linear-gradient(135deg, #E50914 0%, #8B0000 100%)",
              clipPath:
                "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
            }}
          />
          <div
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: "white",
              letterSpacing: "0.1em",
            }}
          >
            GH0ST EMPIRE
          </div>
        </div>

        {/* Main */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            gap: 50,
          }}
        >
          {/* Initial tile */}
          <div
            style={{
              display: "flex",
              position: "relative",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 220,
                height: 220,
                background: `linear-gradient(135deg, ${rank.color}80 0%, ${rank.color}30 100%)`,
                border: `6px solid ${rank.color}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 140,
                fontWeight: 900,
                color: "white",
              }}
            >
              {initial}
            </div>
            <div
              style={{
                position: "absolute",
                bottom: -12,
                right: -12,
                padding: "8px 16px",
                background: rank.color,
                color: "#000",
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: "0.1em",
                display: "flex",
              }}
            >
              LVL {user.level}
            </div>
          </div>

          {/* Info */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 60,
                fontWeight: 900,
                color: "white",
                letterSpacing: "0.05em",
                marginBottom: 14,
                display: "flex",
              }}
            >
              {displayName}
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                marginBottom: 14,
              }}
            >
              {user.isAdmin && (
                <div
                  style={{
                    padding: "6px 14px",
                    background: "rgba(229,9,20,0.2)",
                    border: "1px solid #ef4444",
                    color: "#fca5a5",
                    fontSize: 18,
                    fontWeight: 900,
                    letterSpacing: "0.15em",
                    display: "flex",
                  }}
                >
                  ADMIN
                </div>
              )}
              {user.isModerator && !user.isAdmin && (
                <div
                  style={{
                    padding: "6px 14px",
                    background: "rgba(59,130,246,0.2)",
                    border: "1px solid #3b82f6",
                    color: "#93c5fd",
                    fontSize: 18,
                    fontWeight: 900,
                    letterSpacing: "0.15em",
                    display: "flex",
                  }}
                >
                  MOD
                </div>
              )}
              {user.isDonator && (
                <div
                  style={{
                    padding: "6px 14px",
                    background: "rgba(234,179,8,0.2)",
                    border: "1px solid #eab308",
                    color: "#fde68a",
                    fontSize: 18,
                    fontWeight: 900,
                    letterSpacing: "0.15em",
                    display: "flex",
                  }}
                >
                  DONATOR
                </div>
              )}
            </div>

            <div
              style={{
                fontSize: 22,
                color: "#a1a1aa",
                fontFamily: "monospace",
                marginBottom: 30,
                display: "flex",
                gap: 16,
              }}
            >
              <div style={{ display: "flex" }}>@{user.username}</div>
              <div style={{ display: "flex", color: "#52525b" }}>·</div>
              <div style={{ display: "flex", color: rank.color, letterSpacing: "0.15em" }}>
                LVL {user.level} {rank.name}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 20,
              }}
            >
              <Stat label="LIFETIME GT" value={fmt(user.totalEarned)} />
              <Stat label="STREAK" value={`${user.streak} dni`} />
              <Stat label="WIADOMOSCI" value={fmt(user.messageCount)} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 16,
            color: "#52525b",
            fontFamily: "monospace",
          }}
        >
          <div style={{ display: "flex" }}>ghost-empire-web.vercel.app/u/{user.username}</div>
          <div style={{ display: "flex" }}>twitch.tv/gh0s77tt</div>
        </div>
      </div>
    ),
    { ...size },
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "12px 18px",
        border: "1px solid #27272a",
        background: "rgba(24,24,27,0.6)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontFamily: "monospace",
          letterSpacing: "0.2em",
          color: "#71717a",
          marginBottom: 4,
          display: "flex",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 900,
          color: "white",
          display: "flex",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// src/app/u/[username]/opengraph-image.tsx
// Dynamic OG image showing user's avatar, rank, level, and stats.
// Uses node runtime because we need Prisma DB access.
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { fmt, rankForLevel } from "@/lib/utils";

export const alt = "Ghost Empire — User Profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      displayName: true,
      username: true,
      image: true,
      level: true,
      totalEarned: true,
      streak: true,
      messageCount: true,
      isAdmin: true,
      isModerator: true,
      isDonator: true,
    },
  });

  if (!user) {
    // Fallback to generic image if user not found
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
  const displayName = user.displayName ?? user.username ?? "Anonim";

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
        {/* Top-left: Ghost Empire branding */}
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
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #E50914 0%, #8B0000 100%)",
              clipPath:
                "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
              fontSize: 24,
            }}
          >
            👻
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: "white",
              letterSpacing: "0.1em",
              textShadow: "2px 0 0 rgba(229,9,20,0.7)",
            }}
          >
            GH0ST EMPIRE
          </div>
        </div>

        {/* Main card */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            gap: 50,
          }}
        >
          {/* Avatar */}
          <div
            style={{
              display: "flex",
              position: "relative",
              flexShrink: 0,
            }}
          >
            {user.image ? (
              <img
                src={user.image}
                alt=""
                width={220}
                height={220}
                style={{
                  border: `6px solid ${rank.color}`,
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  width: 220,
                  height: 220,
                  background: "#18181b",
                  border: `6px solid ${rank.color}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 100,
                }}
              >
                👻
              </div>
            )}
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
              }}
            >
              LVL {user.level}
            </div>
          </div>

          {/* Info column */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minWidth: 0,
            }}
          >
            {/* Name + role badges */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  fontSize: 60,
                  fontWeight: 900,
                  color: "white",
                  letterSpacing: "0.05em",
                  textShadow:
                    "3px 0 0 rgba(229,9,20,0.7), -3px 0 0 rgba(139,0,0,0.5)",
                }}
              >
                {displayName}
              </div>
            </div>

            {/* Badges */}
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
                    padding: "6px 12px",
                    background: "rgba(229,9,20,0.2)",
                    border: "1px solid #ef4444",
                    color: "#fca5a5",
                    fontSize: 18,
                    fontWeight: 900,
                    letterSpacing: "0.15em",
                  }}
                >
                  👑 ADMIN
                </div>
              )}
              {user.isModerator && !user.isAdmin && (
                <div
                  style={{
                    padding: "6px 12px",
                    background: "rgba(59,130,246,0.2)",
                    border: "1px solid #3b82f6",
                    color: "#93c5fd",
                    fontSize: 18,
                    fontWeight: 900,
                    letterSpacing: "0.15em",
                  }}
                >
                  🛡️ MOD
                </div>
              )}
              {user.isDonator && (
                <div
                  style={{
                    padding: "6px 12px",
                    background: "rgba(234,179,8,0.2)",
                    border: "1px solid #eab308",
                    color: "#fde68a",
                    fontSize: 18,
                    fontWeight: 900,
                    letterSpacing: "0.15em",
                  }}
                >
                  ❤️ DONATOR
                </div>
              )}
            </div>

            {/* Username + rank */}
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
              <span>@{user.username}</span>
              <span style={{ color: "#52525b" }}>·</span>
              <span style={{ color: rank.color, letterSpacing: "0.15em" }}>
                {rank.emoji} {rank.name}
              </span>
            </div>

            {/* Stats row */}
            <div
              style={{
                display: "flex",
                gap: 30,
              }}
            >
              <Stat label="LIFETIME GT" value={fmt(user.totalEarned)} accent={rank.color} />
              <Stat label="STREAK" value={`${user.streak} dni`} accent={rank.color} />
              <Stat label="WIADOMOŚCI" value={fmt(user.messageCount)} accent={rank.color} />
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
          <span>ghost-empire-web.vercel.app/u/{user.username}</span>
          <span>twitch.tv/gh0s77tt</span>
        </div>
      </div>
    ),
    { ...size },
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
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
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 900,
          color: "white",
        }}
      >
        {value}
      </div>
    </div>
  );
}

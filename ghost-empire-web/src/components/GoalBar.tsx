// src/components/GoalBar.tsx
// Shared presentational pieces for the Stream Goals overlay — used by the OBS
// overlay (/overlay/goals) and the live preview in /admin#goals. Pure styling.
import { fontStack } from "@/lib/widget-fonts";

export type OverlayGoal = {
  id: string;
  type: string;
  label: string;
  current: number;
  target: number;
  color: string | null;
  textColor?: string | null;
  bgColor?: string | null;
  fontFamily?: string | null;
  completedAt: string | null;
};

export type OverlayHypeTrain = {
  level: number;
  goal: number;
  total: number;
  topContributor: string | null;
  expiresAt: string | null;
};

export const GOAL_TYPE_LABEL: Record<string, string> = {
  subs: "Subskrypcje",
  gift_subs: "Gifted Subs",
  follows: "Follows",
  donations_pln: "Donacje PLN",
  cheers_bits: "Bity",
  yt_members: "YT Members",
};

export const GOAL_TYPE_ICON: Record<string, string> = {
  subs: "💜",
  gift_subs: "🎁",
  follows: "❤️",
  donations_pln: "💰",
  cheers_bits: "💎",
  yt_members: "📺",
};

export function GoalBar({ goal, accent }: { goal: OverlayGoal; accent: string }) {
  const color = goal.color ?? accent;
  const textColor = goal.textColor ?? "#a1a1aa"; // secondary/label text
  const bg = goal.bgColor ?? "rgba(15, 15, 20, 0.92)";
  const font = fontStack(goal.fontFamily);
  const pct = Math.min(100, (goal.current / Math.max(1, goal.target)) * 100);
  const completed = goal.completedAt != null;

  return (
    <div
      style={{
        background: bg,
        backdropFilter: "blur(10px)",
        borderRadius: 10,
        padding: "10px 14px",
        borderLeft: `4px solid ${color}`,
        boxShadow: `0 10px 28px rgba(0,0,0,0.55), 0 0 14px ${color}33`,
        color: "#fff",
        fontFamily: font,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>{GOAL_TYPE_ICON[goal.type] ?? "🎯"}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color }}>
              {GOAL_TYPE_LABEL[goal.type] ?? goal.type}
              {completed && <span style={{ marginLeft: 6, color: "#34d399" }}>✓ COMPLETE</span>}
            </div>
            <div style={{ fontSize: 11, color: textColor, lineHeight: 1.2 }}>{goal.label}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {goal.current.toLocaleString("pl-PL")}
            <span style={{ color: "#71717a", fontWeight: 500, fontSize: 11 }}> / {goal.target.toLocaleString("pl-PL")}</span>
          </div>
          <div style={{ fontSize: 10, color: textColor, fontVariantNumeric: "tabular-nums" }}>{pct.toFixed(0)}%</div>
        </div>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: completed
              ? "linear-gradient(90deg, #34d399, #10b981)"
              : `linear-gradient(90deg, ${color}, ${color}cc)`,
            transition: "width 600ms cubic-bezier(0.22, 1, 0.36, 1)",
            boxShadow: `0 0 10px ${color}88`,
          }}
        />
      </div>
    </div>
  );
}

export function HypeTrainBanner({ train, accent }: { train: OverlayHypeTrain; accent: string }) {
  const pct = Math.min(100, (train.total / Math.max(1, train.goal)) * 100);
  return (
    <div
      style={{
        background: "rgba(20, 10, 30, 0.95)",
        backdropFilter: "blur(10px)",
        borderRadius: 12,
        padding: "12px 18px",
        border: `2px solid ${accent}`,
        boxShadow: `0 12px 36px rgba(0,0,0,0.6), 0 0 20px ${accent}66`,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <span style={{ fontSize: 28, animation: "pulse 1.4s ease-in-out infinite" }}>🚂</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, color: accent }}>
          HYPE TRAIN — LEVEL {train.level}
        </div>
        <div style={{ height: 6, marginTop: 4, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: `linear-gradient(90deg, ${accent}, #fbbf24)`,
              transition: "width 400ms ease-out",
              boxShadow: `0 0 12px ${accent}`,
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 11, color: "#a1a1aa" }}>
          <span>{train.total.toLocaleString("pl-PL")} / {train.goal.toLocaleString("pl-PL")} pkt</span>
          {train.topContributor && <span>Top: {train.topContributor}</span>}
        </div>
      </div>
    </div>
  );
}

// src/components/WheelGraphic.tsx
// Presentational SVG wheel with a fixed top pointer. `rotation` (degrees) is
// controlled by the caller; set `spinning` to enable the eased transition when
// you bump rotation to a landing angle. Shared by /overlay/wheel and /wheel.
"use client";

export type WheelSeg = { label: string; color: string; rewardTokens?: number };

/** Cartesian point on a circle, measuring `deg` clockwise from the top (12 o'clock). */
function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

/** Rotation (deg) that brings segment `index`'s centre under the top pointer, always
 *  increasing past `current` with `spins` extra full turns for a satisfying spin. */
export function rotationForIndex(current: number, index: number, n: number, spins = 5): number {
  const slice = 360 / Math.max(n, 1);
  const center = index * slice + slice / 2;
  const target = (360 - (center % 360)) % 360; // final mod-360 angle that lands the slice on top
  const base = Math.ceil((current + 1) / 360) * 360; // next whole turn beyond current
  return base + spins * 360 + target;
}

export function WheelGraphic({
  segments,
  rotation,
  size = 320,
  spinning = false,
}: {
  segments: WheelSeg[];
  rotation: number;
  size?: number;
  spinning?: boolean;
}) {
  const n = Math.max(segments.length, 1);
  const slice = 360 / n;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {/* fixed pointer at the top */}
      <div
        style={{
          position: "absolute",
          top: -2,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 2,
          width: 0,
          height: 0,
          borderLeft: "13px solid transparent",
          borderRight: "13px solid transparent",
          borderTop: "22px solid #fafafa",
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,.55))",
        }}
      />
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? "transform 5s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
          borderRadius: "50%",
          boxShadow: "0 8px 30px rgba(0,0,0,.5)",
          display: "block",
        }}
      >
        {segments.map((s, i) => {
          const start = i * slice;
          const end = (i + 1) * slice;
          const p1 = polar(cx, cy, r, start);
          const p2 = polar(cx, cy, r, end);
          const large = slice > 180 ? 1 : 0;
          const mid = start + slice / 2;
          const tp = polar(cx, cy, r * 0.62, mid);
          const label = s.label.length > 14 ? `${s.label.slice(0, 13)}…` : s.label;
          return (
            <g key={i}>
              <path
                d={`M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y} Z`}
                fill={s.color}
                stroke="#0a0a0a"
                strokeWidth={2}
              />
              <text
                x={tp.x}
                y={tp.y}
                fill="#ffffff"
                fontSize={n > 8 ? 10 : 12}
                fontWeight={700}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${mid} ${tp.x} ${tp.y})`}
                style={{ pointerEvents: "none", textShadow: "0 1px 2px rgba(0,0,0,.6)" }}
              >
                {label}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={size * 0.07} fill="#fafafa" stroke="#0a0a0a" strokeWidth={2} />
      </svg>
    </div>
  );
}

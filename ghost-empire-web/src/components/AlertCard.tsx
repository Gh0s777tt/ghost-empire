// src/components/AlertCard.tsx
// Shared presentational alert card — used by the OBS overlay (/overlay) and the
// live preview in /admin#alerts. Pure styling, no data fetching.
//
// Customizable: accent color, overall size (sizeScale), text size (textScale),
// message text color (textColor). Defaults reproduce the original look.

export type AlertCardData = {
  title: string;
  message: string;
  icon?: string | null;
  actorName?: string | null;
  actorImage?: string | null;
  amount?: number | null;
  amountLabel?: string | null;
};

export function AlertCard({
  alert,
  accent,
  sizeScale = 1,
  textScale = 1,
  textColor = "#d4d4d8",
  scaleOrigin = "center",
}: {
  alert: AlertCardData;
  accent: string;
  sizeScale?: number;
  textScale?: number;
  textColor?: string;
  scaleOrigin?: string;
}) {
  return (
    <div style={{ transform: `scale(${sizeScale})`, transformOrigin: scaleOrigin }}>
      <div
        style={{
          position: "relative",
          background: "rgba(15, 15, 20, 0.92)",
          backdropFilter: "blur(10px)",
          borderRadius: 16,
          padding: "18px 20px",
          boxShadow: `0 20px 50px rgba(0,0,0,0.55), 0 0 0 1px ${accent}55, 0 0 28px ${accent}33`,
          borderLeft: `4px solid ${accent}`,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        {/* Icon / Avatar */}
        <div style={{ flexShrink: 0 }}>
          {alert.actorImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={alert.actorImage}
              alt=""
              style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: `2px solid ${accent}` }}
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: `${accent}22`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                border: `2px solid ${accent}66`,
              }}
            >
              {alert.icon ?? "🔔"}
            </div>
          )}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 17 * textScale,
              color: accent,
              letterSpacing: 0.2,
              marginBottom: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {alert.title}
          </div>
          <div
            style={{
              fontSize: 14 * textScale,
              color: textColor,
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {alert.actorName && <span style={{ color: "#fff", fontWeight: 700 }}>{alert.actorName} </span>}
            {alert.message}
          </div>
        </div>

        {/* Amount */}
        {alert.amount != null && (
          <div style={{ flexShrink: 0, textAlign: "right", color: accent, fontWeight: 800, fontSize: 22 * textScale, lineHeight: 1 }}>
            {alert.amount.toLocaleString("pl-PL")}
            {alert.amountLabel && (
              <div style={{ fontSize: 11 * textScale, color: "#a1a1aa", fontWeight: 600, marginTop: 2 }}>{alert.amountLabel}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

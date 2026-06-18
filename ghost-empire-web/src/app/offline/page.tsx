// src/app/offline/page.tsx
// PWA offline fallback. Served from the service-worker cache only when a navigation
// fails because the device is offline. Fully self-contained — inline styles, a single
// precached icon, and a plain link home (no client JS) so it renders with nothing but
// the cached HTML available. Polish primary, English subline (locale-agnostic here).

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "2rem",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      {/* Plain <img>, not next/image: the offline page must render with no JS runtime. */}
      <img
        src="/icons/icon-192.png"
        alt=""
        width={88}
        height={88}
        style={{ opacity: 0.85, marginBottom: "1.5rem", filter: "drop-shadow(0 0 18px rgba(255,0,0,0.25))" }}
      />
      <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 0.5rem", color: "#fff", letterSpacing: "0.02em" }}>
        Jesteś offline
      </h1>
      <p style={{ fontSize: "0.95rem", color: "#a1a1aa", margin: "0 0 0.25rem", maxWidth: "22rem" }}>
        Brak połączenia z internetem. Sprawdź sieć i spróbuj ponownie.
      </p>
      <p style={{ fontSize: "0.8rem", color: "#71717a", margin: "0 0 1.75rem" }}>
        You&apos;re offline — check your connection and try again.
      </p>
      <a
        href="/"
        style={{
          display: "inline-block",
          padding: "0.6rem 1.4rem",
          borderRadius: "0.55rem",
          background: "#dc2626",
          color: "#fff",
          fontSize: "0.8rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          textDecoration: "none",
        }}
      >
        Spróbuj ponownie
      </a>
    </main>
  );
}

"use client";

// src/app/global-error.tsx
// Last-resort error boundary. Only fires when the ROOT LAYOUT itself throws,
// which bypasses layout.tsx entirely — so this file must render its own
// <html>/<body> and cannot rely on globals.css or Tailwind. Inline styles only.
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/global-error]", error);
  }, [error]);

  return (
    <html lang="pl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000",
          color: "#e4e4e7",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          padding: "1rem",
        }}
      >
        <div style={{ maxWidth: "28rem", width: "100%", textAlign: "center" }}>
          <div
            style={{
              width: "5rem",
              height: "5rem",
              margin: "0 auto 1.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #E50914 0%, #8B0000 100%)",
              clipPath:
                "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
              fontSize: "2rem",
            }}
          >
            👻
          </div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 800,
              letterSpacing: "0.05em",
              margin: "0 0 0.75rem",
              color: "#fff",
            }}
          >
            KRYTYCZNY BŁĄD
          </h1>
          <p
            style={{
              color: "#71717a",
              fontSize: "0.875rem",
              margin: "0 0 2rem",
              lineHeight: 1.6,
            }}
          >
            Portal napotkał poważny problem i nie mógł się załadować. Odśwież
            stronę — jeśli to nie pomoże, spróbuj ponownie za chwilę.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "0.75rem 1.5rem",
              background: "#dc2626",
              color: "#fff",
              border: "none",
              fontWeight: 700,
              fontSize: "0.75rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Odśwież stronę
          </button>
          {error.digest && (
            <p
              style={{
                color: "#3f3f46",
                fontSize: "0.625rem",
                fontFamily: "monospace",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginTop: "2rem",
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}

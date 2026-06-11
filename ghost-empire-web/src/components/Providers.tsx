"use client";
// src/components/Providers.tsx
import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  // refetchInterval: re-pull the session every 3 min so passively earned GT
  // (watching, chat awards) shows up in the header without a navigation; focus
  // refetch catches tab switches. Actions that return a fresh balance update
  // instantly via balance-bus, so the periodic pull is just a slow backstop —
  // 180s (was 60) cuts the /api/auth/session DB hits per open tab 3×.
  return (
    <SessionProvider refetchInterval={180} refetchOnWindowFocus>
      {children}
    </SessionProvider>
  );
}

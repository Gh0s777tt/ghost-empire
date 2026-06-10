"use client";
// src/components/Providers.tsx
import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  // refetchInterval: re-pull the session every 60s so passively earned GT (watching,
  // chat awards) shows up in the header without a navigation; focus refetch catches
  // tab switches. Actions that return a fresh balance update instantly via balance-bus.
  return (
    <SessionProvider refetchInterval={60} refetchOnWindowFocus>
      {children}
    </SessionProvider>
  );
}

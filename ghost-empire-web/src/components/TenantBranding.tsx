"use client";
// src/components/TenantBranding.tsx
// Client-side access to the active tenant's white-label branding (Phase 5).
// The [locale] layout resolves the tenant server-side and feeds the values in;
// client components read them via useTenantBranding() — most commonly the
// currency naming for "123 GT"-style suffixes that live outside i18n strings.
import { createContext, useContext } from "react";

export type TenantBrandingValue = {
  tokenName: string;
  tokenSymbol: string;
  brandName: string;
  brandShort: string;
  owner: string;
  /** Tenant logo url; null = default skull mark. */
  logoUrl: string | null;
  /** Tenant accent color (hex) — same value the layout feeds into --brand. */
  brandColor: string;
};

const TenantBrandingContext = createContext<TenantBrandingValue>({
  tokenName: "Ghost Tokens",
  tokenSymbol: "GT",
  brandName: "GH0ST EMPIRE",
  brandShort: "Ghost Empire",
  owner: "Gh0s77tt",
  logoUrl: null,
  brandColor: "#E50914",
});

export function TenantBrandingProvider({
  value, children,
}: { value: TenantBrandingValue; children: React.ReactNode }) {
  return <TenantBrandingContext.Provider value={value}>{children}</TenantBrandingContext.Provider>;
}

/** The active tenant's currency naming. Defaults to Ghost Tokens / GT. */
export function useTenantBranding(): TenantBrandingValue {
  return useContext(TenantBrandingContext);
}

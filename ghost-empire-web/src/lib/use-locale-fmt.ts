"use client";
// src/lib/use-locale-fmt.ts
// Returns a `fmt` bound to the active locale. Drop-in replacement for the bare
// `fmt` import in client components so numbers group per locale (PL "1 234"
// vs EN "1,234"). Destructure as `const fmt = useLocaleFmt();` and existing
// `fmt(x)` call sites keep working unchanged.
import { useLocale } from "next-intl";
import { fmt as fmtBase } from "@/lib/utils";

export function useLocaleFmt(): (n: number) => string {
  const locale = useLocale();
  return (n: number) => fmtBase(n, locale);
}

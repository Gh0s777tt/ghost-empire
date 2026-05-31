"use client";
// src/components/FirstVisitRedirect.tsx
// On a visitor's FIRST ever load of the home page, send them to /welcome once
// (flag in localStorage). Returning visitors go straight to the portal.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const FLAG = "ge_welcomed";

export function FirstVisitRedirect() {
  const router = useRouter();
  useEffect(() => {
    try {
      if (localStorage.getItem(FLAG) !== "1") {
        localStorage.setItem(FLAG, "1");
        router.replace("/welcome");
      }
    } catch {
      /* localStorage blocked (private mode) — just stay on home */
    }
  }, [router]);
  return null;
}

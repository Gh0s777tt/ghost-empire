// src/i18n/navigation.ts
// Locale-aware navigation helpers — use these instead of next/link + next/navigation
// so links/redirects automatically carry the active locale (and add /en when needed).
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

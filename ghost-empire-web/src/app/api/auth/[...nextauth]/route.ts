// src/app/api/auth/[...nextauth]/route.ts
// Auth.js v5 — the route handlers come straight from the NextAuth() instance.
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;

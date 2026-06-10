// src/app/api/admin/assistant/route.ts
// AI helper chat for the admin panel. Access: anyone who can open /admin
// (admins + moderators). Uses the shared aiChat (provider/key from Integrations);
// when AI isn't configured the client gets a 503 it can explain.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aiChat, type ChatMessage } from "@/lib/ai";
import { getIntegrationConfig } from "@/lib/integrations";
import { buildAdminAssistantPrompt } from "@/lib/admin-assistant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { featureGateResponse } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

const MAX_MESSAGES = 12; // client sends a trimmed conversation window
const MAX_CONTENT = 1500;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, isModerator: true, isBanned: true },
  });
  if (!user || user.isBanned || (!user.isAdmin && !user.isModerator)) {
    return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 });
  }

  // Plan gate (Phase 6): the AI assistant is an elite feature for paying tenants.
  const gated = await featureGateResponse("ai");
  if (gated) return gated;

  // AI calls cost real money — keep a per-user lid on it.
  const rl = await rateLimit(`ai-assistant:${session.user.id}`, 15, 5 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Za dużo pytań na raz — odczekaj chwilę" },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }
  const { messages, locale } = (body ?? {}) as { messages?: unknown; locale?: unknown };
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }
  const history: ChatMessage[] = [];
  for (const m of messages) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
    }
    history.push({ role, content: content.slice(0, MAX_CONTENT) });
  }
  if (history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  // Distinguish "no key at all" from "the provider rejected the call" — the
  // client shows a different message for each (configure vs check model/limits).
  const cfg = await getIntegrationConfig();
  if (!cfg.aiApiKey) {
    return NextResponse.json({ error: "ai-not-configured" }, { status: 503 });
  }

  const system = buildAdminAssistantPrompt(typeof locale === "string" && locale ? locale : "pl");
  const reply = await aiChat([{ role: "system", content: system }, ...history], {
    maxTokens: 700,
    temperature: 0.3,
  });
  if (!reply) {
    // Key exists but the call failed (bad model, quota, provider outage) —
    // details are in the Vercel function logs ("aiChat failed").
    return NextResponse.json({ error: "ai-provider-error" }, { status: 502 });
  }
  return NextResponse.json({ reply });
}

// src/app/api/assistant/route.ts
// Public-facing help assistant (the floating "?" on every page). Viewers ask how
// to use the portal; we answer with the shared aiChat. AI costs money and is an
// elite-plan feature, so this degrades gracefully: logged-out users, tenants
// without the AI plan, and tenants with no AI key all get a clean "unavailable"
// the client turns into "use the FAQ + quick links above" — the static help is
// always there, the AI is a bonus when the streamer has it switched on.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { aiChat, type ChatMessage } from "@/lib/ai";
import { getIntegrationConfig } from "@/lib/integrations";
import { requireTenantFeature } from "@/lib/entitlements";
import { buildHelpAssistantPrompt } from "@/lib/help-assistant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_MESSAGES = 10; // client sends a trimmed conversation window
const MAX_CONTENT = 1000;

export async function POST(req: Request) {
  // Logged-in only: the AI assistant spends the streamer's AI plan, so we never
  // expose it anonymously. Guests still get the static FAQ + quick links.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "auth-required" }, { status: 401 });
  }

  // Elite-plan feature. A tenant without the AI plan → unavailable (not an error).
  const gate = await requireTenantFeature("ai");
  if (!gate.ok) {
    return NextResponse.json({ error: "ai-unavailable" }, { status: 503 });
  }

  // AI calls cost real money — keep a per-user lid on it.
  const rl = await rateLimit(`help-assistant:${session.user.id}`, 12, 5 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate-limited" },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const { messages, locale } = (body ?? {}) as { messages?: unknown; locale?: unknown };
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const history: ChatMessage[] = [];
  for (const m of messages) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "bad-request" }, { status: 400 });
    }
    history.push({ role, content: content.slice(0, MAX_CONTENT) });
  }
  if (history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  // No key configured → unavailable, same as no plan (the viewer doesn't care why).
  const cfg = await getIntegrationConfig();
  if (!cfg.aiApiKey) {
    return NextResponse.json({ error: "ai-unavailable" }, { status: 503 });
  }

  const system = buildHelpAssistantPrompt(typeof locale === "string" && locale ? locale : "pl");
  const reply = await aiChat([{ role: "system", content: system }, ...history], {
    maxTokens: 500,
    temperature: 0.4,
  });
  if (!reply) {
    // Key exists but the provider call failed (bad model, quota, outage) — logged
    // server-side as "aiChat failed". Tell the client to retry.
    return NextResponse.json({ error: "ai-provider-error" }, { status: 502 });
  }
  return NextResponse.json({ reply });
}

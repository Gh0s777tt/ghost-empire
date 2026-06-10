// src/lib/ai.ts
// Provider-agnostic AI helpers (chat + image). The key/provider/model come from
// getIntegrationConfig (DB → env fallback), so the secret never leaves the server.
// Supports OpenAI-compatible providers (openai/deepseek/grok/bielik), Google Gemini
// and Anthropic for chat; image generation goes through OpenAI.
import { getIntegrationConfig } from "@/lib/integrations";
import { createLogger } from "@/lib/logger";

const log = createLogger("ai");

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const OPENAI_COMPATIBLE: Record<string, { base: string; defaultModel: string }> = {
  openai: { base: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" },
  deepseek: { base: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat" },
  grok: { base: "https://api.x.ai/v1", defaultModel: "grok-2-latest" },
  bielik: { base: "https://api.speakleash.dev/v1", defaultModel: "bielik-11b-v2.3-instruct" },
};

async function timed<T>(p: Promise<T>, ms = 20_000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("AI timeout")), ms))]);
}

/** Generate a chat completion. Returns the text, or null if AI isn't configured/failed. */
export async function aiChat(messages: ChatMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<string | null> {
  const cfg = await getIntegrationConfig();
  if (!cfg.aiApiKey) return null;
  const provider = cfg.aiProvider || "openai";
  const maxTokens = opts?.maxTokens ?? 300;
  const temperature = opts?.temperature ?? 0.8;

  try {
    if (provider === "gemini") {
      const model = cfg.aiModel || "gemini-2.0-flash";
      const sys = messages.find((m) => m.role === "system")?.content;
      const contents = messages.filter((m) => m.role !== "system").map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      const res = await timed(fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.aiApiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents, ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}), generationConfig: { maxOutputTokens: maxTokens, temperature } }),
      }));
      if (!res.ok) throw new Error(`gemini ${res.status}`);
      const d = await res.json();
      return d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
    }

    if (provider === "anthropic") {
      // claude-3-5-haiku-latest is a retired alias — calls with it 404 and the
      // whole chat silently degrades to null. Pin a current model id instead.
      const model = cfg.aiModel || "claude-haiku-4-5-20251001";
      const sys = messages.find((m) => m.role === "system")?.content;
      const res = await timed(fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": cfg.aiApiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: maxTokens, temperature, ...(sys ? { system: sys } : {}), messages: messages.filter((m) => m.role !== "system") }),
      }));
      if (!res.ok) throw new Error(`anthropic ${res.status}`);
      const d = await res.json();
      return d?.content?.[0]?.text?.trim() ?? null;
    }

    // OpenAI-compatible
    const conf = OPENAI_COMPATIBLE[provider] ?? OPENAI_COMPATIBLE.openai;
    const model = cfg.aiModel || conf.defaultModel;
    const res = await timed(fetch(`${conf.base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.aiApiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
    }));
    if (!res.ok) throw new Error(`${provider} ${res.status}`);
    const d = await res.json();
    return d?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (e) {
    log.error("aiChat failed", e, { provider, model: cfg.aiModel || "(default)" });
    return null;
  }
}

/** Generate an image (OpenAI). Returns a hosted URL, or null. */
export async function aiImage(prompt: string): Promise<string | null> {
  const cfg = await getIntegrationConfig();
  if (!cfg.aiApiKey) return null;
  // Image gen is OpenAI-only here; other providers fall back to their key if it's
  // an OpenAI key, else return null.
  if (cfg.aiProvider !== "openai") return null;
  try {
    const res = await timed(fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.aiApiKey}` },
      body: JSON.stringify({ model: "gpt-image-1", prompt: prompt.slice(0, 1000), n: 1, size: "1024x1024" }),
    }), 60_000);
    if (!res.ok) throw new Error(`openai-image ${res.status}`);
    const d = await res.json();
    const item = d?.data?.[0];
    if (item?.url) return item.url as string;
    if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
    return null;
  } catch (e) {
    log.error("aiImage failed", e);
    return null;
  }
}

// Default Ghost Empire chat persona for @bot. Configurable later via the DB.
export const DEFAULT_BOT_PERSONA =
  "Jesteś GhostBotem — zadziornym, dowcipnym botem czatu społeczności streamera Gh0s77tt (Ghost Empire). " +
  "Odpowiadasz PO POLSKU, krótko (max 2 zdania), z humorem i streamerskim slangiem, bez przekleństw i bez obrażania. " +
  "Nie wymyślasz faktów o widzach. Jeśli ktoś pyta o komendy, wspomnij !portal / !sklep / !ranking.";

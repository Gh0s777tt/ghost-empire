// src/lib/integrations.ts
// Server-side reader for runtime/feature API keys (pasted in /admin#integrations).
// DB value overrides the env fallback, so existing env-based setups keep working and
// on-site keys take precedence. NEVER import this into client components.
import { prisma } from "@/lib/prisma";

export type IntegrationConfig = {
  aiProvider: string;
  aiApiKey: string | null;
  aiModel: string | null;
  sentryDsn: string | null;
  obsWebsocketUrl: string | null;
  obsWebsocketPassword: string | null;
};

export async function getIntegrationConfig(): Promise<IntegrationConfig> {
  const c = await prisma.integrationConfig.findUnique({ where: { id: "default" } });
  return {
    aiProvider: c?.aiProvider ?? "anthropic",
    aiApiKey: c?.aiApiKey || process.env.AI_API_KEY || null,
    aiModel: c?.aiModel || null,
    sentryDsn: c?.sentryDsn || process.env.SENTRY_DSN || null,
    obsWebsocketUrl: c?.obsWebsocketUrl || null,
    obsWebsocketPassword: c?.obsWebsocketPassword || null,
  };
}

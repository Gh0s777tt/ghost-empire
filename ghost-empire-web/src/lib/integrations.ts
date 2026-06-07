// src/lib/integrations.ts
// Server-side reader for runtime/feature API keys (pasted in /admin#integrations).
// DB value overrides the env fallback, so existing env-based setups keep working and
// on-site keys take precedence. NEVER import this into client components.
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { currentTenantId } from "@/lib/tenant";

export type IntegrationConfig = {
  aiProvider: string;
  aiApiKey: string | null;
  aiModel: string | null;
  sentryDsn: string | null;
  obsWebsocketUrl: string | null;
  obsWebsocketPassword: string | null;
};

export async function getIntegrationConfig(): Promise<IntegrationConfig> {
  // Per-tenant config (Phase 3). Before the tenant exists (pre-backfill) or outside a
  // request, tid is null → fall back to the legacy singleton row so prod keeps working.
  const tid = await currentTenantId();
  const c = tid
    ? await prisma.integrationConfig.findFirst({ where: { tenantId: tid } })
    : await prisma.integrationConfig.findUnique({ where: { id: "default" } });
  return {
    aiProvider: c?.aiProvider ?? process.env.AI_PROVIDER ?? "anthropic",
    aiApiKey: decryptSecret(c?.aiApiKey) || process.env.AI_API_KEY || null,
    aiModel: c?.aiModel || process.env.AI_MODEL || null,
    sentryDsn: decryptSecret(c?.sentryDsn) || process.env.SENTRY_DSN || null,
    obsWebsocketUrl: c?.obsWebsocketUrl || null,
    obsWebsocketPassword: decryptSecret(c?.obsWebsocketPassword) || null,
  };
}

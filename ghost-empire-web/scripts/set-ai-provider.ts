// scripts/set-ai-provider.ts
// Set the AI provider + model in IntegrationConfig (plaintext columns — the key
// itself stays in env). Reads AI_PROVIDER / AI_MODEL from env.
//   AI_PROVIDER=openai AI_MODEL=gpt-4o-mini npx tsx scripts/set-ai-provider.ts
import { prisma } from "../src/lib/prisma";

async function main() {
  const aiProvider = process.env.AI_PROVIDER || "openai";
  const aiModel = process.env.AI_MODEL || null;
  await prisma.integrationConfig.upsert({
    where: { id: "default" },
    create: { id: "default", aiProvider, aiModel },
    update: { aiProvider, aiModel },
  });
  console.log("[set-ai-provider] provider:", aiProvider, "model:", aiModel);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

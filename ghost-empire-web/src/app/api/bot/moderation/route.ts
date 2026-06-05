// src/app/api/bot/moderation/route.ts
// Public GET consumed by the chat bot (ghost-empire-chat). Returns the global
// automod config so the bot can run lib/moderation.ts detectors and enforce the
// chosen action. Mirrors /api/bot/config (public, read-only, enabled-aware).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const c = await prisma.moderationConfig.findUnique({ where: { id: "default" } });

  // Not configured yet, or master switch off → bot does nothing.
  if (!c || !c.enabled) {
    return NextResponse.json({ enabled: false });
  }

  return NextResponse.json({
    enabled: true,
    exempt: { subs: c.exemptSubs, vips: c.exemptVips, mods: c.exemptMods },
    rules: {
      profanity: c.profanityEnabled
        ? { words: c.profanityWords, regex: c.profanityRegex, action: c.profanityAction, timeoutSecs: c.profanityTimeoutSecs }
        : null,
      link: c.linkEnabled
        ? { whitelist: c.linkWhitelist, allowSubs: c.linkAllowSubs, action: c.linkAction, timeoutSecs: c.linkTimeoutSecs }
        : null,
      caps: c.capsEnabled
        ? { minLetters: c.capsMinLetters, maxRatio: c.capsMaxRatioPct / 100, action: c.capsAction, timeoutSecs: c.capsTimeoutSecs }
        : null,
      length: c.lengthEnabled
        ? { maxChars: c.lengthMax, action: c.lengthAction, timeoutSecs: c.lengthTimeoutSecs }
        : null,
      repeat: c.repeatEnabled
        ? { charRun: c.repeatCharRun, wordRun: c.repeatWordRun, action: c.repeatAction, timeoutSecs: c.repeatTimeoutSecs }
        : null,
      zalgo: c.zalgoEnabled
        ? { maxRatio: c.zalgoMaxRatioPct / 100, action: c.zalgoAction, timeoutSecs: c.zalgoTimeoutSecs }
        : null,
    },
  });
}

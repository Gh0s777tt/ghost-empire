// src/app/api/gt-games/mines/cashout/route.ts
// Cash out an active Mines session: pays bet × current multiplier (atomic, single-claim via GETDEL).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { minesCashout } from "@/lib/gt-mines";
import { casinoGate } from "@/lib/compliance";

export async function POST(req: Request) {
  // §7 ust. 12 zakazuje mechaniki i nazewnictwa kasynowego — patrz lib/compliance.ts.
  const blocked = casinoGate();
  if (blocked) return blocked;

  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);

  let body: { sessionId?: string };
  try { body = await req.json(); } catch { return jsonError("Nieprawidłowe dane", 400); }

  const rl = await rateLimit(`mines:cashout:${session.user.id}`, 30, 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));

  const result = await minesCashout(session.user.id, String(body.sessionId ?? ""));
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json(result);
}

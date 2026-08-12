// Co-op heist on the free casino CHIPS (żetony — not the portal's %gt%): !heist <bet> opens
// or joins a crew; after a ~90s window the heist resolves (collective roll, odds scale with
// crew size). The bot only parses + calls the portal (Bearer BOT_SECRET); all chip
// escrow/payout + atomicity are server-side in lib/heist.ts.
// When THIS bot opens a heist, the portal returns resolveInMs + heistId and the bot schedules
// the resolution call, posting the result back to the same platform's chat.
import { env } from "./env";
import { sendTo } from "./broadcast";
import { onShutdown, trackInFlight } from "./shutdown";

export function isHeistTrigger(message: string): boolean {
  return /^!heist\b/i.test(message.trim());
}

type HeistResp = { message?: string; ok?: boolean; resolveInMs?: number; heistId?: string };

async function callHeistApi(payload: Record<string, unknown>): Promise<HeistResp | null> {
  try {
    const r = await fetch(`${env.portalUrl}/api/bot/heist`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.botSecret}` },
      body: JSON.stringify(payload),
    });
    return r.ok ? ((await r.json()) as HeistResp) : null;
  } catch {
    return null;
  }
}

/** Every heist call moves chips server-side, so a shutdown waits for one already on the wire. */
function postHeist(payload: Record<string, unknown>): Promise<HeistResp | null> {
  return trackInFlight(callHeistApi(payload));
}

// Resolutions whose join window has not closed yet, keyed by heistId. Tracked (instead of a
// bare setTimeout) so a restart can flush them — see the shutdown drain below. An entry is
// consumed exactly once: whichever of the timer / the drain gets there first deletes it.
const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; platform: string }>();

async function resolveHeist(heistId: string): Promise<void> {
  const entry = pending.get(heistId);
  if (!entry) return; // already resolved — the timer and the drain must never double-resolve
  clearTimeout(entry.timer);
  pending.delete(heistId);
  const res = await postHeist({ action: "resolve", platform: entry.platform, heistId });
  if (res?.message) await sendTo(entry.platform, res.message);
}

// SIGTERM/SIGINT: the timers above live only in this process's memory while the crew's chips
// are already escrowed in the portal, so dropping a pending resolution strands the stake and
// posts nothing to chat (this is the concrete data loss `docker stop` used to cause). Resolving
// a few seconds EARLY only shortens the join window; not resolving at all is the real damage.
onShutdown("heist", async () => {
  const open = [...pending.keys()];
  if (open.length === 0) return;
  console.log(`[heist] shutdown — resolving ${open.length} pending heist(s) now`);
  await Promise.all(open.map((id) => resolveHeist(id)));
});

export async function handleHeist(
  platform: string,
  platformUserId: string | undefined,
  username: string | undefined,
  message: string,
): Promise<string | null> {
  const u = username ?? "widz";
  const m = message.trim().match(/^!heist\s+(\d+)/i);
  if (!m) {
    // "żetony", NOT the portal's token name: heists escrow the FREE casino chips
    // (lib/heist.ts moves `chips`), and per terms §3 chips are a separate, platform-wide
    // currency from the tenant-named %gt% — so this word is brand-neutral by design.
    return /^!heist\b/i.test(message.trim())
      ? `@${u} napad na żetony: wpisz !heist 100 — im większa ekipa, tym większa szansa na łup! 🦝`
      : null;
  }
  const bet = parseInt(m[1], 10);
  const d = await postHeist({ action: "join", platform, platformUserId, username, bet });
  if (!d) return null;

  // If this call OPENED a new heist, schedule its resolution and post the result to chat.
  if (d.resolveInMs && d.heistId) {
    const heistId = d.heistId;
    const timer = setTimeout(() => void resolveHeist(heistId), d.resolveInMs + 500); // small grace so the join window is definitely closed
    pending.set(heistId, { timer, platform });
  }

  return typeof d.message === "string" ? d.message : null;
}

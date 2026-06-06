// Cross-platform send registry + a chat-activity signal.
// Each platform module registers its "say" function here; features that post
// proactively (timers, and later welcome/song-requests) broadcast to all active
// platforms without importing them directly (avoids circular deps).
type Sender = (text: string) => void | Promise<void>;

const senders = new Map<string, Sender>();
let lastActivityAt = 0;

export function registerSender(platform: string, fn: Sender): void {
  senders.set(platform, fn);
}

/** Send to a single platform (e.g. a delayed heist resolution back to its own chat). */
export async function sendTo(platform: string, text: string): Promise<void> {
  const fn = senders.get(platform);
  if (!fn) return;
  try {
    await fn(text);
  } catch {
    /* a single platform's send failure must not block anything */
  }
}

export async function broadcast(text: string): Promise<void> {
  await Promise.all(
    [...senders.values()].map(async (fn) => {
      try {
        await fn(text);
      } catch {
        /* a single platform's send failure must not block the others */
      }
    }),
  );
}

export function activePlatforms(): string[] {
  return [...senders.keys()];
}

/** Called on every incoming chat message so timers fire only when chat is active. */
export function markActivity(): void {
  lastActivityAt = Date.now();
}

export function recentlyActive(windowMs: number): boolean {
  return lastActivityAt > 0 && Date.now() - lastActivityAt < windowMs;
}

// FAQ / auto-responses — bot replies when a message CONTAINS a keyword (not only
// !commands). Fetched from the portal (/api/bot/faq) on a timer, cached. Used as a
// fallback after explicit commands in each platform's message handler.
import { env } from "./env";

type Faq = { keyword: string; matchType: string; response: string; cooldownSec: number };

const REFRESH_EVERY_MS = 2 * 60 * 1000;

let faqs: Faq[] = [];
const lastUsed = new Map<string, number>();

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function refreshFaqs(): Promise<void> {
  try {
    const res = await fetch(`${env.portalUrl}/api/bot/faq`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      faqs?: { keyword: string; matchType: string; response: string; cooldownSeconds: number }[];
    };
    if (Array.isArray(data.faqs)) {
      faqs = data.faqs.map((f) => ({
        keyword: f.keyword.toLowerCase(),
        matchType: f.matchType,
        response: f.response,
        cooldownSec: f.cooldownSeconds,
      }));
      console.log(`[faq] loaded ${faqs.length} from portal`);
    }
  } catch {
    /* keep current list on error */
  }
}

export function startFaqSync(): void {
  void refreshFaqs();
  setInterval(() => void refreshFaqs(), REFRESH_EVERY_MS);
}

/** Returns the response of the first matching FAQ that's off cooldown, else null. */
export function matchFaq(message: string): string | null {
  const text = message.toLowerCase();
  const now = Date.now();
  for (const f of faqs) {
    const hit =
      f.matchType === "word"
        ? new RegExp(`(^|\\W)${escapeRegex(f.keyword)}(\\W|$)`).test(text)
        : text.includes(f.keyword);
    if (!hit) continue;
    const key = `${f.matchType}:${f.keyword}`;
    // `continue`, nie `return null` (audyt 2026-08, finding low/7): wcześniejszy early-return
    // uciszał CAŁĄ resztę listy, gdy pierwszy trafiony FAQ był na cooldownie — szeroki keyword
    // (np. "jak") wyłączał bardziej specyficzne wpisy, a że iterujemy w kolejności wierszy
    // z portalu, zachowanie zależało od kolejności ustawionej przez admina. Docstring od zawsze
    // obiecywał "pierwszy pasujący FAQ, który jest POZA cooldownem" — teraz kod to robi.
    if (now - (lastUsed.get(key) ?? 0) < f.cooldownSec * 1000) continue; // matched but cooling down — try the rest
    lastUsed.set(key, now);
    return f.response;
  }
  return null;
}

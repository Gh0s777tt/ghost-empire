// Welcome greetings — greet a viewer's FIRST message of the current bot session.
// Config (enabled + template) is managed in the portal (/admin#welcome). Greeting
// goes out on the same platform the viewer spoke on.
import { env } from "./env";

const REFRESH_EVERY_MS = 2 * 60 * 1000;

let enabled = false;
let template = "Witaj {user}! Miło Cię widzieć 👋";
let bonusTokens = 0;
const greeted = new Set<string>(); // `${platform}:${userId}` already welcomed this session
// Ograniczenie pamięci w długożyjącym procesie (Docker restart:unless-stopped): bez capa
// zbiór rósłby z każdym UNIKALNYM widzem. Przy przekroczeniu limitu usuwamy najstarszy
// wpis (Set trzyma kolejność wstawiania) — skrajny przypadek to ponowne powitanie po
// bardzo długim streamie, akceptowalne wobec nieograniczonego wzrostu RSS.
const MAX_GREETED = 5000;

export async function refreshWelcome(): Promise<void> {
  try {
    const res = await fetch(`${env.portalUrl}/api/bot/welcome`);
    if (!res.ok) return;
    const data = (await res.json()) as { enabled?: boolean; template?: string; bonusTokens?: number };
    enabled = !!data.enabled;
    if (data.template) template = data.template;
    bonusTokens = typeof data.bonusTokens === "number" ? data.bonusTokens : 0;
  } catch {
    /* keep current config */
  }
}

export function startWelcomeSync(): void {
  void refreshWelcome();
  setInterval(() => void refreshWelcome(), REFRESH_EVERY_MS);
}

/** GT to award once per viewer per session on their first message (0 = off). */
export function welcomeBonus(): number {
  return bonusTokens;
}

/** Returns a greeting the first time a viewer speaks this session, else null. */
export function welcomeMessage(platform: string, userId: string, username: string | undefined): string | null {
  if (!enabled) return null;
  const key = `${platform}:${userId}`;
  if (greeted.has(key)) return null;
  if (greeted.size >= MAX_GREETED) {
    const oldest = greeted.values().next().value;
    if (oldest !== undefined) greeted.delete(oldest);
  }
  greeted.add(key);
  return template.replace(/\{user\}/gi, username || "widzu");
}

// Welcome greetings — greet a viewer's FIRST message of the current bot session.
// Config (enabled + template) is managed in the portal (/admin#welcome). Greeting
// goes out on the same platform the viewer spoke on.
import { env } from "./env";

const REFRESH_EVERY_MS = 2 * 60 * 1000;

let enabled = false;
let template = "Witaj {user}! Miło Cię widzieć 👋";
const greeted = new Set<string>(); // `${platform}:${userId}` already welcomed this session

export async function refreshWelcome(): Promise<void> {
  try {
    const res = await fetch(`${env.portalUrl}/api/bot/welcome`);
    if (!res.ok) return;
    const data = (await res.json()) as { enabled?: boolean; template?: string };
    enabled = !!data.enabled;
    if (data.template) template = data.template;
  } catch {
    /* keep current config */
  }
}

export function startWelcomeSync(): void {
  void refreshWelcome();
  setInterval(() => void refreshWelcome(), REFRESH_EVERY_MS);
}

/** Returns a greeting the first time a viewer speaks this session, else null. */
export function welcomeMessage(platform: string, userId: string, username: string | undefined): string | null {
  if (!enabled) return null;
  const key = `${platform}:${userId}`;
  if (greeted.has(key)) return null;
  greeted.add(key);
  return template.replace(/\{user\}/gi, username || "widzu");
}

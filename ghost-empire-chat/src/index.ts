import { startBrandingSync } from "./branding";
import { startCommandSync } from "./commands";
import { startFaqSync } from "./faq";
import { startWelcomeSync } from "./welcome";
import { startTimers } from "./timers";
import { startModerationSync } from "./moderation";
import { startBetAnnounce } from "./betAnnounce";
import { startEmojiCombo } from "./emojiCombo";
import { startHeartbeat } from "./heartbeat";
import { startTwitch } from "./twitch";
import { startKick } from "./kick";
import { startYouTube } from "./youtube";

console.log("[ghost-empire-chat] starting…");
// AWAITED first, and before any chat client connects: every viewer-facing string
// below names this portal's currency, so the branding must be resolved before the
// bot can say anything. Timeout-bounded (see branding.ts) so a dead portal delays
// boot by seconds instead of blocking it.
await startBrandingSync();

startCommandSync();
startFaqSync();
startWelcomeSync();
startTimers();
startModerationSync();
startBetAnnounce();
startEmojiCombo();
startHeartbeat();
void startTwitch();
void startKick();
void startYouTube();

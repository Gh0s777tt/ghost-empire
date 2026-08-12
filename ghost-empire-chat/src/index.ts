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
import { installShutdownHandlers } from "./shutdown";

console.log("[ghost-empire-chat] starting…");
// First of all: `docker run --restart unless-stopped` means every redeploy is a SIGTERM
// followed by SIGKILL ~10 s later. Arm the drain BEFORE anything can schedule work, so a
// stop during boot still flushes instead of stranding an escrowed heist (see shutdown.ts).
installShutdownHandlers();
startBrandingSync(); // first: warms this portal's currency naming before any chat copy is built
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

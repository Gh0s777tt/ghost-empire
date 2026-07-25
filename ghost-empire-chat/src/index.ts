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

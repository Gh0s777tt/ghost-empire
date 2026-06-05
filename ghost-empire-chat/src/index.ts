import { startCommandSync } from "./commands";
import { startFaqSync } from "./faq";
import { startWelcomeSync } from "./welcome";
import { startTimers } from "./timers";
import { startModerationSync } from "./moderation";
import { startTwitch } from "./twitch";
import { startKick } from "./kick";
import { startYouTube } from "./youtube";

console.log("[ghost-empire-chat] starting…");
startCommandSync();
startFaqSync();
startWelcomeSync();
startTimers();
startModerationSync();
void startTwitch();
void startKick();
void startYouTube();

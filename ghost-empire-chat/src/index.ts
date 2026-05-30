import { startCommandSync } from "./commands";
import { startFaqSync } from "./faq";
import { startTimers } from "./timers";
import { startTwitch } from "./twitch";
import { startKick } from "./kick";
import { startYouTube } from "./youtube";

console.log("[ghost-empire-chat] starting…");
startCommandSync();
startFaqSync();
startTimers();
void startTwitch();
void startKick();
void startYouTube();

import { startCommandSync } from "./commands";
import { startTimers } from "./timers";
import { startTwitch } from "./twitch";
import { startKick } from "./kick";
import { startYouTube } from "./youtube";

console.log("[ghost-empire-chat] starting…");
startCommandSync();
startTimers();
void startTwitch();
void startKick();
void startYouTube();

import { startCommandSync } from "./commands";
import { startTwitch } from "./twitch";
import { startKick } from "./kick";
import { startYouTube } from "./youtube";

console.log("[ghost-empire-chat] starting…");
startCommandSync();
void startTwitch();
void startKick();
void startYouTube();

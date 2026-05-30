import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  portalUrl: req("PORTAL_URL"),
  botSecret: req("BOT_SECRET"),
  twitch: {
    username: req("TWITCH_BOT_USERNAME"),
    channel: req("TWITCH_CHANNEL"),
    oauth: process.env.TWITCH_BOT_OAUTH || undefined, // "oauth:xxxx" from `npm run auth:twitch`
    clientId: process.env.TWITCH_CLIENT_ID || undefined,
    clientSecret: process.env.TWITCH_CLIENT_SECRET || undefined,
    refreshToken: process.env.TWITCH_BOT_REFRESH || undefined,
  },
  // Kick is optional: if unconfigured, startKick() no-ops and the Twitch bot
  // keeps running. Reading chat uses an unauthenticated Pusher websocket;
  // sending replies uses the official API (chat:write) via `npm run auth:kick`.
  kick: {
    channel: process.env.KICK_CHANNEL || undefined, // channel slug, used to look up the chatroom id
    chatroomId: process.env.KICK_CHATROOM_ID || undefined, // optional explicit override
    broadcasterId: process.env.KICK_BROADCASTER_ID || undefined, // streamer's user id — required to send replies (type:"user")
    pusherKey: process.env.KICK_PUSHER_KEY || "32cbd69e4b950bf97679", // Kick's public Pusher app key (override if it rotates)
    clientId: process.env.KICK_CLIENT_ID || undefined,
    clientSecret: process.env.KICK_CLIENT_SECRET || undefined,
    token: process.env.KICK_BOT_TOKEN || undefined, // access token from `npm run auth:kick`
    refreshToken: process.env.KICK_BOT_REFRESH || undefined,
  },
  // YouTube is optional (Option C: authorized as the channel account). liveBroadcasts.list
  // auto-detects the active broadcast's liveChatId cheaply; the bot posts as the channel.
  youtube: {
    clientId: process.env.GOOGLE_CLIENT_ID || undefined,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || undefined,
    refreshToken: process.env.YOUTUBE_BOT_REFRESH_TOKEN || undefined, // from `npm run auth:youtube`
  },
};

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
};

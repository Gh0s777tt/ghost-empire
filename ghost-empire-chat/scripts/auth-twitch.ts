// One-time: get a chat OAuth token for the Twitch BOT account.
// Run: npm run auth:twitch  → log in as the bot, authorize, copy the token to .env.
import "dotenv/config";
import http from "node:http";

const clientId = process.env.TWITCH_CLIENT_ID;
const clientSecret = process.env.TWITCH_CLIENT_SECRET;
const redirectUri = "http://localhost:3000";
const scopes = "chat:read chat:edit";

if (!clientId || !clientSecret) {
  console.error("Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const authUrl =
  `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${clientId}` +
  `&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;

console.log("\n1) In the Twitch bot app (dev.twitch.tv) add this Redirect URI: " + redirectUri);
console.log("2) Log into the BOT account in your browser, then open this URL:\n\n" + authUrl + "\n");

const server = http.createServer(async (request, response) => {
  const code = new URL(request.url ?? "", redirectUri).searchParams.get("code");
  if (!code) {
    response.end("Waiting for Twitch redirect…");
    return;
  }
  try {
    const r = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    const data = (await r.json()) as { access_token?: string; refresh_token?: string };
    if (data.access_token) {
      console.log("\n✅ Paste this into .env as TWITCH_BOT_OAUTH:\n");
      console.log("oauth:" + data.access_token);
      console.log("\n(refresh token, save for later auto-refresh: " + (data.refresh_token ?? "n/a") + ")\n");
      response.end("Done — check your terminal. You can close this tab.");
    } else {
      console.error("Token exchange failed:", data);
      response.end("Failed — check terminal.");
    }
  } catch (e) {
    console.error(e);
    response.end("Error — check terminal.");
  } finally {
    setTimeout(() => server.close(), 1500);
  }
});

server.listen(3000, () => console.log("Listening on " + redirectUri + " …\n"));

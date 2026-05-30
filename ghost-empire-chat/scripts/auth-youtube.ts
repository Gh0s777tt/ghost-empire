// One-time: get a YouTube OAuth refresh token for the CHANNEL account (Option C).
// Run: npm run auth:youtube  → log in as the channel, authorize, copy the token to .env.
import "dotenv/config";
import http from "node:http";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = "http://localhost:3000";
const scope = "https://www.googleapis.com/auth/youtube.force-ssl"; // read + post live chat

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.");
  process.exit(1);
}

// access_type=offline + prompt=consent are REQUIRED to receive a refresh_token.
const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
  }).toString();

console.log(
  "\n1) In Google Cloud Console (the portal's OAuth app): enable 'YouTube Data API v3', add Redirect URI " +
    redirectUri +
    ", and add the channel account as a Test user (if the consent screen is in Testing).",
);
console.log("2) Log into the CHANNEL account (@Gh0s77tt) in your browser, then open:\n\n" + authUrl + "\n");

const server = http.createServer(async (request, response) => {
  const code = new URL(request.url ?? "", redirectUri).searchParams.get("code");
  if (!code) {
    response.end("Waiting for Google redirect…");
    return;
  }
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const data = (await r.json()) as { refresh_token?: string; access_token?: string };
    if (data.refresh_token) {
      console.log("\n✅ Paste this into .env:\n");
      console.log("YOUTUBE_BOT_REFRESH_TOKEN=" + data.refresh_token);
      console.log("");
      response.end("Done — check your terminal. You can close this tab.");
    } else {
      console.error("No refresh_token returned (revoke prior access or ensure prompt=consent):", data);
      response.end("No refresh token — check terminal.");
    }
  } catch (e) {
    console.error(e);
    response.end("Error — check terminal.");
  } finally {
    setTimeout(() => server.close(), 1500);
  }
});

server.listen(3000, () => console.log("Listening on " + redirectUri + " …\n"));

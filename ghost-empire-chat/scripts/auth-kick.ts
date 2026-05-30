// One-time: get a chat OAuth token for the Kick BOT account (OAuth 2.1 + PKCE).
// Run: npm run auth:kick  → log in as the bot, authorize, copy the tokens to .env.
import "dotenv/config";
import http from "node:http";
import crypto from "node:crypto";

const clientId = process.env.KICK_CLIENT_ID;
const clientSecret = process.env.KICK_CLIENT_SECRET;
const redirectUri = "http://localhost:3000";
const scopes = "user:read chat:write";

if (!clientId || !clientSecret) {
  console.error("Set KICK_CLIENT_ID and KICK_CLIENT_SECRET in .env first.");
  process.exit(1);
}

// PKCE: high-entropy verifier + its S256 challenge (Kick requires code_challenge_method=S256).
const b64url = (buf: Buffer) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const codeVerifier = b64url(crypto.randomBytes(32));
const codeChallenge = b64url(crypto.createHash("sha256").update(codeVerifier).digest());
const state = b64url(crypto.randomBytes(16));

const authUrl =
  "https://id.kick.com/oauth/authorize?" +
  new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  }).toString();

console.log("\n1) In your Kick app (dev.kick.com) add this Redirect URI: " + redirectUri);
console.log("2) Log into the BOT account in your browser, then open this URL:\n\n" + authUrl + "\n");

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "", redirectUri);
  const code = url.searchParams.get("code");
  if (!code) {
    response.end("Waiting for Kick redirect…");
    return;
  }
  if (url.searchParams.get("state") !== state) {
    console.error("State mismatch — possible CSRF, aborting.");
    response.end("State mismatch — check terminal.");
    return;
  }
  try {
    const r = await fetch("https://id.kick.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });
    const data = (await r.json()) as { access_token?: string; refresh_token?: string };
    if (data.access_token) {
      console.log("\n✅ Paste these into .env:\n");
      console.log("KICK_BOT_TOKEN=" + data.access_token);
      console.log("KICK_BOT_REFRESH=" + (data.refresh_token ?? "n/a"));
      console.log("");
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

# 🎟️ RAFFLE-BOT.md — chat-keyword raffle: wiring `ghost-empire-chat`

The web side of the chat-keyword raffle shipped in **#611 / #615** and is **dormant until the
bot calls it**. This runbook is the exact contract the sibling bot repo
(`ghost-empire-chat`) must implement. No web changes are needed — everything below already
lives in `ghost-empire-web`.

## How it works

1. A streamer creates a **raffle** event (`/admin#events`) and gives it a **chat keyword**
   (e.g. `!join`) plus optional **sub / mod ticket weights** (default 2× each).
2. Viewers type the keyword in chat. The **bot** reports each hit to the portal.
3. The portal enters the **linked** viewer into the raffle for free, granting `weight`
   tickets (subs/mods get more → higher odds). **One entry per user** — repeat hits are
   ignored. The existing crypto-secure draw already weights by ticket count, so the draw
   itself is unchanged.

## Contract (two endpoints)

### 1. Discover the active keywords — `GET /api/bot/chat-commands`

**Public GET**, no auth. The portal is resolved from the request **Host** (subdomain), so call
the per-portal base URL the bot already uses for `/api/bot/config` & `/api/bot/chat-commands`.

```jsonc
// 200 OK
{
  "commands": [ /* … existing chat commands … */ ],
  "live": true,
  "liveSince": "2026-06-21T18:00:00.000Z",
  "raffleKeywords": ["!join", "giveaway"]   // ← NEW (#615): lower-cased, de-duped, active only
}
```

The bot already polls this endpoint for commands — just **read `raffleKeywords` from the same
response** (no extra request). Treat an empty/missing array as "no active raffle". Keywords are
already lower-cased; match chat messages **case-insensitively** (a whole-message match is the
simplest and matches the web's `equals … insensitive` lookup).

### 2. Report a hit — `POST /api/internal/raffle-entry`

**Auth: `Authorization: Bearer <BOT_SECRET>`** (same secret as the other `/api/internal/*` and
`/api/bot/*` write calls — `verifyBotSecret`). Send one POST per matched chat message:

```jsonc
// Request body
{
  "keyword":  "!join",      // the matched keyword (case-insensitive on the server)
  "platform": "twitch",     // "twitch" | "kick" | "youtube" — lower-cased server-side
  "username": "viewer123",  // the chat username (NOT @-prefixed); matched case-insensitively
  "isSub":    true,          // optional — grants the raffle's sub weight
  "isMod":    false          // optional — grants the raffle's mod weight
}
```

```jsonc
// 200 OK — always 200 on a valid, authorized call:
{ "ok": true, "entered": true,  "tickets": 2 }   // entered now, granted 2 tickets
{ "ok": true, "entered": false, "tickets": 0 }   // no active raffle for that keyword,
                                                  // OR the user isn't linked,
                                                  // OR they already entered (1/user)
// 401 { "error": "Unauthorized" }   — bad/missing BOT_SECRET
// 400 { "error": "Invalid payload" } — missing keyword/platform/username
```

**Tickets granted** = `max(1, isMod ? modWeight : 0, isSub ? subWeight : 0)` — a plain viewer
gets 1, a sub/mod gets the configured weight (default 2). Only **linked** accounts (the chat
identity is connected to a portal user) are entered; everyone else is silently `entered:false`.

## Bot-side responsibilities

- **Dedupe locally** too: keep an in-memory `Set<\`${raffleKeyword}:${platform}:${username}\`>`
  per stream so you don't POST the same viewer dozens of times — the server is idempotent
  (1 entry/user) but you save needless requests. Clear it when `raffleKeywords` changes.
- **Refresh `raffleKeywords`** on your normal `chat-commands` poll cadence (e.g. every 30–60 s).
- **Multi-portal:** if the bot serves several portals, call each portal's own base URL — the
  keyword set and the entry both resolve the tenant from the Host.
- **Don't echo anything to chat** on entry (keeps it spam-free); the streamer announces winners
  after the draw in `/admin#events`.

## Minimal reference (TypeScript-ish, platform-agnostic)

```ts
const BASE = portalBaseUrl;            // e.g. https://<portal-subdomain>/
const SECRET = process.env.BOT_SECRET!;
let keywords = new Set<string>();
const seen = new Set<string>();        // `${keyword}:${platform}:${username}`

// poll alongside the existing chat-commands fetch
async function refreshRaffle() {
  const r = await fetch(`${BASE}/api/bot/chat-commands`);
  const { raffleKeywords = [] } = await r.json();
  const next = new Set<string>(raffleKeywords.map((k: string) => k.toLowerCase()));
  if ([...next].join() !== [...keywords].join()) seen.clear(); // raffle changed → reset dedupe
  keywords = next;
}

// on each chat message
async function onMessage(platform: string, username: string, text: string, isSub: boolean, isMod: boolean) {
  const kw = text.trim().toLowerCase();
  if (!keywords.has(kw)) return;
  const dedupe = `${kw}:${platform}:${username.toLowerCase()}`;
  if (seen.has(dedupe)) return;
  seen.add(dedupe);
  await fetch(`${BASE}/api/internal/raffle-entry`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify({ keyword: kw, platform, username, isSub, isMod }),
  }); // fire-and-forget; ok:true even when entered:false
}
```

## Verifying end-to-end

1. Create a raffle in `/admin#events` with keyword `!join` (active, not drawn).
2. `GET /api/bot/chat-commands` → confirm `"raffleKeywords": ["!join"]`.
3. As a **linked** viewer, type `!join` in chat → bot POSTs → expect `{ entered: true }`.
4. `/admin#events` → the raffle's ticket count rises; type `!join` again → no new ticket
   (1/user). Draw → winner is among the entrants.

> Web endpoints involved: `GET /api/bot/chat-commands` (public, Host-scoped) and
> `POST /api/internal/raffle-entry` (Bearer `BOT_SECRET`). Both are tenant-scoped
> (current portal + legacy null). See `CHANGELOG` #611 / #615.

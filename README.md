# Ghost Empire

Community portal for streamer **Gh0s77tt** — Twitch/Kick/Discord ecosystem with a token-based economy.

🌐 **Production:** https://ghost-empire-web.vercel.app
📺 **Stream:** [twitch.tv/gh0s77tt](https://twitch.tv/gh0s77tt) · [kick.com/Gh0s77tt](https://kick.com/Gh0s77tt)

## Monorepo layout

```
ghost-empire-phase1/
├── ghost-empire-web/   ← Next.js 15 portal (Vercel deploy)
└── ghost-empire-bot/   ← Discord bot (Node + discord.js)
```

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router), React 18, Tailwind CSS, Lucide icons |
| Backend | Next.js API routes, Prisma ORM, PostgreSQL (Supabase) |
| Auth | NextAuth v4 + PrismaAdapter, Twitch + Discord OAuth |
| Bot | discord.js 14, TypeScript, tsx (runtime) |
| Deploy | Vercel (web), local/Railway/Render (bot) |

## What's inside

| Feature | Path |
|---|---|
| Auth (Twitch + Discord OAuth) | `/auth/signin` |
| Shop (12 items, 5 categories) | `/shop` |
| Events (giveaway, raffle, contest, happy_hour) | `/events` |
| Ranking (4 metrics + podium) | `/ranking` |
| Profile (achievements, social links, transactions) | `/profile` |
| Achievements gallery (22 with filters + progress) | `/achievements` |
| Daily quests (3 daily + claim) | `/quests` |
| Drop codes (live stream rewards) | `/drops` |
| Admin panel (gated `isAdmin`) | `/admin` |
| Notifications widget (bell + dropdown) | header on every page |

## Security

- HSTS, X-Frame-Options, CSP, Permissions-Policy headers
- Rate limiting on all public + internal endpoints (DB-backed sliding window)
- Bot endpoint defense-in-depth: per-user + per-IP rate limits + amount caps
- Audit log of every admin action (`admin_actions` table) with IP
- Cryptographic randomness for codes and drawings (`node:crypto.randomInt`)
- Session-based auth verified server-side via fresh DB read (not cookie trust)
- Atomic transactions for all economy mutations (Prisma `$transaction`)

## Local dev

### Web

```bash
cd ghost-empire-web
cp .env.example .env
# fill in DATABASE_URL, OAuth secrets, NEXTAUTH_SECRET, BOT_SECRET
npm install
npm run db:push    # sync schema to your Supabase
npm run db:seed    # populate achievements, tasks, shop items, events
npm run dev        # → http://localhost:3000
```

### Bot

```bash
cd ghost-empire-bot
cp .env.example .env
# fill in DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, BOT_SECRET (same as web)
npm install
npm run dev
```

See `ghost-empire-web/.env.example` and `ghost-empire-bot/.env.example` for full env var list.

## License

Private — Gh0s777tt © 2026

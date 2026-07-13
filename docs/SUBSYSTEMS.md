# 🧩 SUBSYSTEMS.md — podsystemy money-critical (odds, limity, sinki)

Referencja zachowania kluczowych podsystemów Ghost Empire: kasyno, ekonomia GT,
marketplace, gifting, klany, crony oraz strategia rate-limit/cache. Liczby są **z kodu**
(`lib/*`) — przy zmianie wartości zaktualizuj też ten plik. Architektura ogólna:
[ARCHITECTURE.md](ARCHITECTURE.md); trasy: [ENDPOINTS.md](ENDPOINTS.md).

> 💰 **Zasady wspólne dla wszystkich ruchów GT:** każdy debet/kredyt idzie w jednej
> `$transaction` z warunkowym `updateMany`/`gte` (overspend niemożliwy), tam gdzie groziłby
> race — `SELECT … FOR UPDATE` lub atomowy Redis `GETDEL`/lock (`lib/redis.withLock`). GT
> są **całkowite** (zero float-money); opłaty zaokrąglają się **na korzyść domu** (`Math.ceil`).

---

## 1. Ekonomia GT — faucety i sinki

- **Faucety (skąd GT):** czat (Discord/Twitch/Kick/YT — `internal/(chat-)award`), suby/gifty/bity
  (Twitch EventSub, Kick), super chaty/membery (YT), donacje (Streamlabs/PayMedia), daily-bonus,
  daily questy, battle-pass, osiągnięcia, referrals, drop-code'y, granty admina.
- **Sinki (gdzie GT znika z obiegu):** sklep, kasyno (house edge), **5% fee marketplace**
  (spalane), predykcje/raffle, koło fortuny. Gifting i prezenty **przenoszą** GT (nie tworzą).
- **Perki mnożnika earn:** poziom (+0.5%/lvl, cap +50%) × prestiż (+2%/★, cap +50%) × happy-hour,
  liczone w `lib/economy` (`levelGtMultiplier`/`prestigeGtMultiplier`).
- **Daily-bonus:** 50 GT (dzień 1) +25/dzień, cap 200 GT (dzień 7+); jedno odebranie/dobę
  (UTC) gwarantowane unikalnym `Transaction.externalId`.
- **Referrals:** kod jednorazowy — **500 GT dla obu** stron, self-referral zablokowany.

## 2. Kasyno GT (`/kasyno`, plan ≥ `pro`)

Stawka: **10 – 100 000 GT** (`MIN_BET`/`MAX_BET`). **House edge 5 %** (RTP ≈ 95 %) we
wszystkich grach losowych. Akcje gry: `session` + `featureGate("casino")`; odczyty puli/rankingu publiczne.

| Gra | Typ | Odds / wypłata | Uwagi |
|---|---|---|---|
| Dice / Crash / Plinko / Scratch / Roulette / Coinflip / Slots | jednorzutowe | edge 5 % | `gt-games.play` — atomowy zakład |
| **Mines** | stanowa (Redis) | `Π (tiles−i)/(tiles−bombs−i) · (1−0.05)`, cap **100×** | reveal pod `withLock`; cashout = `GETDEL` |
| **Hi-Lo** | stanowa (Redis) | `(1−0.05)/P(zgadnięcia)` na trafienie, cap **100×** | guess pod `withLock` |
| **Blackjack** | stanowa (Redis) | BJ 2.5× · wygrana 2× · push 1× | hit/stand/double pod `withLock` |

- **Jackpot progresywny:** seed **5 000 GT**, **1 % każdej stawki** zasila pulę (`JACKPOT_CUT`);
  klucz Redis `jackpot:surplus`; claim refundowany, jeśli charge padnie.
- **Stanowe gry** trzymają sesję w Redis z TTL; pieniądze ruszają atomowo (charge na starcie,
  wypłata po `GETDEL`/locku — sesja nie zapłaci dwa razy, a współbieżne ruchy nie wymażą przegranej).

## 3. Karty kolekcjonerskie + marketplace P2P

- **Paczka:** **250 GT** (`PACK_PRICE`), jedna karta/paczkę, rzadkość ważona:
  **common 60 / rare 28 / epic 10 / legendary 2** (`RARITY_WEIGHT`, sum = 100).
- **Marketplace (`/market`):** wystaw/kup/anuluj za GT; karta **escrow** przy wystawieniu;
  **5 % fee spalane** na sprzedaży (`MARKET_FEE_PCT`, GT sink), max **20** aktywnych ofert/sprzedawcę.
  Listing claimowany warunkowym `UPDATE` (dwa równoległe kupna → dokładnie jedna sprzedaż).
- **Drop-code'y:** pierwsi `bonusSlots` łapaczy dostają bonus — kolejność rozstrzyga **atomowy
  licznik** `StreamDrop.claimCount` (inkrement w tx), więc dokładnie N pierwszych bierze bonus.

## 4. Gifting GT P2P (`/api/gift`)

- **1 – 5 000 GT / transfer** (`GIFT_MIN`/`GIFT_MAX_PER_TX`), **10 000 GT / 24 h** (`GIFT_DAILY_LIMIT`).
- Limit dobowy egzekwowany **w transakcji pod `SELECT … FOR UPDATE`** na nadawcy (burst nie obejdzie capa).
- Nie do siebie; odbiorca w tym samym portalu; rate-limit per IP.

## 5. Klany i wojny

- **Skarbiec** klanu (wpłaty GT), **wojny klanów** (`warPoints` z GT wpłaconych w aktywnej wojnie,
  reset przy nowej). Heist kooperacyjny: **2× stawki** przy sukcesie (`HEIST_WIN_MULT`), max **50**
  w ekipie (`HEIST_MAX_CREW`); resolve atomowo claimowany (brak double-payout). Rankingi per-tenant
  (indeksy `Clan[tenantId,treasury]` / `[tenantId,warPoints]`).

## 6. Crony (Vercel, gated `CRON_SECRET`)

| Cron | Harmonogram (UTC) | Co robi |
|---|---|---|
| `/api/cron/streamlabs-poll` | `0 6 * * *` (codziennie 06:00) | polling donacji Streamlabs |
| `/api/cron/prune` | `0 4 * * *` (codziennie 04:00) | czyszczenie starych rekordów transientowych |
| `/api/cron/weekly-rewards` | `0 0 * * 1` (pon. 00:00) | nagrody rankingu tygodnia **per portal** (1000/500/250), idempotentne przez unikalny `externalId` |

## 7. Rate-limiting i cache

- **Rate-limit** (`lib/rate-limit`): sliding-window per klucz (per-IP / per-user / per-tenant),
  z `failClosed`/`failOpen` zależnie od trasy. Pokrywa publiczne GET-y, akcje (gift/market/kasyno/
  drops/votes) oraz AI/push (cap kosztu + globalne capy na AI).
- **Cache** (`lib/redis.cacheJson`): read-through, **Upstash Redis = współdzielony między instancjami**;
  bez Redisa fallback in-memory per instancja (limit FIFO 1000). TTL dobrane per dane (overlay
  settings/token 10–30 s, ranking 45–60 s, `/support` 60 s + pageQr 5 min, semantic-search korpus 6 h).
  `withLock` (`SET NX PX` + Lua CAS release) serializuje krytyczne sekcje (sesje kasyna).
- **Pula DB = 3** (Supabase free + serverless) — stąd nacisk na cache hot-pathów, ack-first webhooków
  i timeouty na zewnętrznych fetchach.

---

> Szczegóły bezpieczeństwa: [https://gitlab.com/Gh0s777tt/ghost-empire/-/blob/main/SECURITY.md](https://gitlab.com/Gh0s777tt/ghost-empire/-/blob/main/SECURITY.md) · zmienne: [ENV.md](ENV.md) · model danych: [ARCHITECTURE.md](ARCHITECTURE.md) §9.

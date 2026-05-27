# Changelog

Wszystkie istotne zmiany w Ghost Empire są opisane w tym pliku.

Format opiera się na [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Wersje datowane (kalendarzowe) zamiast SemVer — projekt jest aplikacją, nie biblioteką.

## [Unreleased]

(Zmiany na lokalnym branchu `main`, jeszcze nie pushnięte na produkcję.)

### Docs

- **README.md przepisane** jako single source of truth — pełna lista current features (Phase 2 done), setup od zera per OAuth provider, special-case'y dla EventSub/Streamlabs/OBS, link do CHANGELOG/PHASE2/PHASE3.
- **PHASE3.md** dodany — plan stream chat bota (Twitch+Kick+YouTube) + engagement features + hardware integrations + AI, podzielone na 4 sub-fazy (3A foundation, 3B engagement, 3C alerts+hardware, 3D AI+analytics) z realistycznymi estymacjami. Wymaga akceptacji + decyzji priorytetów przed implementacją.

### Added

- **Admin merge tool dla duplikatów** — sekcja "Merge duplikatów" w `/admin#merge`. Wykrywa potencjalne duplikaty po trzech sygnałach: wspólny OAuth account ID (najsilniejszy), wspólny email, wspólny Discord ID. Dla każdej grupy pokazuje statystyki side-by-side (tokeny, level, transakcje, achievementy, donejty, daty), klik na karcie wybiera primary/secondary, preview pokazuje co się przeniesie + konflikty (Account/Connection/Achievement/SocialLink/EventEntry/DropClaim primary'a wygrywają), confirm-by-typing-username przed wykonaniem. Całość w jednym `prisma.$transaction` — atomowe ale nieodwracalne. Blokuje merge konta admina/moda (najpierw odbierz role w sekcji Użytkownicy). Audit log loguje pełen breakdown.

### Changed

- **OVERLAY_TOKEN przeniesiony z env do DB** — token overlay'a żył w Vercel env vars co zmuszało admina do ręcznej generacji + redeploya przy każdej rotacji. Teraz token siedzi w `StreamAlertSettings.overlayToken`, auto-generuje się przy pierwszym wejściu na `/admin#alerts`, jest tam widoczny z przyciskami "Pokaż / Kopiuj token / Kopiuj URL OBS / Wygeneruj nowy". Env var pozostaje jako legacy fallback. Wymaga `npm run db:push`.

### Performance

- **Parallelized admin page queries** — w `/admin` było ~10 sekwencyjnych `await prisma.*` po pierwszym Promise.all. Z `connection_limit=1` w DATABASE_URL (Supabase pgbouncer) każde query musiało czekać na poprzednie. Zlepione w jeden Promise.all → wszystko leci równolegle, czas ładowania `/admin` powinien spaść kilkukrotnie.
- **Dedup font loading** — `layout.tsx` ładowało Inter dwukrotnie (raz przez `next/font/google`, raz przez `<link>` do fonts.googleapis.com). Przeniesiony JetBrains Mono też do `next/font`, w `<head>` zostało tylko Anton (display font, brak w next/font Google Fonts subset) z `<link rel="preconnect">`. Mniej round-tripów, brak CLS na fontach.

### Added

- **Account linking from profile** — sekcja "Połączone platformy" w `/profile` pozwala zalogowanemu userowi dolinkować Twitch/Kick/Discord/Google do tego samego konta zamiast tworzyć duplikat. Bezpieczny flow: HMAC-signed `link_intent` cookie (5 min TTL) + przeniesienie Account row w signIn callback + cleanup orphan usera (jeśli brak danych ekonomicznych poza welcome bonusem). Endpoint odłączenia ma safety check — nie da się usunąć ostatniej metody logowania. ([2faeedd](#))
- **Social tiles na profilu** — kompaktowe tile'e z ikoną + handle (bez URLi). Twitch i Kick są pobierane automatycznie z OAuth Connection (badge "OAuth"); reszta (Instagram, X, TikTok, YouTube, Website) dodawana ręcznie z trybu edycji. Discord pominięty (brak publicznych profili). Cały tile = link, brand-color glow on hover. ([db66e58](#))
- **Sidebar nawigacja w `/admin`** — 11 sekcji (Dashboard, Użytkownicy, Eventy, Sklep, Drops, Harmonogram, Bot Discord, Donacje, Twitch, Stream Alerts, Audit log) zamiast jednej długiej listy. Sticky pionowy sidebar na desktop, poziomy scroll na mobile. URL hash deep-link (`/admin#shop`). Dashboard ma kafelki-skróty dla pending orders, aktywnych eventów, dropów. Sekcje filtrowane wg uprawnień moderatora. ([d89b553](#))
- **Stream Alerts (OBS overlay)** — `/overlay?token=<OVERLAY_TOKEN>` jako Browser Source dla OBS. Polling co 1.2 s, animowane slide-in alertów, syntezowany audio chime. Dispatch z 7 miejsc: shop buy, event win, drop bonus claim, Twitch sub/gift/cheer, Streamlabs donacja (matched+unmatched), welcome bonus. Admin section z testem, per-type togglami, kolorem akcentu, czasem wyświetlania. ([af7cf4a](#))

### Database

- Dodane modele `StreamAlert` (kolejka) + `StreamAlertSettings` (singleton). Wymaga `npm run db:push` po pull.
- Nowy env var `OVERLAY_TOKEN` (32-byte hex) dla bezpieczeństwa overlay URL.

---

## 2026-05-26 — Twitch EventSub + Streamlabs

### Added

- **Twitch EventSub auto-tracking** dla subów / gifted subów / bits — webhook handler z HMAC verification, replay protection (10 min window), idempotency po `message_id`. Per-tier reward (T1=5000, T2=10000, T3=25000, Prime=3000 GT), gifted subs z multipliterm tieru, bits ×10 GT. Streamer autoryzuje raz przez `/api/admin/twitch-streamer-auth`. ([4b2323a](#))
- **Streamlabs donation integration** zastępuje wcześniejszy PayMedia. OAuth flow, polling co 6h przez Vercel Cron (Hobby plan), auto-match po username lub @mention w wiadomości. 1 PLN = 100 GT konfigurowalne przez `DONATION_GT_PER_PLN`. ([c858b86](#))

### Fixed

- Streamlabs API v2.0 endpoints (v1.0 zwraca `invalid_client`). ([996c31b](#))
- Vercel cron musi być daily na Hobby plan (wcześniej hourly powodował błąd). ([a45b01d](#))

---

## 2026-05-25 — OAuth providers + ekonomia ×4 platform

### Added

- **Kick + Google OAuth** dodane jako logowanie. Kick to custom provider (brak gotowca w next-auth), Google = standardowy. ([2e4aabb](#))
- **Sticky footer** z linkami legalnymi i socialami streamera.
- **Bot config dashboard** — admin zmienia reward/cooldown bez deployu.
- **Stream schedule** — harmonogram streamów wyświetlany publicznie + zarządzanie w adminie.
- **OG images** dla social share previews (`/u/[username]`, ranking, profile). Generowane przez Satori. ([6c06c17](#))
- **Public profiles** `/u/[username]` — viewowanie cudzych profili bez logowania.
- **404 page** + privacy + terms.
- **Admin mod permissions** — granular permissions dla moderatorów (create_events, grant_tokens, ban_users, manage_shop itp). ([47ae55b](#), [4ffcf3b](#))
- **Site-level ban** — niezależne od bana na platformie, banuje w portalu. UI w adminie. ([4ffcf3b](#))
- **Admin quick-actions modal** na ranking (klik na usera → grant tokens / ban / make mod). ([bb5a68f](#))

### Fixed

- Twitch scope musi zawierać `openid` żeby odbierać `id_token`. ([7b9c57a](#))
- `allowDangerousEmailAccountLinking: true` na wszystkich 4 OAuth providerach (Twitch/Discord/Google/Kick) — pozwala automatycznie linkować po emailu jeśli match. ([2ee94ad](#))
- Kick token exchange wymaga `client_secret` w body, nie Basic auth. ([296656e](#))
- SocialLinks wymaga `"use client"` (event handlers). ([0c08819](#))
- OG images: `display: flex` explicit na text leaves (Satori strict mode). ([915a19b](#))
- OG images: rank emoji tile zamiast external img (Satori CDN issues). ([5b694fc](#))
- OG images: `await params` (Next 15 async params). ([b838508](#))

---

## Setup wymagany po pull

Po każdym pull, zweryfikuj:

1. **Migrations**: `cd ghost-empire-web && npm run db:push` (jeśli były zmiany schemy — sprawdzaj sekcję "Database" powyżej)
2. **Env vars**: `.env.example` jest źródłem prawdy — porównaj z `.env.local`
3. **Vercel env**: każdy nowy env var w `.env.example` musi być dodany do Vercel project settings
4. **Restart dev server**: po dużych refactorach HMR czasem nie odświeży — `Ctrl+C` i `npm run dev` na nowo

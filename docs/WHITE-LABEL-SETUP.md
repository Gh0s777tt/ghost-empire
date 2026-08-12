# White-label: podpięcie własnej domeny do portalu

**Status: ✅ kod gotowy (#653).** Mapowanie `Tenant.domain` → portal działa w
`getCurrentTenant` (`lib/tenant.ts`). To, czego brakuje, to **konfiguracja po stronie
właściciela** (DNS, Vercel, OAuth) — bez zmian w kodzie. Runbook na przykładzie
`empire-forge.com` (marka „E-Forge").

> Model: **jedna aplikacja na Vercel obsługuje wiele portali**, rozpoznawanych z `Host`.
> Apex/`www`/pełna własna domena → portal, którego pole `domain` pasuje; subdomena
> `<slug>.ROOT_DOMAIN` → portal po `slug`; inaczej → portal domyślny (GH0ST EMPIRE).

---

## Krok 1 — wskaż domenę na Vercel (DNS)

**Opcja A (najprościej) — nameservery Vercela:**
1. Vercel → projekt `ghost-empire-web` → Settings → Domains → dodaj `empire-forge.com`.
   Vercel pokaże 2 nameservery (np. `ns1.vercel-dns.com`, `ns2.vercel-dns.com`).
2. GoDaddy → domena `empire-forge.com` → Nameservers → „I'll use my own nameservers" →
   wklej te 2 wartości → zapisz.
3. Vercel od tej pory zarządza całym DNS + certyfikatem TLS automatycznie.

**Opcja B — zostaw DNS w GoDaddy:**
- Dodaj rekordy, które pokaże Vercel: apex `empire-forge.com` (A/ALIAS na Vercel) oraz
  (opcjonalnie) `www` jako CNAME. Dla apexu GoDaddy użyj „Forwarding" lub rekordu A
  wg instrukcji Vercela.

> `NEXT_PUBLIC_ROOT_DOMAIN` **nie jest** potrzebny dla samego apexu — to zmienna pod
> *subdomeny*. Ustaw ją tylko, jeśli później zechcesz też `<slug>.empire-forge.com`.

## Krok 2 — dodaj domenę w projekcie Vercel
W Settings → Domains projektu `ghost-empire-web` domena `empire-forge.com` musi być
**dodana i zweryfikowana** (zielony status). Bez tego Vercel nie wystawi certyfikatu i
żądania nie trafią do aplikacji — sam DNS to za mało.

## Krok 3 — przypisz domenę do portalu w panelu
1. Zaloguj się jako właściciel platformy → wejdź na `/admin#tenants` (sekcja **Tenants**;
   widoczna tylko dla Ciebie).
2. Jeśli portal E-Forge jeszcze nie istnieje — utwórz go (slug np. `e-forge`, nazwa
   „E-Forge", plan).
3. Edytuj portal → pole **„Własna domena"** → wpisz `empire-forge.com` → zapisz.
   - Wartość jest normalizowana (bez `https://`, portu, ścieżki, `www`), więc i apex, i
     `www.empire-forge.com` trafią do tego portalu.
   - Kolizja (inny portal ma już tę domenę) → błąd 409.

## Krok 4 — adresy zwrotne OAuth (krytyczne)
**Logowanie ORAZ podłączanie kont streamera** budują callback z hosta żądania (audyt 2026-08:
tak samo jak logowanie, żeby streamer podłączał WŁASNE konta na SWOIM portalu), więc dla
`empire-forge.com` dodaj w **każdej** konsoli dostawcy dokładnie te URL-e.

Logowanie użytkownika (NextAuth):
```
https://empire-forge.com/api/auth/callback/twitch
https://empire-forge.com/api/auth/callback/discord
https://empire-forge.com/api/auth/callback/google
https://empire-forge.com/api/auth/callback/kick
```
Podłączanie kont streamera (EventSub / donacje — WYMAGANE, by nie-founder podłączył swoje konta):
```
https://empire-forge.com/api/admin/twitch-streamer-auth/callback
https://empire-forge.com/api/admin/kick-streamer-auth/callback
https://empire-forge.com/api/admin/youtube-streamer-auth/callback
https://empire-forge.com/api/auth/streamlabs/callback
https://empire-forge.com/api/auth/donationalerts/callback
```
- Konsole: dev.twitch.tv · discord.com/developers · console.cloud.google.com · dev.kick.com ·
  streamlabs.com/dashboard#/settings/api-settings · www.donationalerts.com/application/clients.
- Dostawcy **nie akceptują wildcardów** — każdą domenę/subdomenę dopisujesz ręcznie.
- Pominięcie logowania → błąd `OAuthCallback`. Pominięcie streamer-auth → `redirect_uri`
  odrzucony/`unauthorized` przy podłączaniu Twitcha/Kicka/YT/Streamlabs na tej domenie.

## Krok 5 — weryfikacja
1. Otwórz `https://empire-forge.com` → powinien pokazać branding E-Forge (nie GH0ST EMPIRE).
2. Zaloguj się każdym dostawcą na tej domenie.
3. Potwierdź izolację (`docs/PER-TENANT-IDENTITY.md §6`): to samo konto Twitch na E-Forge i
   na portalu GH0ST EMPIRE = **dwa osobne konta widza** (osobne GT/poziom).

---

## Uwagi i bezpieczeństwo
- **Pierwsze logowanie właściciela portalu: użyj Google / Discord / Twitcha, nie Kicka.**
  Admina nadaje dopasowanie e-maila konta do `Tenant.ownerEmail`, a `User.email` ustawiamy
  **wyłącznie z e-maila zweryfikowanego przez providera** (`lib/oauth-email.ts`). Kick nie
  udostępnia żadnego sygnału weryfikacji, więc login przez Kicka ma `email = null` i **nie
  odpali bootstrapu admina**. To celowe: gdyby odpalał, założenie konta na cudzy
  `ownerEmail` u providera bez weryfikacji dawałoby admina cudzego portalu. Kicka dopnij
  po fakcie w `/profile` → połączenia. Szczegóły: `docs/ARCHITECTURE.md` §3.
- **Per-portal = osobne konta i GT widzów** — z założenia. Jeśli chcesz jeden wspólny
  portfel między portalami, ten model jest niepotrzebny.
- **Nie ustawiaj** wspólnej domeny ciasteczek — sesje są host-only (per domena/subdomena),
  co daje izolację. Wspólny cookie-domain zlałby portale w jedną sesję.
- **Passkeys** są przypięte do origin z `AUTH_URL` (kanoniczny apex aplikacji) — logowanie
  OAuth na własnej domenie działa normalnie; passkey na nowej domenie to osobny temat.
- **Rollback:** wyczyść pole „Własna domena" w `/admin#tenants` (→ `domain = null`) i/lub
  usuń domenę w Vercel. Apex przestaje mapować się na portal; reszta działa bez zmian.

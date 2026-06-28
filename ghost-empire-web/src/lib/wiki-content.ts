// src/lib/wiki-content.ts
// Treść wiki platformy (#745). Czysta struktura danych (PL) — używana przez stronę
// /wiki oraz generator PDF, żeby treść miała jedno źródło. Zrzuty ekranu leżą w
// public/wiki/screens/<shot>.jpg. Pozycje bez `shot` renderują się bez obrazka.

export type WikiItem = {
  title: string;
  route?: string;
  desc: string;
  steps?: string[];
  shot?: string;
};
export type WikiGroup = { id: string; title: string; intro?: string; items: WikiItem[] };
export type CommandItem = { cmd: string; desc: string; who: string };
export type CommandGroup = { title: string; items: CommandItem[] };

export const WIKI_INTRO = {
  title: "Ghost Empire / E-Forge — Wiki platformy",
  lead:
    "Kompletny przewodnik po platformie: wielo‑tenantowy, white‑label system lojalnościowy dla streamerów. " +
    "Widzowie zbierają tokeny (GT) za aktywność na Twitch / Kick / YouTube / Discord i wymieniają je w sklepie, " +
    "kasynie, predykcjach, eventach i battle passie. Streamer konfiguruje cały portal z jednego panelu.",
  bullets: [
    "Dla widzów: jak zdobywać GT i z czego korzystać (sekcja „Dla widzów”).",
    "Dla streamerów: jak skonfigurować portal krok po kroku (sekcja „Panel streamera”).",
    "Komendy czatu działające na Twitch, Kick i YouTube (sekcja „Komendy”).",
    "Dla developerów: stack, architektura, uruchomienie (sekcja „Dla developerów” + osobny PDF).",
  ],
};

export const VIEWER_GROUPS: WikiGroup[] = [
  {
    id: "ekonomia",
    title: "Ekonomia i progresja",
    intro: "Rdzeń platformy — waluta GT, poziomy i codzienne nagrody. Dostępne w każdym planie (także darmowym).",
    items: [
      { title: "Tokeny (GT) i saldo", desc: "Wirtualna waluta portalu. Zdobywasz GT za czat, oglądanie, suby, donejty i questy — saldo widać zawsze w nagłówku. Nazwa i symbol waluty są ustawiane przez streamera (np. „Ghost Tokens / GT”).", shot: "pub-home-dashboard" },
      { title: "Bonus dzienny", desc: "Darmowa porcja GT raz na dobę. Im dłuższa seria dni z odbiorem, tym większy bonus; pominięty dzień resetuje serię.", steps: ["Zaloguj się i kliknij pulsującą ikonę prezentu w nagłówku", "GT dolicza się od razu, licznik serii rośnie"] },
      { title: "Poziomy, XP i prestiż", route: "/u/[username]", desc: "Aktywność daje XP i podnosi poziom (do 100). Po maksymalnym poziomie zdobywasz gwiazdki prestiżu (Phantom Ascension) z dodatkowymi perkami." },
      { title: "Questy / zadania dzienne", route: "/quests", desc: "Codzienne cele (oglądaj, głosuj, graj). Po ukończeniu odbierasz GT; zaliczenie wszystkich daje bonus mnożnikowy. Reset o północy w strefie streamera.", steps: ["Wejdź na /quests", "Wykonuj zadania — postęp liczy się automatycznie", "Kliknij „Odbierz” przy ukończonym zadaniu"], shot: "pub-quests" },
      { title: "Osiągnięcia", route: "/achievements", desc: "Odznaki za kamienie milowe (rzadkości: pospolite → legendarne). Widać Twój status i globalny procent graczy, którzy je zdobyli.", shot: "pub-achievements" },
      { title: "Sklep", route: "/shop", desc: "Wydawaj GT na kosmetyki i nagrody. Pozycje mogą wymagać poziomu, subskrypcji, prestiżu lub osiągnięcia. Cena i wymagania są zawsze widoczne.", steps: ["Wejdź na /shop", "Sprawdź wymagania i swoje saldo", "Kliknij „Kup”"], shot: "pub-shop" },
      { title: "Drop kody", route: "/drops", desc: "Jednorazowe kody ogłaszane na streamie dające bonus GT. Wpisz kod, odbierz natychmiast. Historia odbiorów jest zapisywana.", steps: ["Wejdź na /drops", "Wpisz kod z streama", "Kliknij „Odbierz”"], shot: "pub-drops" },
      { title: "Polecenia (referrals)", route: "/profile", desc: "Zaproś znajomych swoim kodem — gdy dołączą i osiągną próg, oboje dostajecie GT. Licznik i nagrody w sekcji Referrals na profilu." },
      { title: "Seria oglądania i lojalność", desc: "Codzienny check‑in buduje serię dni oglądania. Progi 3/7/14/30 dni dają GT, a tiery lojalności (🥉🥈🥇💎) pojawiają się jako odznaka na profilu." },
      { title: "Prezenty GT (P2P)", desc: "Wyślij GT innemu widzowi z jego profilu publicznego — atomowy transfer z limitami dziennymi, miły gest wsparcia." },
    ],
  },
  {
    id: "gry",
    title: "Gry i zakłady",
    intro: "Rozrywka za GT. Wszystkie wyniki rozstrzyga serwer (uczciwe, bez manipulacji po stronie klienta).",
    items: [
      { title: "Kasyno — 10 gier", route: "/kasyno", desc: "Sloty, Moneta, Ruletka, Kości, Crash (rakieta), Plinko, Mines, Blackjack, Hi‑Lo i Zdrapki. Ustawiasz zakład (10–100 000 GT), grasz wg zasad danej gry, wygrane dolicza się od razu. Jest leaderboard, historia i progresywny jackpot.", steps: ["Wybierz grę w lobby", "Ustaw zakład", "Graj zgodnie z instrukcją gry (obstaw / zakręć / cash‑out)"], shot: "pub-kasyno" },
      { title: "Koło Fortuny", route: "/wheel", desc: "Zakręć kołem o segmenty z nagrodami (GT lub kosmetyki). Każdy spin kosztuje GT; segmenty i koszt ustawia streamer.", shot: "pub-wheel" },
      { title: "Predykcje", route: "/predictions", desc: "Obstawiaj GT na wynik (np. „Czy wygrasz next mapę?”). Otwarte → przyjmują zakłady, zablokowane → czekają na rozstrzygnięcie, rozstrzygnięte → pokazują wypłaty. Widać Twój bilans typera.", shot: "pub-predictions" },
      { title: "Trivia / Quiz", route: "/trivia", desc: "Odpowiadaj na pytania i zgarniaj GT za poprawne. Pytania zmienia streamer; trackowany jest Twój wynik i seria.", shot: "pub-trivia" },
      { title: "Ankiety", route: "/polls", desc: "Darmowe głosowania społeczności (bez GT) — wybór gry, decyzje streamowe, sondy. Wyniki na żywo.", shot: "pub-polls" },
      { title: "Liga Typerów", route: "/leagues", desc: "Sezonowy ranking najlepszych typerów wg skuteczności i bilansu GT. Koniec miesiąca nagradza top 3 i trafia do Galerii Sław. Masz osobistą kartę „Twój sezon”.", shot: "pub-leagues" },
      { title: "Bounties (wyzwania)", route: "/bounties", desc: "Widzowie zrzucają GT na wyzwanie dla streamera. Wykona → pula idzie do wspierających (sink), termin minie → pełny zwrot. Możesz wesprzeć cudze lub stworzyć własne.", steps: ["Wejdź na /bounties", "Kliknij „Wesprzyj” i podaj kwotę GT", "GT jest w escrow do rozstrzygnięcia"], shot: "pub-bounties" },
    ],
  },
  {
    id: "spolecznosc",
    title: "Społeczność",
    intro: "Funkcje budujące zaangażowanie i rywalizację między widzami.",
    items: [
      { title: "Ranking", route: "/ranking", desc: "Globalny leaderboard z zakładkami: tokeny, zarobione łącznie, tygodniowo, poziom, seria. Top 100 + Twoja pozycja; klik w nick → profil.", shot: "pub-ranking" },
      { title: "Klany i Wojny Klanów", route: "/clans", desc: "Gildie widzów ze skarbcem i rolami. Twórz/dołączaj, wpłacaj do skarbca, rywalizuj w sezonowych wojnach o trofea.", shot: "pub-clans" },
      { title: "Companion (Widmo)", route: "/companion", desc: "Cyfrowy pupil karmiony GT — zdobywa XP i ewoluuje przez etapy. Widoczny na Twoim profilu publicznym.", shot: "pub-companion" },
      { title: "Karty kolekcjonerskie", route: "/collectibles", desc: "Zbieraj karty z paczek za GT (rzadkości pospolite → legendarne). Duplikaty sprzedasz; kolekcję pokazujesz na profilu.", shot: "pub-collectibles" },
      { title: "Marketplace (P2P)", route: "/market", desc: "Handel kartami między graczami za GT. Wystawiasz cenę, kupujący płaci GT, karta wędruje atomowo (5% prowizji spalane = sink).", shot: "pub-market" },
      { title: "Klipy / Klip tygodnia", route: "/clips", desc: "Tygodniowe głosowanie na najlepszy klip streamera. Zwycięzca jest wyróżniany. Jeden głos na tydzień.", shot: "pub-clips" },
      { title: "Eventy i raffle", route: "/events", desc: "Konkursy i losowania — darmowe wejścia za zadania lub kupowane bilety (więcej biletów = większa szansa). Po losowaniu widać zwycięzców.", shot: "pub-events" },
      { title: "Harmonogram", route: "/schedule", desc: "Tygodniowy plan transmisji z godzinami i platformą. „Dodaj do kalendarza” (Google/iCal) + odliczanie do najbliższego live.", shot: "pub-schedule" },
      { title: "Profil publiczny", route: "/u/[username]", desc: "Karta gracza: poziom, prestiż, odznaki (ADMIN/MOD/DONATOR/lojalność), staty, pozycje w rankingach, bilans typera, klan, podłączone platformy i social linki." },
      { title: "Wrapped (podsumowanie sezonu)", route: "/wrapped", desc: "Osobiste, udostępnialne podsumowanie miesiąca: GT, osiągnięcia, liga, bounties, highlighty. Karta OG do social mediów.", shot: "pub-wrapped" },
      { title: "Biblioteka gier", route: "/games", desc: "Katalog gier, w które gra streamer (Steam/PSN/Xbox), z opisami i głosowaniem „następna gra”.", shot: "pub-games" },
    ],
  },
  {
    id: "wsparcie",
    title: "Streaming, wsparcie i konto",
    intro: "Realne wsparcie streamera, personalizacja i bezpieczeństwo konta.",
    items: [
      { title: "Dźwięki na streamie", route: "/sounds", desc: "Płać GT, by odtworzyć dźwięk na żywo na streamie. Biblioteka z podglądem i ceną; Twój nick jest kredytowany.", shot: "pub-sounds" },
      { title: "Wsparcie / napiwki", route: "/support", desc: "Realne wpłaty: linki płatności, portfele krypto (QR), przelew/IBAN. Kopiowanie jednym kliknięciem, kody QR, ściana wspierających, cel zbiórki. Nagłówek/opis/„dziękuję” konfiguruje streamer.", shot: "pub-support" },
      { title: "Premium", route: "/premium", desc: "Porównanie Free vs Premium, przełącznik walut (PLN/EUR/USD), okresy 1/3/12 mies. i 14 dni okresu próbnego. Premium odblokowuje pełen toolkit (kasyno, overlaye, AI, white‑label).", shot: "pub-premium" },
      { title: "Paleta poleceń (Ctrl/⌘ K)", desc: "Szybkie wyszukiwanie stron, funkcji i profili widzów z dowolnego miejsca. Enter = przejdź, Esc = zamknij." },
      { title: "Motyw i język", desc: "Przełącznik jasny/ciemny + wybór z 14 języków (prawy górny róg nagłówka). Preferencje zapamiętywane w przeglądarce." },
      { title: "Passkeys (logowanie bez hasła)", route: "/profile", desc: "Zarejestruj passkey (odcisk/twarz/PIN) do bezpiecznego logowania bez hasła. Zarządzanie w profilu." },
      { title: "Powiadomienia push", route: "/profile", desc: "Opcjonalne powiadomienia przeglądarki: wygrane, osiągnięcia, „LIVE teraz”, start eventu. Włączasz w profilu." },
    ],
  },
];

export const ADMIN_INTRO =
  "Panel /admin to centrum dowodzenia portalem. ~52 sekcje w trybach Prosty / Zaawansowany / Dev. " +
  "Każdą sekcję otworzysz bezpośrednio linkiem /admin#<id> albo paletą Ctrl+K. Poniżej grupy i co konfigurują. " +
  "Zrzuty pochodzą z czystego portalu demonstracyjnego (E‑Forge).";

export const ADMIN_GROUPS: WikiGroup[] = [
  {
    id: "adm-main",
    title: "Główne i diagnostyka",
    items: [
      { title: "Dashboard", desc: "Pulpit: kluczowe liczby (userzy, GT w obiegu, zarobione, eventy, zamówienia) + status konfiguracji portalu i skróty.", shot: "admin-dashboard" },
      { title: "Analityka", desc: "Wykresy aktywności: wzrost userów, obieg GT, popularność gier i sklepu. Tylko do odczytu.", shot: "admin-analytics" },
      { title: "Zdrowie ekonomii", desc: "Źródła (faucets) i sinki GT, dzienny trend, top 10 zarabiających i wydających. Diagnostyka inflacji.", shot: "admin-economy" },
      { title: "Wsparcie / Płatności", desc: "Metody płatności na /support (link/krypto/IBAN), cel zbiórki oraz konfigurowalny tekst strony (nagłówek/opis/„dziękuję”).", shot: "admin-payments" },
      { title: "Powiadomienia push (broadcast)", desc: "Wyślij powiadomienie przeglądarki do wszystkich, którzy się zapisali; podgląd liczby subskrybentów.", shot: "admin-notifications" },
      { title: "Sponsorzy / Partnerzy", desc: "Loga sponsorów na /support i opcjonalnej karuzeli OBS — nazwa, link, logo, poziom.", shot: "admin-sponsors" },
      { title: "Karty (collectibles)", desc: "Katalog kart: nazwa, rzadkość, grafika. Widzowie zbierają je z paczek i handlują na markecie.", shot: "admin-collectibles" },
      { title: "Portale (SaaS)", desc: "TYLKO właściciel platformy: zarządzanie portalami klientów — branding, plan (Basic/Pro/Elite), provisioning.", shot: "admin-tenants" },
    ],
  },
  {
    id: "adm-platforms",
    title: "Platformy streamingowe",
    items: [
      { title: "Twitch (EventSub)", desc: "Nagrody na żywo za suby, gifty, bity, raidy, followy. Wymaga autoryzacji OAuth, by Twitch wysyłał zdarzenia kanału.", shot: "admin-twitch" },
      { title: "Kick", desc: "Integracja Kick — nagrody za suby/gifty/followy przez webhooki." },
      { title: "YouTube Live", desc: "Czat YouTube, członkostwa i Super Chaty; bot czyta czat, by nagradzać GT." },
      { title: "Rumble", desc: "Status livestreamu Rumble (online/offline, followerzy, suby) na overlayach — wklej zaszyfrowany URL API." },
    ],
  },
  {
    id: "adm-bot",
    title: "Bot czatu",
    items: [
      { title: "Bot / Ekonomia", desc: "Rdzeń bota: GT za minutę oglądania, bonusy za suby/bity, happy hour (mnożnik w wybranych godzinach).", shot: "admin-bot" },
      { title: "Komendy czatu", desc: "Własne komendy (np. !discord, !rules) działające na Twitch/Kick/YouTube + overlay czatu.", shot: "admin-chat" },
      { title: "Auto‑timery", desc: "Cykliczne wiadomości co X minut (np. „Dołącz na Discord”) — tylko gdy stream live.", shot: "admin-timers" },
      { title: "FAQ / Pomoc", desc: "Pytania i odpowiedzi pokazywane widzom na stronie pomocy.", shot: "admin-faq" },
      { title: "Wiadomości powitalne", desc: "Powitanie nowych userów portalu + opcjonalny bonus powitalny.", shot: "admin-welcome" },
      { title: "Kolejka utworów", desc: "Widzowie zgłaszają utwory (!sr) za GT; zarządzasz odtwarzaniem i kolejką.", shot: "admin-songs" },
    ],
  },
  {
    id: "adm-overlays",
    title: "Overlaye OBS",
    items: [
      { title: "Stream Alerty", desc: "Alerty zdarzeń (sub, raid, zakup): wygląd, dźwięk, czas wyświetlania. Źródło przeglądarki w OBS.", shot: "admin-alerts" },
      { title: "Cele streamu (Goals)", desc: "Paski celów społeczności (np. „100 subów w tym miesiącu”) — tytuł, cel, postęp na overlayu.", shot: "admin-goals" },
      { title: "Subathon", desc: "Timer przedłużany subami/donejtami: czas bazowy, sekundy za sub/bit/donejt, limity i cap.", shot: "admin-subathon" },
      { title: "Biblioteka widżetów", desc: "Browser‑source widżety do OBS: liczniki, leaderboardy, cele, alerty, koło. Kopiujesz link → wklejasz w OBS.", shot: "admin-widgets" },
      { title: "Kreator scen", desc: "Wiele widżetów na jednym płótnie 16:9 → jeden link źródła OBS dla całej sceny.", shot: "admin-scenes" },
      { title: "Nagrody dźwiękowe", desc: "Widzowie grają dźwięki na streamie za GT — biblioteka, koszt, cooldown.", shot: "admin-soundrewards" },
      { title: "Sterowanie OBS (WebSocket)", desc: "Reguły alert → akcja OBS: zmiana sceny, pokaż/ukryj źródło, filtr. Wymaga aktuatora browser‑source.", shot: "admin-obsrules" },
      { title: "Oświetlenie Govee", desc: "Reguły alert → lampka Govee (kolor/jasność/on‑off, flash→revert). Wymaga klucza API Govee w Integracjach.", shot: "admin-goverules" },
    ],
  },
  {
    id: "adm-economy",
    title: "Ekonomia i zaangażowanie",
    items: [
      { title: "Sklep / Produkty", desc: "Pozycje za GT: nazwa, cena, kategoria, wymagany tier. Dostawa i zamówienia oczekujące tutaj.", shot: "admin-shop" },
      { title: "Drops / Kody", desc: "Kody odbieralne na stronie + chat‑dropy (pierwsi N widzów łapią bonus). Ustawiasz nagrodę, sloty, wygaśnięcie.", shot: "admin-drops" },
      { title: "Koło Fortuny", desc: "Segmenty (nazwy/nagrody) i koszt spinu dla gry /wheel.", shot: "admin-wheel" },
      { title: "Sezony / Battle Pass", desc: "Sezony rankingu: reset leaderboardu, archiwum, nagrody top graczy na koniec.", shot: "admin-seasons" },
      { title: "Predykcje", desc: "Twórz predykcje, otwórz zakłady, rozstrzygnij — pula trafia do trafiających.", shot: "admin-predictions" },
      { title: "Eventy i raffle", desc: "Szablony świąteczne lub własne eventy: bilety, losowania, czas, mnożniki.", shot: "admin-events" },
      { title: "Bounties", desc: "Wyzwania od widzów: oznacz „wykonane” (spal pulę) lub „odrzuć” (zwróć wspierającym).", shot: "admin-bounties" },
      { title: "Ankiety", desc: "Twórz sondy widoczne na portalu; głosy liczone na żywo.", shot: "admin-polls" },
      { title: "Osiągnięcia", desc: "Definiuj odznaki (warunek odblokowania, nagroda GT) — portal przyznaje automatycznie.", shot: "admin-achievements" },
      { title: "Harmonogram", desc: "Stałe sloty transmisji (dni/godziny) pokazywane na /schedule.", shot: "admin-schedule" },
      { title: "Trivia", desc: "Bank pytań quizu (odpowiedzi, nagroda GT) + runda live na overlayu.", shot: "admin-trivia" },
      { title: "Społeczność / Klany + Wojny", desc: "Ustawienia klanów (limity, leaderboard) oraz tworzenie i punktacja Wojen Klanów.", shot: "admin-community" },
    ],
  },
  {
    id: "adm-mod",
    title: "Moderacja i bezpieczeństwo",
    items: [
      { title: "Moderacja / Filtry czatu", desc: "Automod: wulgaryzmy (słowa+regex), whitelist linków, capsy, długość, powtórzenia, Zalgo. Akcja: usuń/timeout/ostrzeż, wyjątki dla subów/VIP/modów.", shot: "admin-moderation" },
      { title: "Użytkownicy / Tokeny / Role", desc: "Przyznawanie/odbieranie GT, role (admin/mod), weryfikacja subów, reset bazy (dev). (Sekcja z danymi osobowymi — pominięta na zrzutach.)" },
      { title: "Audyt", desc: "Log każdej akcji admina (kto/co/kiedy). Tylko do odczytu. (Pominięte na zrzutach — adresy IP.)" },
      { title: "2FA (step‑up)", desc: "TOTP wymagany przy wrażliwych operacjach (kasowanie, reset). (Sekcja bezpieczeństwa — pominięta na zrzutach.)" },
      { title: "Integracje", desc: "Klucze API i tokeny overlayu (AI, OBS, Govee, Steam…). (Sekcja z sekretami — pominięta na zrzutach.)" },
    ],
  },
];

export const COMMAND_GROUPS: CommandGroup[] = [
  {
    title: "Gry i kasyno",
    items: [
      { cmd: "!slots <kwota>", desc: "Zakręć slotami o GT.", who: "Wszyscy" },
      { cmd: "!coinflip <kwota>", desc: "Rzut monetą — podwój albo strać (alias !gamble).", who: "Wszyscy" },
      { cmd: "!roulette <kwota> <red|black|0-36>", desc: "Ruletka: kolor (2×) lub liczba (36×). Alias !roleta.", who: "Wszyscy" },
    ],
  },
  {
    title: "PvP i kooperacja",
    items: [
      { cmd: "!duel <kwota> / !duel @nick <kwota>", desc: "Otwarty albo imienny pojedynek o GT (escrow do akceptacji).", who: "Wszyscy" },
      { cmd: "!accept / !decline", desc: "Przyjmij lub odrzuć pojedynek; zwycięzca bierze pulę.", who: "Wszyscy" },
      { cmd: "!heist <kwota>", desc: "Napad kooperacyjny — większa ekipa = lepsze szanse; rozliczenie ~90 s po starcie.", who: "Wszyscy" },
    ],
  },
  {
    title: "Muzyka i AI",
    items: [
      { cmd: "!sr <URL|tytuł>", desc: "Zgłoś utwór do kolejki (streamer zarządza w /admin#songs).", who: "Wszyscy" },
      { cmd: "@bot <pytanie>", desc: "Zapytaj AI bota; odpowiada na czacie (wymaga klucza AI).", who: "Wszyscy*" },
      { cmd: "!imagine <opis>", desc: "Wygeneruj obraz AI z opisu (wymaga klucza AI).", who: "Wszyscy*" },
    ],
  },
  {
    title: "Raffle i komendy własne",
    items: [
      { cmd: "<słowo‑klucz>", desc: "Wpisz słowo ogłoszone przez streamera, by wejść do losowania (suby/mody = więcej biletów).", who: "Wszyscy" },
      { cmd: "!portal / !ranking / !sklep / !questy", desc: "Domyślne komendy z linkami; streamer dodaje własne w /admin#chat.", who: "Wszyscy" },
    ],
  },
];

// Sekcje „Dla developerów” (skrót — pełna wersja w PDF dla developerów).
export const DEV_SECTIONS: { title: string; body: string }[] = [
  { title: "Stack", body: "Next.js 16 (App Router, RSC) · React 19 · TypeScript (strict) · Prisma 7 + adapter‑pg · PostgreSQL (Supabase) · Auth.js v5 (sesje w bazie) · Tailwind 4 · next‑intl (14 języków) · Stripe · Vitest + Playwright. Hosting: Vercel (auto‑deploy z main)." },
  { title: "Layout repo", body: "ghost-empire-web/ — aplikacja Next (app/, components/, lib/, prisma/, messages/, e2e/). Repo root: docs/ (ARCHITECTURE, ENDPOINTS, ENV…), CHANGELOG.md, ROADMAP.md, CLAUDE.md. Sibling: ghost-empire-chat (bot Twitch/Kick/YouTube)." },
  { title: "Multi‑tenant", body: "Tenant rozwiązywany po hoście (subdomena <slug>.root lub custom domain → domyślnie founder). Prawie każdy model ma nullable tenantId; odczyty/zapisy scope’owane przez currentTenantId(); per‑tenant composite uniques. Branding (nazwa, kolor, token, logo, social) z wiersza Tenant." },
  { title: "Auth", body: "Auth.js v5, strategy „database”, tenant‑aware Prisma adapter (ta sama tożsamość OAuth → osobny User per portal). Providerzy: Twitch, Discord, Google (YouTube), Kick. Stałe adminy po e‑mailu przeżywają reset bazy." },
  { title: "API i bramki", body: "Trasy w src/app/api/. Gatey: requireAdmin / requirePermission / requirePlatformOwner, featureGateResponse (plan basic⊂pro⊂elite). Klient apiGet/apiPost. Rate‑limit (Redis→pamięć). Webhooki podpisywane (Stripe/Twitch/Kick)." },
  { title: "Bramki weryfikacji", body: "Z ghost-empire-web/: npx tsc --noEmit · npx vitest run · npx eslint <pliki> · npx next build · npm run docs:check. Wszystkie muszą być zielone (egzekwowane w CI). Reguła docs‑sync: każdy PR aktualizuje CHANGELOG (#NNN)." },
  { title: "Billing (Stripe)", body: "Dry‑wired: bez kluczy checkout → 503, trial 14 dni bez karty. lib/premium.ts trzyma czyste stałe (waluty, ceny lustrzane do Stripe). Webhook /api/webhooks/stripe aktualizuje plan tenanta. Wielowaluta przez Stripe currency_options." },
  { title: "Uruchomienie lokalne", body: "Node ≥ 22. Z ghost-empire-web/: cp .env.example .env.local, ustaw DATABASE_URL/DIRECT_URL/NEXTAUTH_SECRET/BOT_SECRET + jeden provider OAuth. npm install → npm run db:push → npm run db:seed → npm run dev (localhost:3000)." },
];

# DISCOVERY_REPORT.md — E-Forge / Ghost Empire

**Tryb:** discovery (analiza produktu, **zero zmian w kodzie**). **Data:** 2026-07-03. **Autor:** product designer + PM (Claude).
**Metoda:** analiza kodu (3 równoległe agenty gruntujące: first-run/aktywacja · pętla widza/ekonomia · konfiguracja streamera) + własne przeglądy IA/nawigacji + skala produktu (liczba tras/overlayów/sekcji) + odczyt żywej bazy (rozkład userów per portal). Fakty mają dowód `plik:linia`; hipotezy są **oznaczone** jako założenia do weryfikacji.
**Ograniczenie nadrzędne:** brak telemetrii użycia (DAU, rozkład sald GT, lejek konwersji) — patrz §8. Prod ma realnie **1 aktywnego usera na e-forge**, więc „które funkcje są używane" to wnioski z kodu, nie z danych.

---

> **✅ Status wdrożenia (2026-07-03, po „zrób wszystko"):** wszystkie **5 z top-5** + cały A-tail wdrożone i na produkcji — **#781** (A1/A2/A3 tarcie onboardingu), **#782** (A4 integralność startu), **#786** (C2 „wydaj 500 GT"), **#785** (C1 self-serve branding), **#784** (A7/A8 IA + odnajdywalność), **#783** (A5 stany: aukcje error+retry, szkielety SSR), **#787** (C3 widoczność aktywacji dla operatora). **B3** (pakiet sceny OBS) już pokryte przez kompozytor scen #550 + szablony #771 + link wizard→biblioteka #784. **Odroczone świadomie:** A6 „X z N" osiągnięć (wymaga osobnej infry liczenia progresu) · pełny sweep toast→ErrorState na Shop/Kasyno/Home/Profil (mają działający toast) · **B2** wrapped-history (rozlewa się na `getWrapped`+`getMyLeagueStats`+2 OG — osobna sesja) · **B4/B5/B6/C4** — wymagają `prisma db push` na PROD i/lub decyzji ekonomicznej → **czekają na zgodę właściciela** (patrz §6 wiadra B/C).

## 1. Podsumowanie

E-Forge to **dwustronny produkt**: (a) **platforma widza** — fan streamera zdobywa/wydaje Ghost Tokens (GT), gra w kasyno, wspina się w rankingach; (b) **white-label SaaS** — streamer prowadzi własny, obrandowany portal z overlayami OBS, sklepem i integracjami. Produkt jest **wyjątkowo bogaty w funkcje**: **39 tras widza, 24 overlaye OBS, 52 sekcje panelu admina**. Rdzeń widza jest **mocny i dopracowany** (5 kluczowych ekranów odpowiada „po co GT / co dalej", saldo widoczne wszędzie), ekonomia ma hojne krany i sensowne spusty, a system rang/poziomów jest czytelny i klimatyczny.

**Sedno:** wąskim gardłem nie jest brak funkcji — jest **aktywacja i self-serve**. Ten sam produkt, który ma 10 gier kasyna i 24 overlaye, ma jednocześnie: ślepy ekran po założeniu portalu, brak self-serve edycji brandingu dla zwykłego streamera, twardy wymóg Twitcha (wyklucza streamerów Kick/YouTube z „go-live"), oraz świeżego widza wysyłanego w puste strony. Świeży bug logowania (#780) to objaw tej samej klasy: **ścieżki wejścia są kruche, a powierzchnia funkcji ogromna.**

**3 największe okazje:**
1. **Domknięcie aktywacji streamera** — od „załóż portal" do „jestem live i obrandowany" bez ślepych zaułków i bez wykluczania nie-Twitchowców.
2. **Self-serve white-label** — zwykły streamer-admin nie ma dziś w panelu **żadnej** sekcji do zmiany nazwy/kolorów/nazwy waluty/logo (edycja istnieje tylko w `/onboarding` i jest Elite-gated). To niespełniona obietnica „to Twój portal".
3. **Integralność pierwszego kontaktu** — usunięcie sztucznych statystyk, martwych linków onboardingu widza i stanów „null/ładowanie" na świeżym koncie, żeby produkt na starcie budził zaufanie.

---

## 2. Założenia o użytkownikach

Analiza opiera się na trzech grupach (wyprowadzonych z kodu; **do potwierdzenia wywiadami** — §8):

- **Widz (viewer)** — fan konkretnego streamera na jego portalu. **Cel:** czuć się częścią społeczności, zdobywać/wydawać GT, grać, być rozpoznanym (ranga/poziom/odznaki), wracać codziennie. *Zał.: głównie mobilny, przychodzi z linku streamera, nie czyta instrukcji.*
- **Streamer / właściciel portalu (admin)** — prowadzi własny white-label portal. **Cel:** minimalnym wysiłkiem: postawić portal, obrandować go „pod siebie", podpiąć overlaye do OBS, dać widowni powód do zaangażowania, opcjonalnie zarabiać (Premium/napiwki/sklep). *Zał.: nie jest programistą, konfiguruje raz i chce „żeby działało".*
- **Operator platformy (founder / właściciel E-Forge = Ty)** — prowadzi SaaS, pozyskuje streamerów. **Cel:** onboardować streamerów przy zerowym tarciu, widzieć które portale utknęły, utrzymać zdrowie platformy. *Zał.: dziś obsługuje portale „done-for-you", stąd branding zamknięty na platform-ownera.*

---

## 3. Analiza funkcji (kluczowe ustalenia po osiach)

### 3.1 Onboarding streamera (`/onboarding`)
- **Cel/przepływ:** krótki, **3 kroki** (marka → waluta → plan), slug auto-generowany z diakrytyk, wszystko edytowalne później (`OnboardingClient.tsx:184-263`). **To dobre.** Po submit: Tenant + trial 14 dni + `seedTenantContent` klonuje osiągnięcia/questy/alerty/battle-pass od foundera (`route.ts:65-86`) → **świeży portal NIE jest pustą skorupą** (mocne).
- **Funkcjonalność (braki):** ekran „gotowe" (`:131-168`) ma tekst „doneNext" i przyciski aktywacji Stripe, ale **zero linku do nowego portalu ani panelu** → ślepy zaułek po najważniejszym momencie. **Pułapka planu:** wybór Elite jest po cichu ścinany do Pro na trialu (`route.ts:63`), a edycja brandingu wymaga Elite (`my/route.ts:58`) → późniejszy formularz brandingu **rzuca 403** bez uprzedzenia.
- **Stany:** loading/inline-error obecne (`:113-118,261`).

### 3.2 Setup Wizard + activation checklist (admin)
- **Cel/przepływ:** 11 kroków w 4 grupach; **self-healing** — ukończenie liczone z realnych danych server-side (`setup-status/route.ts:64-76`), odhacza się samo gdy streamer utworzy rzecz gdziekolwiek. Bramka „go-live" wymaga 3 kroków: `twitch`+`twitchSubs`+`overlay` (`setup-status.ts:22-23`). **Self-healing i persystentny pill to mocne strony.**
- **Funkcjonalność (braki — istotny):** `twitch`+`twitchSubs` są **twardo wymagane** → streamer **tylko na Kicku/YouTube nigdy nie ukończy setupu**, „Finish" zostaje zablokowany (`SetupWizard.tsx:157`), pill utyka <100% na zawsze. Overlay-krok podaje tylko bazowy URL `/overlay` (alerty), a pełna biblioteka 27 widgetów żyje osobno w sekcji `widgets` — **dwa niepołączone punkty wejścia do overlayów**.

### 3.3 Pierwsze logowanie widza
- **Cel/przepływ:** `createUser` daje **500 GT** + alert „👻 Nowy duch" + XP sezonowy (`auth.ts:518-575`). Logowanie **wyłącznie OAuth** (Twitch/Discord/Google/Kick) — zero tarcia hasła. **Mocne.**
- **Funkcjonalność (braki):** osiągnięcie `first_login` odpala się **przy DRUGIM logowaniu** (na pierwszym user jeszcze nie istnieje, blok `if(dbUser)` pominięty — `auth.ts:470-484` vs `:582`) → nagroda „za pierwsze wejście" mija się z momentem powitania. Checklist „Pierwsze kroki" linkuje do klanów/klipów (`GettingStarted.tsx:18-19`), których na świeżym tenancie **może nie być** → martwe linki. Statystyki `GuestView` są **zahardkodowane** („847+", „12M+", `HomeClient.tsx:293-298`) → identyczny fałszywy social-proof na każdym white-label portalu.

### 3.4 Pętla widza + ekonomia GT — **najmocniejszy obszar**
- **Ekrany:** home / shop / kasyno / profil / ranking — **każdy** ma widoczne saldo GT, oczywistą główną akcję i odpowiedź „po co / co dalej" (`HomeClient.tsx:104`, `ShopClient.tsx:168`, `KasynoClient.tsx:251`, `ProfileClient.tsx:282`, `RankingClient.tsx:135`). Stany empty/guest obecne na home/shop/kasyno/ranking.
- **Ekonomia:** krany hojne i pasywne (welcome 500 + daily do 200 + **chat 5/wiad. × poziom × prestiż × happy-hour** = główny driver, `chat-award/route.ts:106-123`); spusty liczne i w większości z jasnym powodem (sklep, kasyno, paczki, giełda z **5% palonym fee** = prawdziwy sink, sound-rewards na streamie). **Słabe punkty:** **gift** przenosi podaż bez palenia (słaby spust); **tytuły** kosmetyczne przy ostrej cenie do 200k (słaby pull).
- **Rozpoznanie:** rangi 🥚→👤→🌫️→👻→🔥→💀→👁️ (klimatyczne, kolor-kodowane, `utils.ts:108-120`), pasek XP zawsze z „X / Y do następnego" (`ProfileClient.tsx:289`), alerty level-up/prestiż/osiągnięcie na OBS. **Mocne.**

### 3.5 Konfiguracja streamera (panel admina)
- **Struktura:** 52 sekcje, 7 grup, 3 tryby (simple/advanced/dev) filtrujące NAV; **domyślny tryb = „dev" (wszystko)** dla istniejących portali, tylko świeże dostają „simple" (`AdminClient.tsx:174-186,226-227`). Wiele ścieżek odnalezienia: paleta Ctrl+K, asystent AI, badge, grupy, deep-linki. **Redundancja find-paths to mocna strona.**
- **Overlay→OBS:** `Widgets.tsx` = 27 overlayów z podglądem, gotowym URL+token, „edytuj wygląd →" dla 7 z nich. Token **współdzielony**, generowany leniwie. **Braki:** pozycja/skala tylko dla widgetów **custom**, nie dla 27 wbudowanych; „wygeneruj nowy token" (unieważnia wszystkie URL-e) siedzi w innej sekcji (Stream Alerts).
- **Integracje:** karty dormant-until-key z podpowiedziami „co odblokowuje" (`Integrations.tsx`). **Brak:** sekcja Integracje jest `level:3` (dev) → **ukryta przed streamerem w simple/advanced**, mimo że klucz AI jest opcjonalnym krokiem setupu.
- **Branding (największa luka):** wszystkie pola marki edytowalne **tylko** w `Tenants.tsx` — **platform-owner-only** (`permission:()=>isPlatformOwner`, `AdminClient.tsx:129`; `isPlatformOwner = isPermanentAdminEmail`). Zwykły streamer-admin **nie ma w panelu żadnej** sekcji brandingu. Jedyna self-serve edycja to `/onboarding`→„Mój portal" (`PATCH /api/onboarding/my`), **Elite-gated** (403 „dostępne w planie Elite", `my/route.ts:58`). Kreator ustawia markę **za darmo przy tworzeniu** (`:217-238`), ale trial jest capowany do Pro (`route.ts:63`) → **nikt poza płacącym Elite nie zmieni marki po starcie**, i nawet on musi znaleźć ukryty ekran `/onboarding`.

---

## 4. Problemy i okazje (z dowodem)

| # | Problem (dowód) | Czyj cel cierpi |
|---|---|---|
| P1 | Ekran „gotowe" onboardingu bez linku do portalu/panelu (`OnboardingClient.tsx:131-168`) | Streamer: „postawiłem — i co teraz?" |
| P2 | Brak self-serve brandingu w panelu; edycja tylko w `/onboarding` i Elite-gated (`my/route.ts:58`, `AdminClient.tsx:129`) | Streamer: „to miał być MÓJ portal" |
| P3 | Setup wymaga Twitcha na twardo (`setup-status.ts:22-23`) → Kick/YT nie dobiją „live" (`SetupWizard.tsx:157`) | Streamer nie-Twitchowy: wykluczony z aktywacji |
| P4 | Pułapka Elite→Pro po cichu (`route.ts:63`) + branding 403 po wypełnieniu formularza (`my/route.ts:58`) | Streamer: dezorientacja, poczucie oszukania |
| P5 | Checklist „Pierwsze kroki" widza linkuje do pustych klanów/klipów na świeżym portalu (`GettingStarted.tsx:18-19`) | Widz: pierwszy klik → pustka |
| P6 | Zahardkodowane statystyki „847+/12M+" na każdym white-label portalu (`HomeClient.tsx:293-298`) | Widz+streamer: nieautentyczność |
| P7 | `first_login` odpala się przy 2. logowaniu (`auth.ts:470-484` vs `:582`) | Widz: nagroda mija się z momentem |
| P8 | Niespójne stany błędu: `ErrorState`+retry tylko w Collectibles/Market; Shop/Kasyno/Home/Profil = tylko toast; `AuctionsClient` bez żadnego stanu; strony SSR bez szkieletu | Widz: przy błędzie sieci pusty/zawieszony UI bez „ponów" |
| P9 | Osiągnięcia bez wskaźnika postępu „X z N" (`ProfileClient.tsx:389-417`) | Widz: nie wie, jak blisko celu |
| P10 | Świeże powierzchnie renderują `null` w ładowaniu (`SetupStatusCard.tsx:27`, `GettingStarted.tsx:30`); daily-tasks empty pokazuje „loadingTasks" (`HomeClient.tsx:128`) | Oboje: świeże konto wygląda „zepsute/puste" |
| P11 | Overlay-krok wizarda daje tylko bazowy URL; 27-widgetowa biblioteka niepołączona (`SetupWizard.tsx:48-56` vs `Widgets.tsx`) | Streamer: nigdy nie odkrywa większości overlayów |
| P12 | NAV widza: grupa „community" = 13 pozycji w jednym dropdownie; `/quests` i `/seasons` **tylko** w palecie (poza NAV) (`Header.tsx:46-63`, `command-palette.ts:14-15`) | Widz: nie znajduje / nie docenia tego, co jest |
| P13 | Paleta admina szuka tylko po `label`+`group`, nie po opisie/synonimach (`CommandPalette.tsx:53`) → „OBS" nie znajdzie `widgets`/`alerts` | Streamer: nie trafia do właściwej sekcji |
| P14 | `/wrapped` tylko bieżący miesiąc (`wrapped.ts:46`); dołączający w połowie widzą „nowicjusz", brak podglądu wstecz | Widz: podsumowanie bezwartościowe dla nowych/wstecz |
| P15 | Integracje `level:3` (dev) → ukryte przed simple/advanced (`AdminClient.tsx:123`), mimo że klucz AI to krok setupu | Streamer: nie odblokuje AI, bo nie widzi karty |
| **Hipotezy** | Podaż GT prawdopodobnie inflacyjna (chat-reward pasywny dominuje + gift bez palenia) — *do potwierdzenia danymi salda*. Tytuły mają słaby pull — *wniosek z designu, nie z użycia*. Subdomeny mogą nie być prod-final (`.twoja-domena.com` placeholder, `:208`) — *do potwierdzenia*. | — |

---

## 5. Co działa — chronić (nie ruszać)

- **Rdzeń widza (5 ekranów)** — saldo wszędzie, oczywista główna akcja, „po co / co dalej" na każdym. **Najmocniejszy obszar produktu.** Nie przeprojektowywać.
- **Ekonomia GT** — hojne, niskoprogowe krany + liczne, sensowne spusty; kasyno/paczki/giełda-fee/sound-rewards to zdrowe burny. Silnik odporny i przetestowany (audyt: 0 bugów ruchu pieniędzy).
- **System rozpoznania** — rangi/poziomy/prestiż/pasek XP + alerty na OBS. Klimatyczne i czytelne.
- **Paleta poleceń** (widz i admin) — fuzzy, dwujęzyczna. Świetny akcelerator dla power-userów.
- **Self-healing setup-status** — ukończenie z realnych danych, zero martwych checkboxów.
- **Panel admina: lazy-sekcje ze spójnym loading/error/retry** + tryby + redundantne find-paths.
- **Integracje dormant-until-key** — bezpieczny wzorzec „wklej klucz, funkcja ożywa".
- **Krótki onboarding (3 kroki) + seeding** — niski commit, świeży portal nie jest pusty.
- **Login wyłącznie OAuth** — zero tarcia hasła (po naprawie #780).
- **Collectibles + Market** — referencyjna implementacja stanów (empty+loading+error+retry). Wzorzec do rozniesienia.

---

## 6. Propozycje

Pola: **Problem** (z §4) · **Propozycja** · **Dla kogo/cel** · **Wpływ** · **Koszt (S/M/L)** · **Ryzyko/wykonalność** · **Pewność / założenie**.

### A. Usprawnienia istniejącego (tanie, duży zwrot)

| # | Problem | Propozycja | Dla kogo / cel | Wpływ | Koszt | Ryzyko / wykonalność | Pewność |
|---|---|---|---|---|---|---|---|
| **A1** | P1 | Ekran „gotowe" onboardingu dostaje 2 wyraźne przyciski: **„Otwórz mój portal"** + **„Otwórz panel"** | Streamer / go-live | Wysoki (każdy nowy streamer) | **S** | Trywialne, 1 komponent | Fakt |
| **A2** | P4 | Przestać po cichu ścinać Elite→Pro (**powiedzieć** „trial = Pro, Elite po opłaceniu") + oznaczyć branding jako Elite **przed** wypełnieniem, nie 403 po | Streamer / zaufanie | Wysoki | **S** | Niskie | Fakt |
| **A3** | P3 | „Go-live" wymaga **dowolnej jednej** podłączonej platformy (Twitch **lub** Kick **lub** YT), nie Twitcha na twardo | Streamer Kick/YT / aktywacja | Wysoki (cała klasa streamerów) | **M** | Średnie — przemyśleć zależne kroki (subs) | Fakt |
| **A4** | P5,P6,P10 | **Integralność pierwszego kontaktu:** realne per-tenant statystyki zamiast „847+/12M+"; „Pierwsze kroki" pokazuje tylko kroki, które na tym portalu mają treść; skeleton zamiast `null` | Oboje / zaufanie na starcie | Wysoki | **S–M** | Niskie | Fakt |
| **A5** | P8 | **Sweep stanów:** rozNieść `ErrorState`+retry (wzorzec Collectibles/Market) na Shop/Kasyno/Home/Profil; `loading.tsx`+`PageSkeleton` na stronach SSR; dodać stany `AuctionsClient`; naprawić copy „loadingTasks" na pustym | Widz / odzysk po błędzie | Średni | **M** | Niskie, mechaniczne | Fakt |
| **A6** | P9 | Nieodblokowane osiągnięcia pokazują **postęp „X z N"** (dane już liczone) | Widz / motywacja | Średni | **S** | Niskie | Fakt |
| **A7** | P12 | **IA NAV widza:** rozbić 13-elementowy „community" na mniejsze, czytelne grupy; wyprowadzić `/quests` i `/seasons` z „tylko palety" do NAV (albo świadomie usunąć) | Widz / odnajdywalność | Średni | **M** | Niskie; decyzja IA | Fakt + zał. (które ciąć) |
| **A8** | P11,P13 | **Odnajdywalność:** paleta admina szuka też po opisie/synonimach; overlay-krok wizarda linkuje do pełnej biblioteki 27 widgetów | Streamer / konfiguracja | Średni | **S** | Niskie | Fakt |

### B. Rozszerzenia funkcji (naturalny kolejny krok)

| # | Problem | Propozycja | Dla kogo / cel | Wpływ | Koszt | Ryzyko / wykonalność | Pewność |
|---|---|---|---|---|---|---|---|
| **B1** | P2 | **Krok brandingu w kreatorze** (nazwa/logo/kolor/waluta) dla wszystkich planów przy tworzeniu — „zrób to swoje" od minuty zero | Streamer / self-serve | Wysoki | **S–M** | Niskie (pola już istnieją) | Fakt |
| **B2** | P14 | `/wrapped`: podgląd **poprzednich miesięcy** + roczne „year-in-review" | Widz / retencja, share | Średni | **M** | Niskie | Fakt |
| **B3** | P11 | **„Pakiet sceny OBS"**: zbierz overlaye streamera w **jeden** browser-source przez istniejący kompozytor scen (#550) → jedno „wklej do OBS" zamiast 27 URL-i | Streamer / czas do „live" | Wysoki | **M** | Średnie (reużycie SceneBuilder) | Fakt |
| **B4** | P16* | **Pozycja/skala dla 27 wbudowanych overlayów** (dziś tylko custom, `Widgets.tsx:458`) | Streamer / dopasowanie do sceny | Średni | **M** | Średnie | Fakt |
| **B5** | (tytuły słabe) | **Progresja tytułów**: odblokowanie rangą/osiągnięciem, nie tylko 200k GT → nadać sens największemu kosmetycznemu spustowi | Widz / status | Niski–Śr. | **M** | Niskie | Zał. (słaby pull — do potw.) |
| **B6** | (gift = słaby sink) | **Ongoing referrals**: polecający dostaje mały % z aktywności poleconego (zamiast jednorazowego 500) → wzrost napędzany widzem | Widz+operator / growth | Średni | **M** | Średnie (anty-abuse) | Zał. |

\* P16 = „pozycja/skala tylko dla custom" z §3.5.

### C. Nowe funkcje (każda z celem/luką, nie „konkurencja ma")

| # | Problem | Propozycja | Dla kogo / cel | Wpływ | Koszt | Ryzyko / wykonalność | Pewność |
|---|---|---|---|---|---|---|---|
| **C1** | P2 | **Sekcja „Wygląd / Branding" w panelu admina** dla streamera-właściciela (nazwa/logo/kolory/nazwa waluty). Świadoma decyzja pricingowa: co jest darmowe (tożsamość), co Elite (zaawansowane/domena) — ale **przenieść z ukrytego `/onboarding` do panelu** | Streamer / „to mój portal" | **Wysoki (strategiczny)** | **M** | **Do decyzji pricing** (branding = dziś różnicownik Elite) | Fakt + decyzja biznesowa |
| **C2** | (500 GT bez kierunku) | **Moment „wydaj swoje 500 GT"** tuż po pierwszym logowaniu: karta prowadząca w rdzeń (otwórz paczkę / zagraj / kup w sklepie) — zamiana grantu powitalnego w pętlę | Widz / aktywacja | Wysoki | **S–M** | Niskie (reużycie questów) | Fakt |
| **C3** | (operator ślepy) | **Dashboard aktywacji portali dla operatora**: per-portal userzy / DAU / przepływ GT / na którym kroku setupu utknęli | Operator / wiedza „kto stoi" | Wysoki (dla Ciebie) | **M** | Niskie (dane są) | Fakt (e-forge=1 user → potrzeba realna) |
| **C4** | (portale nierozróżnialne) | **Presety „vibe" portalu** w onboardingu (chill / rywalizacja / variety) pre-brandują kolory + pre-seedują sklep/questy/scenę | Streamer / szybkie „pod siebie" | Średni | **M** | Średnie (nadbudowa nad seedingiem) | Zał. |

---

## 7. Priorytety

### Jeśli zrobić tylko 5 rzeczy (kolejność = stosunek wpływ/koszt)
1. **A1 — linki na ekranie „gotowe" onboardingu.** [S] Trywialne, a każdy nowy streamer dziś trafia w ślepy zaułek. Największy zwrot na złotówkę. **Zrób pierwsze.**
2. **A4 — integralność pierwszego kontaktu** (realne statystyki, adaptacyjne „Pierwsze kroki", skeleton zamiast null). [S–M] Sprawia, że produkt na starcie budzi zaufanie u OBU grup — a to moment, w którym się ich traci.
3. **A3 — go-live dla nie-Twitchowców.** [M] Dziś kod **wyklucza** streamerów Kick/YT z ukończenia setupu. Odblokowuje całą klasę pozyskania (Kick jest duży) — czysto strategiczne.
4. **C1 (+A2) — self-serve branding w panelu.** [M] Dostarcza obietnicę white-label. Połącz z A2 (koniec pułapki Elite). Wymaga decyzji pricingowej — dlatego #4, nie #1.
5. **C2 — „wydaj swoje 500 GT".** [S–M] Konwertuje grant powitalny w rdzeń widza — najtańsza dźwignia aktywacji po stronie widza.

**Wspólny mianownik top-5: żadna nie dodaje nowej funkcji-zabawki — wszystkie usuwają tarcie na ścieżkach wejścia.** To jest właściwy kierunek dla produktu, który ma za dużo funkcji i za mało aktywacji.

### Czego świadomie NIE proponuję (i dlaczego)
- **Więcej gier / overlayów / funkcji widza.** Produkt jest **przesycony** (39 tras / 24 overlaye). Dokładanie pogłębia problem odnajdywalności (P12). Kolejna funkcja nie ruszy jedynego usera na e-forge.
- **Dark mode / kolejne motywy.** Jest 6 motywów + tryb jasny. Zero nowej potrzeby.
- **„Dodaj AI".** Już jest: asystent admina, bot @, `!imagine`, semantic search, tłumaczenie. Więcej AI bez konkretnej potrzeby = szum.
- **Więcej gamifikacji.** Rangi+poziomy+prestiż+questy+sezony+osiągnięcia+streaki+ligi już się nakładają (hipoteza: 3 osobne mechaniki „codziennego powrotu" — daily bonus / watch streak / questy — konkurują o ten sam moment). Dokładanie zaostrza, nie leczy.
- **Rebalans ekonomii (inflacja).** Realna hipoteza (§4), ale **nie ruszać działającej ekonomii bez danych salda** — najpierw telemetria (§8), potem ewentualnie mały burn na gift (B6). Ryzyko zepsucia tego, co działa.
- **Przebudowa tytułów.** Słaby pull, ale i słaba szkoda; koszt > zwrot względem pracy nad aktywacją. (Zostaje jako tani B5, nie priorytet.)
- **Social-OAuth (IG/TikTok/FB).** Dev-ciężkie, zablokowane review'em, zerowa wartość aktywacyjna teraz.

---

## 8. Luki w analizie (czego nie dało się ocenić)

- **Brak telemetrii użycia.** DAU, rozkład sald GT, adopcja funkcji, drop-off lejka onboardingu, konwersja trial→paid — wszystko wnioskowane z kodu, nie z danych. e-forge ma **1 realnego usera**, więc nie ma danych widza do walidacji „które funkcje żyją". **Rekomendacja: minimalna analityka aktywacji (C3) jest warunkiem trafnej priorytetyzacji kolejnych rund.**
- **Warstwa wizualna/pikselowa.** Oceniałem strukturę/przepływ/stany, nie estetykę — `preview_screenshot` na tej aplikacji timeoutuje (ciężkie animacje). Jakość wizualna pojedynczych widoków nieoceniona.
- **Realne mobile.** NAV-strip mobilny (~21 pozycji poziomo) i `/deck` odnotowane z kodu, ale nie przeklikane na urządzeniu.
- **Wywiady ze streamerami.** Cały model „celu streamera/operatora" jest **założeniem** (§2) — czy intencją jest self-serve white-label czy „done-for-you" (branding platform-owner-only sugeruje to drugie) → **kluczowa decyzja, która przesądza priorytet C1**.
- **Nakładanie mechanik codziennego powrotu** (daily bonus vs watch streak vs questy) — hipoteza konkurowania o ten sam moment; wymaga danych retencji.
- **Prod-gotowość subdomen** (placeholder `.twoja-domena.com`) — nie potwierdzone, czy routing per-subdomena jest finalny.

---
*Raport discovery — analiza, zero zmian w kodzie. Wdrożenie każdej propozycji to osobna decyzja. Szkice 2–3 top propozycji: `./sketches/`.*

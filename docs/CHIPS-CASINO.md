# CHIPS-CASINO.md — runbook: kasyno na „Żetonach" (de-ryzykowanie prawne)

> **Cel:** zachować kasyno jako magnes na widzów, **przecinając pętlę wartości**, która czyni je „grą
> hazardową" w rozumieniu Ustawy o grach hazardowych (19.11.2009). Kasyno przechodzi na osobną,
> **darmową, niekupowalną, niespieniężalną** walutę „Żetony" (`chips`), całkowicie odciętą od
> realnych pieniędzy (donacje/suby → GT) i od przedmiotów o wartości rynkowej (sklep GT).
>
> ⚠️ **To nie jest porada prawna.** Projekt zbija ryzyko mocno, ale nie zastępuje **radcy/adwokata od
> prawa hazardowego** (residual: art. 2 ust. 5 — gra komercyjna + losowa nawet bez wygranej). Docelowo
> rozważyć wniosek o **decyzję Ministra Finansów (art. 2 ust. 6)**. Bramka **18+** (`GamblingGate`) — zostaje.

## 📌 Status wdrożenia (2026-07-23)
- ✅ **Faza 1 (schemat)** — `User.chips`, `Transaction.currency`, `ShopItem.currency` dodane; `prisma generate` OK. **`db push` na prod — DO ZROBIENIA przez właściciela.**
- ✅ **Faza 2 (silnik) KOMPLETNA** — 5 gier kasyna (`gt-games`, `gt-blackjack`, `gt-mines`, `gt-hilo`) + `wheel` + **duele (`duels`) + heist (`heist`)** na `chips` + `currency:"CHIPS"` + komunikaty „żetony". Zielone: tsc + 110 testów.
- ✅ **Faza 3 (źródła) — daily grant:** `POST /api/casino/daily-chips` (500 żetonów/dzień, idempotentne, `currency:"CHIPS"`) + przycisk „🪙 Darmowe żetony" w kasynie. Opcjonalnie później: drop za aktywność + welcome grant.
- 🟡 **Faza 5 (UI) — rdzeń funkcjonalny gotowy:** strona kasyna i koło ładują saldo `chips`; **`emitBalance` w kasynie/kole → no-op** (żetony nie zanieczyszczają salda GT w Headerze — realny bug naprawiony). Zielone: tsc + eslint. **Do zrobienia (polish):** etykiety `tokenSymbol`/„GT"→„żetony" w KasynoClient/WheelPageClient + etykiety segmentów koła.
- ✅ **Faza 8 (ekonomia/korektność)** — chips odcięte od metryk GT: weekly-ranking (`cached.ts` — **był realny leak: chips→nagroda GT tygodniowa**), stream-recap, wrapped (year-in-review), economy-health dashboard filtrują `currency:"GT"`. gift (reason `gift_sent`) — już bezpieczne. Zielone: tsc + 101 testów. ⚠️ **Korekta (2026-07-25):** zapisane tu „economy-anomaly (tylko `admin_grant`) — już bezpieczne" **było nieprawdą** — detektor agregował `admin_grant` bez filtra waluty i pierwszy grant żetonów odpaliłby fałszywy alarm; naprawione przy grancie żetonów (Faza 6 §1).
- 🎯 **PĘTLA WARTOŚCI PRZECIĘTA:** kasyno=chips (darmowe, niekupowalne) · sklep=GT (chips nie kupią rzeczy o wartości) · chips nie liczą się do rankingu/nagród/ekonomii GT. Substancjalny fix prawny **zrobiony**.
- ✅ **Faza 5 (etykiety)** — `tokenSymbol`→`chipSymbol` (🪙) w KasynoClient/WheelPageClient (import `useTenantBranding` usunięty), etykiety segmentów koła → 🪙. tsc+eslint.
- ✅ **Faza 7 (regulamin, copy)** — `GamblingGate`: „żetony 🪙 — waluta kasyna bez wartości pieniężnej; nie można kupić, wypłacić ani wymienić na nagrody o wartości rynkowej" (PL+EN).
- ✅ **Faza 0 (framing)** — zdjęty kurs „1 PLN=100 GT" z `about` (→ „podziękowanie w GT za wsparcie"). Mechanizm mintu GT z donacji zostaje.
- ✅ **Faza 4 (split sklepu — KOMPLETNA):** `shop/buy` currency-aware (itemy `currency:"CHIPS"` obciążają żetony, nie GT/`totalSpent`; guard `emitBalance` w ShopClient) **+ 4 kosmetyki „High Roller" za żetony w `prisma/seed.ts`** (odznaka/ramka/tytuł/efekt nicku — sink, zero wartości rynkowej). Sklep forward-safe. tsc+eslint. *(Opcjonalny follow-up: UI pokazujące cenę/saldo chips w ShopClient + funkcjonalny efekt kosmetyków na profilu.)*
- ✅ **Faza 4 (domknięcie — 2026-07-24):** inwariant **`CHIPS ⇒ category:"cosmetic"` wymuszony w kodzie**, a nie tylko w komentarzu + dyscyplinie seeda. Nowa czysta `src/lib/shop-currency.ts` (+ **11 testów**, `typedoc.json`) wpięta w `admin/shop` POST+PATCH (400 — walidacja *wynikowego* stanu, więc sam PATCH `category` na itemie CHIPS też jest blokowany; to była realna, klikalna dziura w panelu), w `prisma/seed.ts` (rzut przed `deleteMany`) i **fail-closed w `shop/buy`** (410 zamiast cichej sprzedaży). Szczegóły: sekcja „Inwariant `CHIPS ⇒ category:\"cosmetic\"`" w Fazie 4. Zielone: tsc + eslint + 883 testy + build.
- ⏳ **Opcjonalnie (nie blokuje legalnie):** kosmetyki za chips (content/admin), admin grant chips (Faza 6), welcome/activity chips, pełna strona ToS.
- 🚀 **Do deployu zostaje TYLKO: `db push` na prod** (właściciel — dodaje kolumny `chips`/`currency`) + commit/review. Krok 0 równolegle: prawnik.
- ⚠️ **NIE deployować** przed: `db push` + Faza 3 (źródła) + Faza 5 (UI/salda) — inaczej kasyno pokaże saldo GT, a gra na 0 żetonów = „Za mało żetonów".

## Zasada (dlaczego to działa)
Grę hazardową tworzą **łącznie 3 elementy**: losowość **+** realna kasa NA WEJŚCIU **+** realna
wartość NA WYJŚCIU. Rozłączamy wejście i wyjście od losowości:
- **GT** (obecna waluta) — może pochodzić z donacji/subów (kasa) i kupować przedmioty o wartości w
  sklepie **zakupem bezpośrednim** (bez losowości = handel, nie hazard). **Nigdy nie wchodzi do kasyna.**
- **Żetony `chips`** — **tylko za darmo** (dzienny grant, aktywność), jedyna waluta w kasynie/kole/duelach,
  wygrywalne tylko jako żetony, wymienialne **wyłącznie na kosmetykę bez wartości rynkowej**. Ślepa uliczka.

| | GT (bez zmian) | Żetony `chips` (nowe) |
|---|---|---|
| Źródło | aktywność + **donacje/suby** | **wyłącznie darmowe** (daily, aktywność, questy) |
| Kupno za kasę | tak (pośrednio) | **NIE, nigdy** |
| Kasyno/koło/duel/heist | **zakaz** | **jedyna waluta** |
| Sklep | real-value **zakupem bezpośrednim** | tylko **kosmetyki** (bez wartości rynkowej) |
| Wymiana chips↔GT / wypłata | — | **NIE** |

## Zakres gier przenoszonych na `chips`
Na żetony przechodzą wszystkie gry **losowo-stawkowe**: kasyno (`gt-games` — slots, coinflip, roulette,
dice, crash, plinko, scratch, blackjack, mines, hi-lo), **koło** (`wheel`), **duele** (`duels`),
**heist** (`heist`). **Predictions** (parimutuel o realne zdarzenie, jak Twitch Predictions) — **decyzja
otwarta** (inna kategoria; domyślnie zostaje na GT, do potwierdzenia u prawnika).

---

## Faza 0 — przygotowanie (bez db push)
1. ✅ **Bramka 18+** (`src/components/kasyno/GamblingGate.tsx`) — już wdrożona na `/kasyno` i `/wheel`.
2. **Zdejmij reklamowany kurs „1 PLN = 100 GT"** z komunikatów donacji (to nie „kup walutę"):
   `src/app/api/webhooks/paymedia/route.ts` (komentarz + ewentualny tekst), `src/lib/streamlabs.ts`
   (notyfikacja „Otrzymałeś … GT"), teksty na `/about`, `/support`, wiki. **Mechanika mintu GT z donacji
   zostaje** — zmienia się tylko narracja (podziękowanie, nie zakup waluty).

## Faza 1 — schemat + migracja ⚠️ db push
Prisma (`prisma/schema.prisma`):
1. **`User`**: dodać `chips Int @default(0)` (obok `tokens` w linii ~123). Opcjonalnie `chipsEarned Int @default(0)`
   dla statystyk. Indeks `@@index([tenantId, chips])` jak przy `tokens`.
2. **`Transaction`**: dodać `currency String @default("GT")` (wartości `"GT" | "CHIPS"`) — rozdziela ledger,
   nie psuje istniejących wierszy (default GT). Uwaga: `economy-anomaly.ts` i weekly-ranking skanują
   transakcje — filtrować po `currency: "GT"` tam, gdzie liczą realną ekonomię (Faza 8).
3. **`ShopItem`**: dodać `currency String @default("GT")` — item kupowany za GT (real-value) albo `CHIPS`
   (kosmetyka kasyna). Alternatywa: `category: "casino_cosmetic"`. `ShopItem.category` już jest
   (`games|skins|subs|cosmetic|experience`, `schema.prisma:523`).
4. **`ChipGrantLog`** (opcjonalny, do idempotencji dziennego grantu): `{ userId, day, amount, createdAt, @@unique([userId, day]) }` —
   jak `daily-bonus`. Alternatywa: użyć istniejącego wzorca daily-bonus.
5. `npx prisma db push` (za wyraźną zgodą właściciela; backup przed). `npx prisma generate`.

**Migracja danych:** istniejące salda **zostają w GT**. Żetony startują od 0 — użytkownicy dostają je
darmowym grantem (Faza 3). *(Opcja marketingowa: jednorazowy „welcome grant" żetonów — czysto darmowy.)*

## Faza 2 — silnik: przełączenie gier na `chips`
Punkt po punkcie (pola `tokens`→`chips`, liczniki `totalSpent/totalEarned`→chips-owe lub pominąć):
1. **`src/lib/gt-games.ts`** `playGtGame` (linie ~331–346): `where: { chips: { gte: bet } }`,
   `data: { chips: { decrement: bet } }`, wypłata `chips: { increment: payout }`, `Transaction` z
   `currency: "CHIPS"`, `reason` bez zmian. **Jackpot** (`JACKPOT_*`, Redis) — zostaje, ale to pula
   **żetonowa** (bez wartości). `MIN_BET/MAX_BET` bez zmian (to żetony).
2. **`src/lib/gt-blackjack.ts`**, **`gt-mines.ts`**, **`gt-hilo.ts`** — analogicznie w funkcjach `start`
   (obciążenie) i `cashout` (wypłata): `tokens`→`chips`, `Transaction.currency="CHIPS"`.
3. **`src/lib/wheel.ts`** — `costPerSpin` pobierany z `chips`, `rewardTokens`→ przyznanie `chips`.
4. **`src/lib/duels.ts`**, **`src/lib/heist.ts`** — stawka i pula w `chips`.
5. **API** (bez zmian logiki, dziedziczy po libach): `api/gt-games/*`, `api/wheel/spin`, `api/bot/gt-game`,
   `api/bot/duel`, `api/bot/heist`. Sprawdzić, że zwracane saldo to `chips`.
6. **`src/lib/entitlements.ts`** — `casino`/`wheel` zostają jako feature'y planu (bez zmian).

## Faza 3 — źródła żetonów (zero ścieżki od kasy)
Nowe, **wyłącznie darmowe** krany `chips`:
1. **Dzienny darmowy grant** — np. 500 żetonów/dzień (wzorzec `api/daily-bonus/route.ts`, idempotencja per-dzień).
   Osobny przycisk „Odbierz darmowe żetony" w kasynie.
2. **Drobny drop za aktywność** (opcjonalnie) — mały grant chips za czat/oglądanie/questy, **oddzielony**
   od mintu GT (to nie może iść przez donacje). Wzorzec `chat-award`, ale increment `chips`.
3. **Achievementy/level** — bonusy żetonowe.
**Zakaz:** żaden webhook płatności (paymedia/streamlabs/sub/cheer) **nie może** przyznawać `chips`.

## Faza 4 — sklep: split walut
1. **Real-value itemy** (klucze Steam, skiny CS2, giftowane suby, bilety, wysyłka fizyczna — `prisma/seed.ts:210-343`)
   → `currency: "GT"`, kupno **bezpośrednie** (bez losowości). `ShippingProfile` bez zmian.
2. **Kosmetyki kasyna** (ramki, kolory, odznaki, tytuły „High Roller", animacje) → `currency: "CHIPS"`,
   `category: "cosmetic"` (`isDigital`, natychmiastowe, `shop/buy/route.ts:129`).
3. **`src/app/api/shop/buy/route.ts`** — wybór pola do obciążenia wg `item.currency` (`tokens` vs `chips`),
   walidacja salda odpowiedniej waluty.
4. **Krytyczne:** żaden item o wartości rynkowej **nie może** być kupiony za `chips`. To jest linia prawna.
   ✅ **Wymuszone w kodzie** (nie tylko w seedzie) — patrz sekcja niżej.

### Inwariant `CHIPS ⇒ category:"cosmetic"` (wymuszony)
Reguła: **`ShopItem.currency === "CHIPS"` ⇒ `ShopItem.category === "cosmetic"`.** Item za żetony
w kategorii o wartości rynkowej (`games` / `skins` / `subs` / `experience`) **domyka z powrotem
pętlę wartości**, którą cała migracja na żetony przecina — darmowy żeton kupiłby wtedy klucz
Steam. To jest **allowlista**: kategoria dodana w przyszłości (np. `hardware`) jest dla żetonów
zabroniona z automatu.

Jedno źródło prawdy: **`src/lib/shop-currency.ts`** (czysta, DB-free, `checkCurrencyCategory` /
`assertCurrencyCategoryValid` / `isChipsCurrency`; w `typedoc.json` → `docs/api/shop-currency`).
Trzy miejsca wymuszenia — każdy pisarz **i** ścieżka sprzedaży:

| Gdzie | Zachowanie |
|---|---|
| `POST/PATCH /api/admin/shop` | Walidacja **wynikowego** stanu itemu (`data.* ?? istniejący.*`) → **400**; dotyczy obu pól pary, bo `currency` i `category` są zapisywalne (Faza 6). Sam PATCH `category` na istniejącym itemie CHIPS też jest blokowany (to była realna dziura: panel pozwalał przestawić zaseedowaną kosmetykę „High Roller" na `games`). `UPDATE` ma `currency`/`category` w `WHERE` → równoległa edycja drugiej połowy pary przegrywa wyścig (**409**), zamiast obejść guard |
| `prisma/seed.ts` | `assertCurrencyCategoryValid` w pętli **przed** `deleteMany`/`createMany` — seed wymiata i odtwarza cały katalog (także na prodzie), więc zły wiersz rzuca zanim cokolwiek zostanie skasowane |
| `POST /api/shop/buy` | **Fail-closed:** zły wiersz (ręczna edycja w DB, przyszłe pole `currency` w adminie) → sprzedaż odmówiona **410** + `log.error` z `itemId`. Sprzedaż to moment, w którym pętla by się domknęła |

Nieznana wartość `currency` (legacy/literówka) jest przy **odczycie** wszędzie traktowana jak
`GT` — tak samo jak w `shop/buy` i `planRefund` (`lib/refund.ts`), żeby żadna ścieżka nie
rozumiała wiersza inaczej niż pozostałe. Przy **zapisie** jest odwrotnie: `/api/admin/shop`
odrzuca nieznaną walutę (**400**), zamiast po cichu wpisać śmieć do kolumny.

## Faza 5 — UI/UX (atrakcyjność = retencja bez kasy)
1. **Saldo żetonów** widoczne w kasynie/kole (obok/zamiast GT); `KasynoClient`, `WheelPageClient`, header.
2. **„Darmowe żetony co dzień + streak"** — CTA retencyjne.
3. **Leaderboardy/sezony kasyna** (największa wygrana, streak, mistrz tygodnia) → nagrody **kosmetyczne**.
   `api/gt-games/leaderboard` — po `chips`.
4. **Ekskluzywne kosmetyki tylko z kasyna**, tytuły „High Roller", jackpot **kosmetyczny**, turnieje, klan-nights.
5. **Progresja kasyna** (poziom, odblokowywanie stołów).
6. Zdjąć z UI wszelkie sugestie „kup GT/żetony za kasę".

## Faza 6 — admin
1. ✅ **Grant żetonów** — `POST /api/admin/grant-tokens` przyjmuje `currency` (`GT` domyślnie |
   `CHIPS`), zamiast osobnej trasy: jedna ścieżka, jedno uprawnienie (`grant_tokens`), jeden
   wpis audytowy. **Rozdział walut jest twardy:** `CHIPS` rusza wyłącznie kolumnę `chips` —
   **nie** `totalEarned`/`totalSpent` (to metryki realnej ekonomii GT) — stempluje wiersz
   ledgera `currency:"CHIPS"` i **nie** karmi detektora anomalii. Odjęcie strażowane
   `chips: { gte }` (jak GT-owe `tokens: { gte }`), komunikaty i powiadomienie mówią
   „żetony 🪙". Step-up 2FA od ±10 000 **dla obu walut** — żetony nie mają wartości rynkowej,
   ale przejęta sesja admina mass-mintująca je i tak zaburzyłaby leaderboardy kasyna.
   **+12 testów trasy** (mock prisma/admin/anomaly — zero DB).
   ⚠️ **Przy okazji domknięta realna dziura Fazy 8:** `economy-anomaly.ts` agregowało
   `type:"admin_grant"` **bez filtra waluty**, mimo że komentarz w `schema.prisma` obiecywał
   „anomaly-detection liczy tylko realne GT". Bez poprawki pierwszy grant żetonów na evencie
   odpaliłby alarm „ktoś mintuje GT" — i znieczulił ten, który ma znaczenie. Teraz
   `where: { type:"admin_grant", currency:"GT", … }` (bezpieczne dla starych wierszy: kolumna
   jest NOT NULL z defaultem `"GT"`).
2. ✅ **CRUD casino-shopu (kosmetyki za chips)** — `currency` jest polem zapisywalnym w
   `POST`/`PATCH /api/admin/shop` (nieznana wartość = **400**, domyślna = `GT`, więc każdy
   istniejący klient tworzy dokładnie to co wcześniej). W panelu (sekcja „Sklep") doszedł
   **przełącznik waluty**: wybór `🪙 CHIPS` **wymusza** `category:"cosmetic"` i blokuje
   pozostałe kategorie, etykieta ceny zmienia się na „Cena (żetony 🪙)", a na liście item
   dostaje plakietkę `🪙 CHIPS` i cenę w swojej walucie. Inwariant i tak jest sprawdzany
   serwerowo — UI tylko nie pozwala złożyć żądania, które i tak dostałoby 400.
   *Konfiguracja dziennego grantu — nadal ⏳.*
   **Dlaczego to była luka platformowa:** kasyno na żetonach działa na **każdym** portalu,
   ale sink na wygrane żetony istniał tylko u założyciela (4 kosmetyki z `prisma/seed.ts`),
   a jedyną drogą dołożenia kolejnych był destrukcyjny re-seed (`deleteMany` całego katalogu).
3. ✅ **Panel ekonomii: osobne metryki GT vs chips** — `/admin#economy` pokazuje **dwa obiegi**:
   blok główny (realne GT, bez zmian) i nowy blok „Obieg żetonów (osobny)" — żetony w obiegu,
   mint/burn w oknie 30 dni, status zdrowia i top źródła/spusty żetonów. **Nie kosztuje ani
   jednego zapytania więcej:** `currency` przeszło z *filtra* na **klucz `groupBy`**, więc obie
   waluty wychodzą z tego samego odczytu (a `user.aggregate` sumuje `tokens` i `chips` naraz).
   Trend dzienny i top-userzy zostają **GT-only** — „najszczęśliwszy gracz kasyna" to nie jest
   sygnał o zdrowiu ekonomii. Blok chips renderuje się **tylko** gdy portal ma jakikolwiek ruch
   żetonów, więc dashboard portalu bez kasyna wygląda dokładnie jak wcześniej. Logika podziału
   wyciągnięta do czystych, testowanych `flowForCurrency` / `splitSourcesSinks`
   (`lib/economy-health.ts`, **+8 testów**; nieznana/legacy waluta liczy się jako GT — tak samo
   jak czytają ją `shop/buy` i `planRefund`). Przy okazji etykiety sekcji przestały mówić
   „GT" na sztywno (`%gt%` → symbol waluty portalu).

### Bot na czacie (waluta i marka)
Wrappery botowe (`api/bot/gt-game`, `api/bot/duel`) zostały przy Fazie 2 nietknięte i dalej
mówiły „GT", choć `playGtGame`/`duels` liczą **żetony** — czyli bot ogłaszał wygraną w realnej
walucie portalu za pieniądze, które realne nie są. Teraz wszędzie `CHIP_SYMBOL` (🪙), spójnie
z `lib/duels.ts`/`lib/heist.ts`; marka w odpowiedzi `bot/duel` idzie z `getCurrentTenant()`.
**Uwaga na przyszłość:** odpowiedzi bota trafiają na czat **werbatim** — markery `%gt%`
nie mają tam kto rozwiązać, więc waluta kasyna zostaje dosłowna (uniwersalna), a marka jest
rozwiązywana w kodzie. Pilnuje tego `src/app/api/bot/__tests__/chat-reply-branding.test.ts`.

### Alert na overlayu (waluta per zakup)
Alert `shop_purchase` etykietuje kwotę walutą, którą **faktycznie obciążono**: `🪙` dla zakupu za
żetony, `tenant.tokenSymbol` dla GT. Wcześniej był tam literał `"GT"` — czyli zakup za darmowe
żetony ogłaszał się na streamie jako realna waluta (a na obcym portalu jako waluta założyciela).
Ta sama poprawka objęła pozostałe alerty z zaszytym „GT" (`drops/claim`, `sound-rewards`,
`admin/alerts`, `lib/auth` — powitanie).

### Sklep widziany przez widza (waluta per item)
`ShopClient` rozwiązuje cenę **per item**, nie globalnie: item `CHIPS` pokazuje cenę w 🪙,
liczy „stać/nie stać" wobec salda **żetonów** (a nie GT), a modal potwierdzenia pokazuje saldo
i „po zakupie" w tej samej walucie. Saldo żetonów (osobny, bursztynowy kafelek) i zdanie
`shop.helpChips` („kosmetyka bez wartości rynkowej; żetonów nie można kupić ani wypłacić")
pojawiają się **tylko** gdy katalog portalu faktycznie ma itemy za żetony. `/shop` dociąga w tym
celu `User.chips` obok `tokens`. Wcześniej wszystko było renderowane symbolem GT — na portalu
założyciela zaseedowane kosmetyki „High Roller" pokazywały się jako cena w GT i „za mało GT",
mimo że `shop/buy` obciążał żetony.

## Faza 7 — komunikaty / regulamin
1. Donacje: „**podziękowanie**", nie „kup walutę"; zdjąć kurs PLN→GT (Faza 0).
2. Regulamin/ToS + tekst w kasynie: „**Żetony to waluta wirtualna bez wartości pieniężnej; nie można ich
   kupić, wypłacić ani wymienić na nagrody o wartości rynkowej. Gra wyłącznie w celach rozrywkowych, 18+.**"
3. `GamblingGate` — zaktualizować copy (żetony, nie GT).

## Faza 8 — ekonomia / anomalie / jackpot
1. ✅ **`src/lib/economy-anomaly.ts`** i weekly-ranking liczą realną ekonomię po `currency: "GT"`
   (anomaly domknięte przy grancie żetonów — patrz Faza 6 §1; weekly-ranking już wcześniej).
2. **Jackpot** (`gt-games.ts` Redis) — pula **żetonowa**, bez wartości (komunikat „jackpot w żetonach"). ⏳
3. ✅ Dashboard „zdrowie ekonomii" — dwa obiegi (GT vs chips) osobno (patrz Faza 6 §3).

---

## Weryfikacja (per faza, z `ghost-empire-web/`)
```
npx tsc --noEmit        # typy
npx vitest run          # testy (economy/gt-games/wheel mają testy — zaktualizować na chips)
npx eslint <changed>
npx next build
npm run docs:check && npm run docs:env
```
**⚠️ db push (Faza 1)** — tylko za wyraźną zgodą właściciela, z backupem (patrz `docs/BACKUP.md`).

## Rollback
- Kod: rewers commitów (kasyno wraca na `tokens`).
- DB: `chips`/`currency` mają defaulty — pozostawienie kolumn jest nieszkodliwe; twardy rollback = usunięcie kolumn (destrukcyjny, backup najpierw).

## Kolejność realizacji (rekomendowana)
Faza 0 → 1 (db push) → 2 (silnik) → 3 (źródła) → 4 (sklep) → 5 (UI) → 7 (regulamin) → 6 (admin) → 8 (ekonomia).
Każda faza: kod + testy + dokumentacja (`CHANGELOG`/`ENDPOINTS`/`ENV` wg `CLAUDE.md`) w tym samym kroku.

## Decyzje potrzebne od właściciela
1. **Zgoda na `db push`** (Faza 1 — `chips`, `currency`).
2. **Predictions** — na chips czy zostają na GT? (rekomendacja: zostają, do potwierdzenia u prawnika).
3. **Kwota dziennego grantu żetonów** + czy „welcome grant" jednorazowy.
4. **Duele/heist** — potwierdzić przeniesienie na chips (rekomendowane — to też stawka+losowość).
5. **Prawnik od prawa hazardowego** — krok równoległy; docelowo decyzja MF (art. 2 ust. 6).

## Powiązane
`docs/ENDPOINTS.md` (gt-games/wheel), `docs/ENV.md`, `prisma/schema.prisma`, `src/components/kasyno/GamblingGate.tsx`,
analiza ryzyka: pamięć projektu „casino-legal-risk".

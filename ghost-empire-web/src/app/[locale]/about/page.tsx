// src/app/about/page.tsx
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";
import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import {
  ShoppingBag, Trophy, Calendar, Award,
  Zap, Sparkles, ArrowRight, Dice5, Ticket,
} from "lucide-react";
import { SocialLinksGrid, SocialLinksRow } from "@/components/SocialLinks";
import { ChangelogList } from "@/components/ChangelogList";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return { title: t("metaTitle"), description: t("metaDesc"), alternates: localeAlternates("/about", locale) };
}

const CHANGELOG = [
  {
    date: "2026-06-10",
    title: "Panel admina: tryby trudności i opisy wszystkich sekcji 🧭",
    items: [
      "Panel administracyjny ma teraz trzy tryby: Prosty (tylko codzienne narzędzia), Zaawansowany i Developer — nowi moderatorzy nie toną już w 30 sekcjach naraz. Każda sekcja dostała też opis: co robi, gdzie widać efekt i dlaczego połączenia z platformami potrzebują autoryzacji (oraz do czego NIE mają dostępu).",
    ],
  },
  {
    date: "2026-06-10",
    title: "Nowa gra: Zdrapki 🎫",
    items: [
      "Kup los za swoją stawkę i zdrapuj 9 pól — trzy takie same symbole nagrody wygrywają mnożnik: od 1× za koniczynkę aż po 100× za jokera! Zdrapuj pojedynczo dla emocji albo odsłoń wszystko jednym kliknięciem. Tym samym kasyno ma już 10 gier!",
    ],
  },
  {
    date: "2026-06-10",
    title: "Nowa gra: Hi-Lo ↕️",
    items: [
      "Zgadnij, czy następna karta będzie wyższa czy niższa! Każde trafienie mnoży Twoją pulę (mnożnik zależy od szansy — widzisz go na przycisku), a serię możesz wypłacić w dowolnym momencie. Jedna pomyłka i wszystko przepada — ile razy odważysz się zgadywać?",
    ],
  },
  {
    date: "2026-06-10",
    title: "Nowa gra: Blackjack 🃏",
    items: [
      "W kasynie wylądował klasyczny Blackjack przeciwko krupierowi! Dobieraj do 21, krupier dobiera do 17. Wygrana płaci 2×, naturalny blackjack aż 2,5×, a remis zwraca stawkę. Możesz też podwoić zakład na pierwszych dwóch kartach. Karty rozdawane są z animacją, a zakryta karta krupiera odkrywa się na koniec.",
    ],
  },
  {
    date: "2026-06-10",
    title: "Happy hours — podwójne GT wieczorami 🔥",
    items: [
      "W godzinach 19:00-22:00 (czasu polskiego) wszystkie nagrody Ghost Tokens za czat i aktywność są mnożone ×2 — idealna pora, żeby wpaść na stream! Streamer może zmienić godziny i mnożnik w panelu.",
    ],
  },
  {
    date: "2026-06-10",
    title: "Nagrody za ranking tygodnia 🏆",
    items: [
      "Co poniedziałek o północy trójka graczy z największą liczbą zdobytych GT w minionym tygodniu dostaje automatyczne nagrody: 1000, 500 i 250 GT — wraz z powiadomieniem. Okno tygodniowe startuje od zera, więc każdy ma szansę!",
    ],
  },
  {
    date: "2026-06-10",
    title: "Progresywny JACKPOT w kasynie 💰",
    items: [
      "Nad grami w kasynie rośnie wspólna pula: 1% każdej stawki ją zasila, a startuje od 5000 GT. Trafienie trzech siódemek 7️⃣7️⃣7️⃣ w slotach wygrywa CAŁĄ pulę (plus zwykłą wygraną ×800)! Po trafieniu pula wraca do 5000 i rośnie od nowa.",
    ],
  },
  {
    date: "2026-06-10",
    title: "Prawdziwe kości 3D 🎲",
    items: [
      "W grze Kości rzucają się teraz dwie prawdziwe trójwymiarowe kostki — kotłują się w trakcie losowania i lądują dokładnie na cyfrach wyniku. Dodatkowo: jeśli Twój system ogranicza animacje (częsta przyczyna „braku animacji” np. w Firefoksie), przy stawce pojawi się przycisk 🎬, który jednym kliknięciem je wymusza.",
    ],
  },
  {
    date: "2026-06-10",
    title: "Kasyno jak prawdziwe — lobby z grami 🎰",
    items: [
      "Kasyno wita Cię teraz kafelkami gier: wybierasz jedną, a ona zajmuje cały ekran — bez rozpraszania pozostałymi. Wrócisz przyciskiem „Wszystkie gry”. Przy okazji naprawiliśmy pole stawki: można je wyczyścić i wpisać dowolną kwotę od zera.",
    ],
  },
  {
    date: "2026-06-10",
    title: "Ranking tygodnia 📅",
    items: [
      "W rankingu pojawiła się zakładka Tydzień — pokazuje, kto zdobył najwięcej Ghost Tokens w ostatnich 7 dniach. Świetna szansa dla nowych graczy, bo okno przesuwa się codziennie i każdy tydzień zaczyna się od zera.",
    ],
  },
  {
    date: "2026-06-10",
    title: "Dzienny bonus za wejście 🎁",
    items: [
      "Na stronie głównej czeka codzienny bonus Ghost Tokens: pierwszego dnia 50 GT, a każdy kolejny dzień serii dorzuca +25 GT (maks. 200 GT dziennie od 7. dnia). Wystarczy kliknąć Odbierz — seria rośnie, dopóki zaglądasz codziennie!",
    ],
  },
  {
    date: "2026-06-10",
    title: "Kasyno wygodniejsze na telefonie 📱",
    items: [
      "Plansze gier Crash i Plinko skalują się teraz do szerokości ekranu — nic się nie ucina na mniejszych telefonach.",
    ],
  },
  {
    date: "2026-06-10",
    title: "Twoja historia gier i statystyki 📜",
    items: [
      "Pod tablicą wygranych w kasynie znajdziesz teraz swoje statystyki (liczba gier, winrate, najlepsza wygrana, bilans) oraz listę ostatnich 12 gier z wynikami — odświeżaną na żywo po każdej rozgrywce.",
    ],
  },
  {
    date: "2026-06-10",
    title: "Dźwięki w kasynie + szybkie stawki 🔊",
    items: [
      "Kasyno gra teraz dźwiękiem: start gry, wygrana, przegrana, bomba i wypłata mają własne, krótkie efekty (możesz je wyciszyć przyciskiem 🔊 przy stawce — ustawienie się zapamiętuje). Obok pola stawki pojawiły się też chipy 10 / 50 / 100 / 500 / MAX do błyskawicznej zmiany kwoty.",
    ],
  },
  {
    date: "2026-06-10",
    title: "Saldo Ghost Tokens odświeża się natychmiast ⚡",
    items: [
      "Licznik GT na górnym pasku aktualizuje się teraz od razu po każdej grze, zakupie, odebraniu questa, kodzie drop czy zakładzie — bez przeładowania strony. Tokeny zarabiane za oglądanie i czat pojawiają się automatycznie najpóźniej po minucie.",
    ],
  },
  {
    date: "2026-06-10",
    title: "Kości z prawdziwą animacją + konfetti przy wygranej 🎲",
    items: [
      "Gra w kości dostała pełną animację: licznik migocze, a wskaźnik zamiata tor już od momentu kliknięcia, po czym płynnie dojeżdża na wylosowaną liczbę. Każda wygrana — we wszystkich grach kasyna — kończy się teraz rozbłyskiem konfetti i podświetleniem kwoty.",
    ],
  },
  {
    date: "2026-06-10",
    title: "Strona dropów mówi w Twoim języku 🌍",
    items: [
      "Strona z drop code’ami była częściowo po polsku nawet po przełączeniu języka — teraz opis, licznik aktywnych dropów, statystyki, historia i sekcja „Jak to działa” są przetłumaczone na wszystkie 14 języków portalu.",
    ],
  },
  {
    date: "2026-06-10",
    title: "Drobna poprawka strony głównej 🩹",
    items: [
      "Plakietka „HOT” w sekcji „Gorące w sklepie” nie zasłania już nazw produktów — dłuższe nazwy są teraz elegancko skracane wielokropkiem tuż przed plakietką.",
    ],
  },
  {
    date: "2026-06-10",
    title: "Interaktywny samouczek 🧭",
    items: [
      "Kliknij ? na górnym pasku, a przewodnik oprowadzi Cię po portalu — podświetla kolejne elementy i wyjaśnia, do czego służą. Na stronie kasyna pokazuje po kolei wszystkie gry, a na innych stronach ich najważniejsze funkcje. Możesz go włączyć w każdej chwili i na każdej stronie, także bez logowania. Dostępny w 14 językach.",
    ],
  },
  {
    date: "2026-06-10",
    title: "Wszystko jest teraz opisane ❓",
    items: [
      "Każda sekcja portalu ma rozwijany box „Jak to działa?” z prostym wyjaśnieniem — co to jest, gdzie tego użyć i co z tego masz. W kasynie dodatkowo każda gra ma dymek z zasadami i mnożnikami. Wszystko w 14 językach portalu.",
    ],
  },
  {
    date: "2026-06-09",
    title: "Nowa gra: Pole minowe (Mines) 💣",
    items: [
      "Czwarta nowa gra w kasynie — Pole minowe. Wybierasz liczbę bomb, a potem odkrywasz pola na siatce 5×5: każde bezpieczne pole podbija mnożnik, ale trafienie bomby kończy grę. Możesz wypłacić w dowolnym momencie. Im więcej bomb i odkrytych pól, tym większa wygrana. Tym samym mamy komplet czterech nowych gier: Kości, Crash, Plinko i Pole minowe!",
    ],
  },
  {
    date: "2026-06-09",
    title: "Nowa gra: Plinko 🔵",
    items: [
      "Trzecia nowa gra w kasynie — Plinko. Upuszczasz kulkę, która odbija się od kołków i ląduje w jednej z przegródek z mnożnikiem; przegródki na krawędziach płacą najwięcej (do 13×), a te w środku najmniej. Kulka zjeżdża dokładnie po ścieżce wylosowanej przez serwer — w pełni fair. Przy okazji wynik gry pokazuje teraz zmianę salda netto.",
    ],
  },
  {
    date: "2026-06-09",
    title: "Nowa gra: Crash (Rakieta) 🚀",
    items: [
      "Kolejna nowa gra w kasynie — Crash. Rakieta startuje, a mnożnik rośnie coraz szybciej; ustalasz swój próg auto-wypłaty (np. 2×) i wygrywasz, jeśli rakieta go osiągnie, zanim wybuchnie. Im wyższy próg, tym mniejsza szansa, ale większa wygrana. Punkt wybuchu losuje serwer — w pełni fair.",
    ],
  },
  {
    date: "2026-06-09",
    title: "Nowa gra: Kości 🎲",
    items: [
      "W kasynie pojawiła się nowa gra — Kości. Wybierasz, czy wynik (0-99) padnie poniżej czy powyżej Twojego progu; im mniejsza szansa, tym wyższa wypłata. Animowany tor pokazuje na żywo, jak wskaźnik wjeżdża na wylosowaną liczbę. Wynik liczy serwer — fair jak w pozostałych grach.",
    ],
  },
  {
    date: "2026-06-09",
    title: "Nowe sloty i moneta — własna grafika 🎰",
    items: [
      "Sloty dostały własne, wektorowe symbole (wiśnie, cytryna, dzwonek, gwiazda, diament i szczęśliwa „7”) w złotej obudowie maszyny — a linia wygranej rozświetla się na złoto, gdy trafisz trzy takie same. Moneta w coinflipie to teraz prawdziwy kruszec z reliefem: złoty duch (wygrana) i stalowa czaszka (przegrana). Wszystko wektorowo, ostre na każdym ekranie.",
    ],
  },
  {
    date: "2026-06-09",
    title: "Nowa ruletka — jak prawdziwa 🎡",
    items: [
      "Koło ruletki dostało realistyczny wygląd (złota obręcz z diamentami, numerowane pola, centralny krzyż) i przeszło na wariant amerykański z polami 0 oraz 00 (38 pól). Całość wektorowo — ostra na każdym ekranie.",
    ],
  },
  {
    date: "2026-06-09",
    title: "Animacje w kasynie 🎰",
    items: [
      "Ruletka kręci się jak prawdziwe koło i zatrzymuje na wylosowanej liczbie, sloty mają bębny, a coinflip — obracającą się monetę. Animacje są w pełni płynne (wykorzystują GPU i pełną częstotliwość odświeżania Twojego monitora). Wyniki są takie same jak wcześniej — losuje je serwer, a animacja tylko je pokazuje.",
    ],
  },
  {
    date: "2026-06-09",
    title: "Czytelniejsze komunikaty przy logowaniu 💬",
    items: [
      "Gdy logowanie się nie powiedzie, zamiast technicznego komunikatu o błędzie konfiguracji zobaczysz teraz jasny komunikat z podpowiedzią (np. żeby spróbować zalogować się inną platformą). We wszystkich językach portalu.",
    ],
  },
  {
    date: "2026-06-09",
    title: "Poprawione nazwy graczy (logowanie Google) 🙂",
    items: [
      "Naprawiony błąd, przez który nowe konta — zwłaszcza logujące się przez Google — pokazywały się jako „Anonim”. Każde nowe konto dostaje teraz nick od razu, a konta Google przyjmują nazwę kanału YouTube (po zgodzie na dostęp do YouTube przy logowaniu).",
    ],
  },
  {
    date: "2026-06-09",
    title: "Ranking znów pokazuje wszystkich graczy 🏆",
    items: [
      "Naprawiony błąd, przez który część kont (zwłaszcza nowo założonych) nie pojawiała się w rankingu mimo posiadania Ghost Tokenów. Wszyscy gracze są teraz poprawnie widoczni na liście.",
    ],
  },
  {
    date: "2026-06-08",
    title: "Wzmocnienia bezpieczeństwa 🔒",
    items: [
      "Rutynowe wzmocnienia pod maską: odporne na ataki czasowe porównania sekretów usług wewnętrznych oraz szczelniejsze rozpoznawanie adresu portalu. Bez zmian w działaniu dla użytkowników.",
    ],
  },
  {
    date: "2026-06-08",
    title: "Stabilniejsze naliczanie Ghost Tokens 🛡️",
    items: [
      "Wzmocniliśmy spójność przyznawania Ghost Tokens przy równoczesnych żądaniach — nagrody za zadania dzienne oraz tokeny z subskrypcji są teraz naliczane dokładnie raz, nawet gdy to samo zdarzenie dotrze do nas kilka razy naraz.",
    ],
  },
  {
    date: "2026-06-08",
    title: "Płynniejsze przełączanie stron 🚀",
    items: [
      "Naprawiony błąd, przez który przy przechodzeniu między stronami na ułamek sekundy migał komunikat 404 (nie znaleziono strony), zanim załadowała się właściwa strona. Nawigacja jest teraz natychmiastowa i płynna.",
    ],
  },
  {
    date: "2026-06-08",
    title: "Portal w 14 językach 🌍",
    items: [
      "Ghost Empire jest już dostępny w 14 językach: polskim, angielskim, niemieckim, hiszpańskim, włoskim, francuskim, rosyjskim, ukraińskim, chińskim, japońskim, koreańskim, arabskim, portugalskim i indonezyjskim. Przełącz język w nagłówku. (Ten dziennik zmian zostaje po polsku.)",
      "Arabski wyświetla się od prawej do lewej (RTL). Tłumaczenia są wstępne — natywny przegląd przed pełnym wejściem na dany rynek.",
    ],
  },
  {
    date: "2026-06-07",
    title: "Panel obsługi po angielsku 🌍",
    items: [
      "Wewnętrzny panel administracyjny (dla obsługi streamu) jest tłumaczony na angielski — partiami. (Ten dziennik zmian zostaje po polsku.)",
    ],
  },
  {
    date: "2026-06-07",
    title: "Profil i powiadomienia po angielsku 🌍",
    items: [
      "Twój profil (statystyki, osiągnięcia, historia, połączone konta) oraz dzwonek powiadomień są już w pełni dostępne po angielsku. (Ten dziennik zmian zostaje po polsku.)",
    ],
  },
  {
    date: "2026-06-07",
    title: "Liczby w formacie angielskim 🌍",
    items: [
      "W wersji EN liczby (np. salda, koszty, XP) grupują się po angielsku — 1,234,567 zamiast 1 234 567. (Ten dziennik zmian zostaje po polsku.)",
    ],
  },
  {
    date: "2026-06-07",
    title: "Błędy w grach i akcjach po angielsku 🌍",
    items: [
      "Komunikaty błędów w akcjach (sklep, drop kody, sezony, predykcje, eventy, kasyno, koło fortuny, ankiety) pokazują się teraz po angielsku, gdy grasz w wersji EN. (Ten dziennik zmian zostaje po polsku.)",
    ],
  },
  {
    date: "2026-06-06",
    title: "Daty po angielsku 🌍",
    items: [
      "Daty i czasy względne (wczoraj, 3 dni temu, Zakończony) pokazują się teraz po angielsku, gdy przeglądasz portal w wersji EN. (Ten dziennik zmian zostaje po polsku.)",
    ],
  },
  {
    date: "2026-06-06",
    title: "Lepsze SEO wielojęzyczne 🌍",
    items: [
      "Każda strona ma teraz poprawne znaczniki języka (hreflang) i własny tytuł po angielsku — wyszukiwarki serwują właściwą wersję językową strony. (Ten dziennik zmian zostaje po polsku.)",
    ],
  },
  {
    date: "2026-06-06",
    title: "Cały portal po angielsku 🌍",
    items: [
      "Wszystkie strony — łącznie z tą — są już dostępne po angielsku. Przełącz język flagą w nagłówku. (Ten dziennik zmian zostaje po polsku.)",
    ],
  },
  {
    date: "2026-06-06",
    title: "Profile publiczne po angielsku 🌍",
    items: [
      "Publiczne profile graczy (statystyki, osiągnięcia, platformy) są już dostępne po angielsku. Tłumaczymy portal strona po stronie.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Eventy po angielsku 🌍",
    items: [
      "Eventy — giveawaye, raffle, happy hours i konkursy — są już dostępne po angielsku. Tłumaczymy portal strona po stronie.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Ranking po angielsku 🌍",
    items: [
      "Ranking (podium, tabela, sortowanie) jest już dostępny po angielsku. Tłumaczymy portal strona po stronie.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Osiągnięcia po angielsku 🌍",
    items: [
      "Galeria osiągnięć (filtry, postępy, nagrody) jest już dostępna po angielsku. Tłumaczymy portal strona po stronie.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Polityka prywatności po angielsku 🌍",
    items: [
      "Pełna polityka prywatności (RODO) jest już dostępna po angielsku. Tłumaczymy portal strona po stronie.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Regulamin po angielsku 🌍",
    items: [
      "Pełny regulamin jest już dostępny po angielsku. Tłumaczymy portal strona po stronie.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Gry po angielsku 🌍",
    items: [
      "Kasyno, Koło Fortuny i biblioteka gier są już dostępne po angielsku. Tłumaczymy portal strona po stronie.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Plan streamów i questy po angielsku 🌍",
    items: [
      "Plan streamów (z nazwami dni i miesięcy) oraz daily questy są już dostępne po angielsku. Tłumaczymy portal strona po stronie.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Drop codes i battle pass po angielsku 🌍",
    items: [
      "Box drop code'ów i strona battle passa (sezony) są już dostępne po angielsku. Tłumaczymy portal strona po stronie.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Logowanie i predykcje po angielsku 🌍",
    items: [
      "Ekran logowania i strona predykcji (zakładów) są już dostępne po angielsku. Tłumaczymy portal strona po stronie.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Kolejne strony po angielsku 🌍",
    items: [
      "Strona powitalna, ekran błędu logowania i ankiety są już dostępne po angielsku. Tłumaczymy portal strona po stronie.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Flagi języków + strona główna po angielsku 🌍",
    items: [
      "Przełącznik języka w nagłówku ma teraz flagi (PL/EN), a cała strona główna jest dostępna po angielsku. Kolejne strony tłumaczymy stopniowo.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Profil — konta i linki razem 🔗",
    items: [
      "Na profilu wszystko o kontach jest teraz w jednej sekcji — łączenie platform (Twitch/Kick/Discord/YouTube) i ich status (sub/VIP/mod) w jednym miejscu, plus Twoje linki społecznościowe.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Wersja angielska (EN) 🌍",
    items: [
      "Portal ma teraz wersję angielską — przełącznik PL/EN w nagłówku, a angielskie strony żyją pod adresami /en. Polskie adresy zostają bez zmian.",
      "Na start przetłumaczona jest nawigacja i stopka; reszta treści dochodzi stopniowo.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Wszystkie nakładki na żywo ⚡",
    items: [
      "Po alertach realtime dostały też pozostałe nakładki OBS — czat, cele, subathon, koło fortuny, ankiety, predykcje, licznik widzów i więcej: aktualizują się natychmiast, bez czekania na odświeżanie.",
      "Każda nakładka ma bezpieczny tryb awaryjny — jeśli połączenie na żywo nie zadziała, wraca do sprawdzonego trybu i nigdy nie gaśnie na streamie.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Alerty na żywo, bez opóźnień ⚡",
    items: [
      "Overlay alertów (donejty, suby, bity…) dostaje zdarzenia w czasie rzeczywistym — alert pojawia się na streamie od razu, gdy tylko wpadnie, zamiast czekać na kolejne odświeżenie.",
      "Jeśli połączenie na żywo z jakiegoś powodu nie zadziała, overlay sam wraca do starego, sprawdzonego trybu — nigdy nie gaśnie na wizji.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Szybsze widżety na żywo (cache) ⚡",
    items: [
      "Widżety OBS (np. licznik widzów) korzystają teraz ze współdzielonego cache (Redis) — mniej zapytań do platform, sprawniejsze odświeżanie i mniejsze ryzyko limitów.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Szybszy, nowocześniejszy silnik ⚡",
    items: [
      "Portal przeszedł na React Compiler (automatyczne optymalizacje renderowania) i szybszy build (Turbopack) — płynniej i sprawniej, bez zmian w wyglądzie.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Linki na profilu jak karty 🔗",
    items: [
      "Edytor linków na profilu działa teraz jak panel integracji: każda platforma to zwijana karta — widzisz status (@handle / brak / OAuth), a po kliknięciu rozwijasz edycję.",
      "Łączenie kont przez OAuth (Twitch / Kick / Discord / YouTube) — klikasz „Połącz”, przekierowuje na platformę i łączy — jest w karcie „Połączone konta” na profilu.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Czytelniejszy panel integracji 🔌",
    items: [
      "W panelu admina integracje (AI, Sentry, OBS) są teraz zwijane: widzisz status (skonfigurowane / brak), a po kliknięciu rozwijają się pola do edycji — koniec ze ścianą pól naraz.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Discord przeniesiony do E-Bota 💬",
    items: [
      "Naszym Discordem zajmuje się teraz osobny bot — E-Bot — a Empire Bot skupia się na streamie (Twitch/Kick/YouTube/Rumble).",
      "Ghost Tokeny za aktywność na Discordzie (pisanie na czacie + przebywanie na voice) oraz łączenie konta Discord z profilem działają dokładnie tak samo jak wcześniej — zmienił się tylko bot „pod maską”.",
      "Komenda /portal na Discordzie podrzuca link do portalu i ściągę, jak zarabiać GT.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Czytelniejsze górne menu 🧭",
    items: [
      "Górny pasek został pogrupowany w rozwijane sekcje (GRY, SPOŁECZNOŚĆ) — koniec z tłokiem, gdy przybywa zakładek. Klikasz/najeżdżasz na grupę i wysuwa się lista.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Ruletka 🎡 w kasynie",
    items: [
      "Doszła ruletka: obstaw czerwone/czarne (wygrana 2×) albo konkretną liczbę 0–36 (wygrana 36×).",
      "Na czacie: „!roulette 100 red” lub „!roulette 100 17”; na stronie /kasyno klikasz kolory albo wpisujesz liczbę.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Napad kooperacyjny 🏦 (!heist)",
    items: [
      "Nowa mini-gra dla całej widowni: wpisz „!heist 100”, żeby zebrać ekipę na napad na skarbiec Ghost Tokenów.",
      "Im więcej osób w ekipie, tym większa szansa powodzenia (do 60%). Sukces = każdy zgarnia 2× stawki, wpadka = ekipa traci stawki.",
      "Macie ~90 sekund na zebranie ekipy od pierwszego „!heist”.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Czytanie alertów na głos 🔊 (TTS)",
    items: [
      "Overlay alertów może teraz czytać donejty, suby i wygrane na głos — głosem przeglądarki, za darmo, bez żadnego zewnętrznego dostawcy.",
      "Streamer włącza to dopisując &tts=1 do adresu źródła alertów w OBS; zakres i głos można dostroić dodatkowymi parametrami (&ttsTypes, &ttsRate, &ttsVoice).",
    ],
  },
  {
    date: "2026-06-06",
    title: "Nowe osiągnięcia 🏆 — prestiż, pojedynki, kasyno",
    items: [
      "Doszło 7 nowych achievementów (jest ich teraz 60): za zdobycie gwiazdek prestiżu ✦, wygrane pojedynki !duel oraz granie w kasynie GT.",
      "Przyznają się automatycznie z nagrodą GT, gdy osiągniesz dany próg.",
    ],
  },
  {
    date: "2026-06-06",
    title: "Pojedynki PvP ⚔️ — graj o GT z innymi",
    items: [
      "Nowa mini-gra: wyzwij kogoś na pojedynek o Ghost Tokeny. Otwarte wyzwanie „!duel 100” (pierwszy chętny wpisuje !accept) albo konkretną osobę „!duel @nick 100”.",
      "Obaj stawiacie tyle samo, uczciwy rzut monetą (50/50) wyłania zwycięzcę, który bierze pulę pomniejszoną o 5% prowizji.",
      "Stawki pobierane są dopiero w chwili przyjęcia walki — wszystko atomowo, więc tokeny nie znikną ani nie powstaną przez przypadek.",
      "Twój bilans pojedynków (wygrane / przegrane + skuteczność) widać na profilu po pierwszej walce.",
    ],
  },
  {
    date: "2026-06-05",
    title: "Perk lojalnościowy — taniej w sklepie 🛒",
    items: [
      "Im wyższy poziom konta i prestiż, tym niższe ceny w sklepie: −0,15% za poziom i −1% za każdą gwiazdkę ✦, łącznie do −30%.",
      "Zniżkę widać od razu na karcie przedmiotu (przekreślona cena pełna + zniżkowa) i w okienku potwierdzenia zakupu.",
    ],
  },
  {
    date: "2026-06-05",
    title: "Prestiż ✦ — wniebowstąpienie po max levelu",
    items: [
      "Po dobiciu do maksymalnego poziomu (100) konta dalej zdobywasz prestiż: każde kolejne 50 000 XP to nowa gwiazdka ✦ — Twój poziom i XP nigdy się nie resetują.",
      "Każda gwiazdka daje dodatkowy bonus zarobku Ghost Tokens z czatu (+2% za gwiazdkę), kumulujący się z bonusem poziomu.",
      "Gwiazdki prestiżu widać na profilu (Twoim i publicznym) oraz w rankingu obok poziomu; po maxie pasek XP pokazuje postęp do następnej gwiazdki.",
    ],
  },
  {
    date: "2026-06-05",
    title: "Koło Fortuny 🎡",
    items: [
      "Nowa zabawa: wydaj Ghost Tokens, zakręć kołem i wygraj nagrody GT — wejdź w zakładkę „Koło”.",
      "Każde zakręcenie pokazuje się też na streamie z animacją koła i ogłoszeniem zwycięzcy.",
    ],
  },
  {
    date: "2026-06-05",
    title: "Czat na streamie: prawdziwe odznaki i emotki",
    items: [
      "Overlay czatu pokazuje teraz prawdziwe grafiki odznak Twitcha oraz emotki 7TV / BetterTTV / FrankerFaceZ (kanałowe i globalne).",
    ],
  },
  {
    date: "2026-06-05",
    title: "Zakłady: auto-zamykanie + ogłaszanie na czacie",
    items: [
      "Zakład sam zamyka się o ustawionej godzinie — status na stronie i overlayu zgadza się z czasem obstawiania.",
      "Możesz włączyć lub wyłączyć przypominanie o konkretnym zakładzie na czacie przez bota.",
    ],
  },
  {
    date: "2026-06-05",
    title: "Moderacja: surowsze kary dla recydywistów",
    items: [
      "Powtarzające się naruszenia są karane mocniej (ostrzeżenie → usunięcie → timeout, z rosnącym czasem).",
      "Panel pokazuje statystyki naruszeń i najczęstszych sprawców.",
    ],
  },
  {
    date: "2026-06-05",
    title: "Bezpieczeństwo: szyfrowanie danych",
    items: [
      "Wszystkie klucze API i tokeny logowania platform są teraz szyfrowane w bazie danych.",
    ],
  },
  {
    date: "2026-06-03",
    title: "Alerty na streamie — ustawienia per typ",
    items: [
      "Dla każdego typu alertu (sub, donejt, raid, powitanie...) ustawisz osobno animację wejścia, pozycję na ekranie, własny dźwięk i próg kwotowy.",
    ],
  },
  {
    date: "2026-06-03",
    title: "Odświeżone ikony social",
    items: [
      "Logo marek (YouTube, Instagram, X) jako własne grafiki SVG — spójne i niezależne od biblioteki ikon.",
    ],
  },
  {
    date: "2026-06-03",
    title: "Poprawne nicki Kick i YouTube",
    items: [
      "Kick pokazuje teraz prawdziwy nick zamiast fragmentu adresu e-mail.",
      "YouTube dociąga prawdziwy uchwyt kanału i nazwę — zaloguj się ponownie przez Google, aby odświeżyć.",
    ],
  },
  {
    date: "2026-06-02",
    title: "Dostępność (a11y)",
    items: [
      "Widoczny obrys przy nawigacji klawiaturą, skrót przejścia do treści oraz poszanowanie ustawienia ograniczenia animacji.",
    ],
  },
  {
    date: "2026-06-02",
    title: "Własne alerty na streamie",
    items: [
      "Możesz stworzyć własne alerty (tytuł, treść, ikona, kolor, liczba) i wyzwalać je ręcznie na overlayu OBS — np. raid czy ogłoszenie.",
      "Każdy alert ma podgląd na żywo w panelu.",
    ],
  },
  {
    date: "2026-06-02",
    title: "Chat na streamie — własny wygląd",
    items: [
      "Czat na overlayu OBS można teraz dostosować: rozmiar tekstu, kolor, czcionka, krycie tła i ikona platformy.",
      "Wszystko z podglądem na żywo w panelu (/admin#chat).",
    ],
  },
  {
    date: "2026-06-01",
    title: "Profil: przycisk wyloguj + czytelny audit log",
    items: [
      "W zakładce profil jest teraz przycisk Wyloguj (obok danych konta).",
      "Audit log w panelu pokazuje nick administratora zamiast imienia i nazwiska.",
    ],
  },
  {
    date: "2026-06-01",
    title: "Menu konta — wyloguj działa na telefonie",
    items: [
      "Menu pod avatarem (z opcją Wyloguj się oraz skrótem do profilu) otwiera się teraz kliknięciem — wcześniej na telefonie nie dało się go otworzyć.",
    ],
  },
  {
    date: "2026-06-01",
    title: "Dopięcie brandingu + płynniejszy panel",
    items: [
      "Stopka i ekran logowania dostały logo z czaszką (zostały na starym placeholderze).",
      "Przełączanie sekcji w panelu admina ma teraz płynne przejście; ekran logowania pokazuje czytelny błąd, gdy logowanie się nie powiedzie.",
      "Ekran ładowania (przy przełączaniu stron), strony błędów oraz sekcja O nas też mają już czaszkę zamiast starego logo.",
    ],
  },
  {
    date: "2026-06-01",
    title: "Poprawka prywatności w profilu",
    items: [
      "W „połączonych platformach” nie pokazuje się już imię i nazwisko zamiast nicka (dotyczyło m.in. YouTube / Kick).",
      "Nagłówek profilu (obok plakietki ADMIN), menu konta w nagłówku i profil publiczny pokazują teraz nick, a nie imię i nazwisko.",
    ],
  },
  {
    date: "2026-06-01",
    title: "Ankiety / głosowania",
    items: [
      "Nowa zakładka „Ankiety” — głosuj w decyzjach społeczności (np. w co gramy w piątek).",
      "Możesz zmienić swój głos, dopóki ankieta jest otwarta; wyniki widać na żywo.",
    ],
  },
  {
    date: "2026-06-01",
    title: "Eventy okolicznościowe",
    items: [
      "Gotowe szablony świąteczne (Dzień Kobiet, Walentynki, Wielkanoc, Halloween, Boże Narodzenie, Sylwester) — streamer odpala event jednym kliknięciem.",
      "Happy hour z bonusem do tokenów albo giveaway z nagrodą.",
    ],
  },
  {
    date: "2026-06-01",
    title: "Własne osiągnięcia + nagrody rzeczowe",
    items: [
      "Streamer może tworzyć własne osiągnięcia w panelu i przyznawać je ręcznie wybranej osobie.",
      "Osiągnięcie może dawać nagrodę rzeczową (kod do gry / przedmiot / rola), nie tylko tokeny i XP.",
    ],
  },
  {
    date: "2026-06-01",
    title: "Battle Pass — nagrody rzeczowe",
    items: [
      "Tier w battle passie może dać nie tylko tokeny, ale też przedmiot lub kod (np. klucz do gry).",
      "Kod pokazuje się graczowi po odebraniu nagrody; przedmiot odbierasz przez ticket.",
    ],
  },
  {
    date: "2026-06-01",
    title: "Sklep: grafiki przedmiotów + odblokowania",
    items: [
      "Przedmioty w sklepie mogą mieć własną grafikę / screen zamiast emoji.",
      "Nagrodę można odblokować przez zdobycie konkretnego osiągnięcia — zablokowane pokazują, czego brakuje.",
    ],
  },
  {
    date: "2026-06-01",
    title: "Podglądy overlayów w panelu",
    items: [
      "Stream Goals, Subathon i Chat overlay mają teraz podgląd „jak w OBS” oraz gotowy URL do skopiowania — tak jak Stream Alerts.",
    ],
  },
  {
    date: "2026-06-01",
    title: "Drop kodów na streamie",
    items: [
      "Streamer może wrzucić pulę kodów (np. klucze do gier) — overlay pokazuje losowy kod na ekranie i zmienia go co ustawiony czas.",
      "Każdy kod wejdzie zanim któryś się powtórzy.",
      "W panelu: hurtowe dodawanie, podgląd na żywo i gotowy URL do OBS.",
    ],
  },
  {
    date: "2026-06-01",
    title: "Panel admina — szybciej i czytelniej",
    items: [
      "Nadawanie rang, statusu i punktów działa szybciej — efekt widać od razu po kliknięciu.",
      "Audit log pokazuje teraz czytelnie: kto (nick admina) co zrobił i komu (nick), zamiast surowych identyfikatorów.",
      "Konto właściciela jest na stałe administratorem (przeżywa nawet reset bazy).",
      "Reset bazy z panelu (tylko admin, z potwierdzeniem) — czyści użytkowników i ich dane, zostawia całą konfigurację.",
    ],
  },
  {
    date: "2026-06-01",
    title: "Nowy branding — czaszka GHOST77",
    items: [
      "Prawdziwe logo (czaszka GHOST77) zamiast placeholdera — w nagłówku, na stronie startowej i głównej.",
      "Favicon i ikony PWA (instalacja na telefonie / pulpicie) z czaszką.",
      "Obraz podglądu przy udostępnianiu linku (Discord / Twitter) — baner GHOST77 zamiast generycznego.",
      "Domyślny avatar (gdy nie masz ustawionego zdjęcia) to teraz czaszka — w rankingu, profilu i eventach.",
    ],
  },
  {
    date: "2026-05-31",
    title: "Poprawka — nadawanie rang i tokenów po ID konta",
    items: [
      "Nadawanie rang (admin / moderator / donator), statusu sub/mod/VIP oraz tokenów przyjmuje teraz username, Discord ID lub ID konta — wcześniej wklejenie ID konta zwracało błąd „user nie znaleziony”.",
      "Rangę subskrybenta nadaje admin/moderacja w sekcji „Status na platformie (sub/mod/VIP)”; suby z Twitch i Kick oraz członkostwa YouTube ustawiają ją automatycznie.",
    ],
  },
  {
    date: "2026-05-30",
    title: "Chat bot (3 platformy) + engagement + analityka",
    items: [
      "Chat bot Twitch + Kick + YouTube — 1 GT/min/widz na każdej platformie, auto-refresh tokenów",
      "Komendy zarządzane z portalu (/admin#chat) — koniec hardkodów, edycja bez restartu bota",
      "Timery — cykliczne wiadomości broadcastowane na 3 platformy (tylko gdy czat aktywny)",
      "FAQ / auto-odpowiedzi na słowa kluczowe (/admin#faq)",
      "Powitania widzów + opcjonalny bonus GT przy pierwszej wiadomości (/admin#welcome)",
      "Song requests — kolejka !sr z tytułami z YouTube/Spotify, zarządzanie w /admin#songs",
      "Chat overlay OBS — czat z 3 platform w jednym oknie (/overlay/chat)",
      "Subathon / Goalathon — countdown przedłużany subami i donacjami + overlay (/overlay/subathon)",
      "Heatmapa aktywności czatu w panelu (/admin#analytics)",
      "Aktywność na czacie liczy się teraz do dziennych questów (tak jak Discord)",
      "Hosting bota 24/7 (Docker) — niezależny od włączonego PC",
    ],
  },
  {
    date: "2026-05-29",
    title: "Phase 3 — Engagement + hardening",
    items: [
      "Battle Pass / Sezony — miesięczne sezony, 30 tierów, XP za każdą aktywność, nagrody do odbioru (/seasons)",
      "Predictions — obstawiaj wynik streama GT, wygrywający dzielą całą pulę (/predictions)",
      "Stream Goals + Hype Train — cele na żywo z overlayem OBS, auto-inkrementacja z subów/donacji/bitów",
      "53 achievementy — rozbudowa o donacje, suby, gifty, bity, super chaty, dropy, eventy (auto-przyznawane)",
      "Kick auto-eventy — webhooki dla subów / gift subów / followów (zamyka Phase 2)",
      "YouTube Live — Super Chaty i membery wykrywane podczas live (zamyka Phase 2)",
      "Instalowalna PWA (ikony + manifest), tryb offline-friendly, robots.txt + sitemap.xml",
      "Szybsze ładowanie — cache publicznych zapytań, indeksy DB, lazy-load sekcji admina",
      "Twardsze bezpieczeństwo — rate limiting na całej ekonomii, mocniejsze nagłówki CSP/COOP",
    ],
  },
  {
    date: "2026-05-26",
    title: "EventSub + Donacje + Alerty OBS",
    items: [
      "Twitch EventSub — auto-tracking subów, gifted subów i bitów z mapowaniem na GT",
      "Donacje Streamlabs — auto-match po nicku, 1 PLN = 100 GT, odznaki donatora",
      "Stream Alerts — overlay OBS (Browser Source) z animacjami i dźwiękiem alertów",
      "Łączenie kont z /profile — Twitch/Kick/Discord/Google na jednym koncie",
      "Merge duplikatów w adminie — scalanie starych zdublowanych kont",
      "Plansze społeczności (social tiles) na profilu — auto z OAuth",
    ],
  },
  {
    date: "2026-05-25",
    title: "Security & Roles update",
    items: [
      "Role system: ADMIN / MODERATOR / DONATOR badges (header + profile + ranking)",
      "Platform roles per Connection: SUB (T1/T2/T3/Prime), MOD, VIP — manualne flagowanie z admin panelu",
      "Discord link UI na /profile — generuj 6-znakowy kod i wpisz /link kod:XXX na serwerze",
      "Security headers: HSTS preload, CSP, X-Frame-Options, Permissions-Policy",
      "Rate limiting (DB-backed sliding window) na publicznych i internal endpointach",
      "Audit log wszystkich akcji admin — kto/kiedy/co/IP, viewer w panelu",
      "Production deploy na Vercel + GitHub auto-deploy on push do main",
    ],
  },
  {
    date: "2026-05-20",
    title: "Phase 1 launch",
    items: [
      "Pełna autoryzacja przez Twitch i Discord OAuth",
      "Sklep z 12 itemami w 5 kategoriach + ograniczenia per sub tier",
      "Eventy: giveawaye, raffles z kupowaniem biletów, happy hours, konkursy",
      "Drawing logic: losowanie zwycięzców (crypto-secure RNG)",
      "Ranking po 4 metrykach + podium top 3",
      "Profil z 22 achievementami, social linkami i historią transakcji",
      "Daily questy (messages / voice / drop_code) + claim",
      "Drop codes z bonus slots dla najszybszych",
      "Notifications widget (bell + dropdown z pollingiem)",
      "Discord bot (discord.js v14) z anti-spam cooldownem",
    ],
  },
];

export default async function AboutPage() {
  const session = await auth();
  const isAuthed = !!session?.user?.id;
  const t = await getTranslations("about");

  const features = [
    { icon: ShoppingBag, color: "#E50914", href: "/shop", title: t("featShopTitle"), desc: t("featShopDesc") },
    { icon: Trophy, color: "#FFD700", href: "/ranking", title: t("featRankTitle"), desc: t("featRankDesc") },
    { icon: Calendar, color: "#10b981", href: "/events", title: t("featEventsTitle"), desc: t("featEventsDesc") },
    { icon: Dice5, color: "#8b5cf6", href: "/predictions", title: t("featPredTitle"), desc: t("featPredDesc") },
    { icon: Ticket, color: "#f59e0b", href: "/seasons", title: t("featPassTitle"), desc: t("featPassDesc") },
    { icon: Award, color: "#a855f7", href: "/achievements", title: t("featAchTitle"), desc: t("featAchDesc") },
    { icon: Zap, color: "#FF4500", href: "/quests", title: t("featQuestTitle"), desc: t("featQuestDesc") },
    { icon: Sparkles, color: "#3b82f6", href: "/profile", title: t("featStreakTitle"), desc: t("featStreakDesc") },
  ];
  const steps = [
    { n: 1, title: t("step1Title"), desc: t("step1Desc") },
    { n: 2, title: t("step2Title"), desc: t("step2Desc") },
    { n: 3, title: t("step3Title"), desc: t("step3Desc") },
    { n: 4, title: t("step4Title"), desc: t("step4Desc") },
  ];
  const earnWays = [
    { emoji: "💬", title: t("earn1Title"), desc: t("earn1Desc") },
    { emoji: "🎤", title: t("earn2Title"), desc: t("earn2Desc") },
    { emoji: "🎁", title: t("earn3Title"), desc: t("earn3Desc") },
    { emoji: "👑", title: t("earn4Title"), desc: t("earn4Desc") },
    { emoji: "💸", title: t("earn5Title"), desc: t("earn5Desc") },
    { emoji: "🎲", title: t("earn6Title"), desc: t("earn6Desc") },
    { emoji: "⚡", title: t("earn7Title"), desc: t("earn7Desc") },
    { emoji: "🏆", title: t("earn8Title"), desc: t("earn8Desc") },
  ];

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/4 w-[700px] h-[700px] rounded-full blur-[160px] opacity-15"
          style={{ background: "radial-gradient(circle, #E50914 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-1/4 right-0 w-[500px] h-[500px] rounded-full blur-[130px] opacity-10"
          style={{ background: "radial-gradient(circle, #8B0000 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        {/* Hero */}
        <section className="py-12 sm:py-20 text-center">
          <div className="inline-flex items-center justify-center mb-6">
            <div className="w-20 h-20 sm:w-24 sm:h-24 overflow-hidden rounded-2xl ring-2 ring-red-600/40 shadow-[0_0_50px_rgba(229,9,20,0.35)]">
              <img src="/brand/skull.png" alt="GH0ST EMPIRE" className="w-full h-full object-cover" />
            </div>
          </div>

          <h1
            className="font-display text-5xl sm:text-7xl text-white tracking-wider mb-3"
            style={{ textShadow: "3px 0 0 rgba(229,9,20,0.7), -3px 0 0 rgba(139,0,0,0.5)" }}
          >
            GH0ST EMPIRE
          </h1>
          <p className="text-zinc-400 text-base sm:text-lg max-w-2xl mx-auto mb-2">
            {t("heroSub1")}
          </p>
          <p className="text-zinc-500 text-sm max-w-2xl mx-auto mb-8">
            {t("heroSub2")}
          </p>

          {!isAuthed ? (
            <Link
              href="/auth/signin"
              className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-sm tracking-widest uppercase transition-all"
            >
              {t("signIn")} <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-sm tracking-widest uppercase transition-all"
            >
              {t("backToPortal")} <ArrowRight className="w-4 h-4" />
            </Link>
          )}

          {/* Compact social row under hero */}
          <div className="mt-8">
            <SocialLinksRow />
          </div>
        </section>

        {/* Co to jest */}
        <Section title={t("secWhat")} id="o-projekcie">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm leading-relaxed">
            <div className="md:col-span-2 text-zinc-300 space-y-3">
              <p>
                {t.rich("whatP1", {
                  b: (c) => <strong className="text-white">{c}</strong>,
                  r: (c) => <strong className="text-red-400">{c}</strong>,
                })}
              </p>
              <p>{t("whatP2")}</p>
              <p>
                {t.rich("whatP3", { b: (c) => <strong className="text-white">{c}</strong> })}
              </p>
            </div>
            <div
              className="border-2 border-red-900/50 bg-red-950/20 p-5 text-center flex flex-col justify-center"
              style={{
                clipPath:
                  "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
              }}
            >
              <div className="text-5xl mb-2">👻</div>
              <div
                className="font-display text-3xl text-white tracking-wider"
                style={{ textShadow: "2px 0 0 rgba(229,9,20,0.6)" }}
              >
                500 GT
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-red-300 mt-1">
                {t("welcomeBonus")}
              </div>
              <div className="text-xs text-zinc-500 mt-2">
                {t("welcomeBonusNote")}
              </div>
            </div>
          </div>
        </Section>

        {/* Funkcje */}
        <Section title={t("secFeatures")} id="funkcje">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <Link
                  key={f.title}
                  href={f.href}
                  className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-4 hover:border-red-900/50 transition-all group"
                  style={{
                    clipPath:
                      "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))",
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="w-9 h-9 flex items-center justify-center"
                      style={{ background: f.color + "20", border: `1px solid ${f.color}40` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: f.color }} />
                    </div>
                    <h3 className="font-display text-lg text-white tracking-wide group-hover:text-red-400 transition-colors">
                      {f.title}
                    </h3>
                  </div>
                  <p className="text-zinc-400 text-xs leading-relaxed">{f.desc}</p>
                </Link>
              );
            })}
          </div>
        </Section>

        {/* Jak zacząć */}
        <Section title={t("secStart")} id="jak-zaczac">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {steps.map((s) => (
              <div
                key={s.n}
                className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-4 flex gap-4"
              >
                <div
                  className="font-display text-4xl shrink-0 leading-none"
                  style={{ color: "#E50914", textShadow: "2px 0 0 rgba(139,0,0,0.5)" }}
                >
                  {s.n}
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm mb-1">{s.title}</h3>
                  <p className="text-zinc-400 text-xs leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Jak zarabiać */}
        <Section title={t("secEarn")} id="zarabianie">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {earnWays.map((w) => (
              <div
                key={w.title}
                className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-3 flex items-start gap-3"
              >
                <span className="text-2xl shrink-0">{w.emoji}</span>
                <div>
                  <h3 className="font-bold text-white text-sm mb-0.5">{w.title}</h3>
                  <p className="text-zinc-500 text-xs leading-relaxed">{w.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mt-4 text-center">
            {t("earnNote")}
          </p>
        </Section>

        {/* Socials */}
        <Section title={t("secSocials")} id="socials">
          <p className="text-zinc-400 text-sm mb-4 max-w-2xl">
            {t("socialsText")}
          </p>
          <SocialLinksGrid />
        </Section>

        {/* Changelog */}
        <Section title={t("secChangelog")} id="changelog">
          <p className="text-zinc-500 text-xs mb-4">{t("changelogIntro")}</p>
          <ChangelogList entries={CHANGELOG} />
        </Section>

        {/* Legal links */}
        <div className="py-6 text-center text-xs text-zinc-600 font-mono">
          <Link href="/privacy" className="hover:text-red-400 underline-offset-2 hover:underline">
            {t("privacy")}
          </Link>
          {" · "}
          <Link href="/terms" className="hover:text-red-400 underline-offset-2 hover:underline">
            {t("terms")}
          </Link>
        </div>

        {/* Final CTA */}
        {!isAuthed && (
          <section className="py-12 text-center">
            <div className="text-zinc-500 text-sm mb-4">{t("ready")}</div>
            <Link
              href="/auth/signin"
              className="inline-flex items-center gap-2 px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-bold text-base tracking-widest uppercase transition-all"
            >
              {t("join")} <ArrowRight className="w-5 h-5" />
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}

function Section({
  title, id, children,
}: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="py-8 sm:py-12 scroll-mt-20">
      <h2
        className="font-display text-3xl sm:text-4xl text-white tracking-wider mb-6"
        style={{ textShadow: "2px 0 0 rgba(229,9,20,0.5), -2px 0 0 rgba(139,0,0,0.3)" }}
      >
        {title.toUpperCase()}
      </h2>
      {children}
    </section>
  );
}

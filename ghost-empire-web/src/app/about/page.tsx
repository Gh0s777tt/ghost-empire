// src/app/about/page.tsx
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Header } from "@/components/Header";
import {
  Ghost, ShoppingBag, Trophy, Calendar, Award,
  Zap, Sparkles, ArrowRight, Dice5, Ticket,
} from "lucide-react";
import { SocialLinksGrid, SocialLinksRow } from "@/components/SocialLinks";
import { ChangelogList } from "@/components/ChangelogList";

export const metadata = {
  title: "O Ghost Empire",
  description: "Co to jest Ghost Empire, jak zarabiać Ghost Tokens i jak zacząć.",
};

const FEATURES = [
  {
    icon: ShoppingBag, color: "#E50914",
    title: "SKLEP",
    desc: "Klucze Steam, skiny CS2, gifted suby, voice z Ghostem. Każda nagroda za Ghost Tokens.",
    href: "/shop",
  },
  {
    icon: Trophy, color: "#FFD700",
    title: "RANKING",
    desc: "4 rankingi: balans, lifetime earnings, level, streak. Top 100 + Twoja pozycja.",
    href: "/ranking",
  },
  {
    icon: Calendar, color: "#10b981",
    title: "EVENTY",
    desc: "Giveawaye, raffles, happy hours z mnożnikami x2. Wygrywaj prawdziwe nagrody.",
    href: "/events",
  },
  {
    icon: Dice5, color: "#8b5cf6",
    title: "PREDICTIONS",
    desc: "Obstawiaj wynik streama Ghost Tokenami. Wygrywający dzielą całą pulę proporcjonalnie do stawek.",
    href: "/predictions",
  },
  {
    icon: Ticket, color: "#f59e0b",
    title: "BATTLE PASS",
    desc: "Miesięczne sezony, 30 tierów. Zbieraj XP za każdą aktywność i odbieraj nagrody z kolejnych poziomów.",
    href: "/seasons",
  },
  {
    icon: Award, color: "#a855f7",
    title: "OSIĄGNIĘCIA",
    desc: "53 achievementy: common, rare, epic, legendary. Za level, streak, suby, donejty, dropy i eventy.",
    href: "/achievements",
  },
  {
    icon: Zap, color: "#FF4500",
    title: "DAILY QUESTY",
    desc: "Codziennie 3 zadania: czat, voice, drop. Bonus reward za wszystkie naraz.",
    href: "/quests",
  },
  {
    icon: Sparkles, color: "#3b82f6",
    title: "STREAK SYSTEM",
    desc: "Każdy dzień aktywności = +1 do streaka. Im dłużej, tym większy bonus daily.",
    href: "/profile",
  },
];

const EARN_WAYS = [
  { emoji: "💬", title: "Wiadomości na Discord", desc: "Aktywny czat = tokeny. Daily limit chroni przed spamem." },
  { emoji: "🎤", title: "Voice chat", desc: "Spędź czas na voice channelach z innymi. Tokeny lecą za każdą minutę." },
  { emoji: "🎁", title: "Drop codes podczas live", desc: "Ghost wpisuje sekretne kody na stream. Wpisz pierwszy = bonus reward." },
  { emoji: "👑", title: "Suby, gifty i bity", desc: "Sub na Twitch/Kick, gifted suby i bity są wykrywane automatycznie i nagradzane GT." },
  { emoji: "💸", title: "Donacje i Super Chaty", desc: "Donejt przez Streamlabs lub YouTube Super Chat = tokeny + odznaki patrona." },
  { emoji: "🎲", title: "Predictions", desc: "Dobrze obstawiony zakład na /predictions = część puli przegranych dla Ciebie." },
  { emoji: "⚡", title: "Happy Hours x2", desc: "W trakcie aktywnego Happy Hour wszystkie tokeny lecą podwójnie." },
  { emoji: "🏆", title: "Daily questy", desc: "3 zadania dziennie. Skończ wszystkie = bonus pula." },
];

const STEPS = [
  { n: 1, title: "Zaloguj się", desc: "Przez Twitch, Kick, Discord lub Google/YouTube — wybór masz na stronie logowania. Pierwsze logowanie = 500 GT welcome bonus." },
  { n: 2, title: "Połącz pozostałe platformy", desc: "Wejdź na /profile i dolinkuj resztę kont do jednego profilu. Sub na Twitch i Kick naraz = Dual Supporter." },
  { n: 3, title: "Bądź aktywny", desc: "Pisz na Discord, hańguj na voice, wpisuj drop codes podczas live. Tokeny lecą w tle." },
  { n: 4, title: "Wymień na nagrody", desc: "Wejdź na /shop. Coś dla każdego — od 8,000 GT (kolor nicka) po 1,500,000 GT (legendarny skin)." },
];

const CHANGELOG = [
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
  const session = await getServerSession(authOptions);
  const isAuthed = !!session?.user?.id;

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
            <div
              className="w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #E50914 0%, #8B0000 100%)",
                clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
              }}
            >
              <Ghost className="w-10 h-10 sm:w-12 sm:h-12 text-white" strokeWidth={2} />
            </div>
          </div>

          <h1
            className="font-display text-5xl sm:text-7xl text-white tracking-wider mb-3"
            style={{ textShadow: "3px 0 0 rgba(229,9,20,0.7), -3px 0 0 rgba(139,0,0,0.5)" }}
          >
            GH0ST EMPIRE
          </h1>
          <p className="text-zinc-400 text-base sm:text-lg max-w-2xl mx-auto mb-2">
            Oficjalny portal społeczności streamera Gh0s77tt.
          </p>
          <p className="text-zinc-500 text-sm max-w-2xl mx-auto mb-8">
            Zbieraj Ghost Tokens za aktywność, wymieniaj na nagrody, rywalizuj w rankingu, wygrywaj eventy.
          </p>

          {!isAuthed ? (
            <Link
              href="/auth/signin"
              className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-sm tracking-widest uppercase transition-all"
            >
              Zaloguj się <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-sm tracking-widest uppercase transition-all"
            >
              Wróć do portalu <ArrowRight className="w-4 h-4" />
            </Link>
          )}

          {/* Compact social row under hero */}
          <div className="mt-8">
            <SocialLinksRow />
          </div>
        </section>

        {/* Co to jest */}
        <Section title="Co to jest?" id="o-projekcie">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm leading-relaxed">
            <div className="md:col-span-2 text-zinc-300 space-y-3">
              <p>
                <strong className="text-white">Ghost Empire</strong> to portal społeczności łączący Twitch, Kick, YouTube i Discord
                w jedną ekonomię opartą na <strong className="text-red-400">Ghost Tokens (GT)</strong>.
              </p>
              <p>
                Tokeny lecą Ci za każdą aktywność: pisanie na czacie, voice, oglądanie live'ów, wpisywanie drop kodów,
                wykonywanie daily questów. Subowie zarabiają więcej. Streakerzy zarabiają jeszcze więcej.
              </p>
              <p>
                Co zrobisz z tokenami? Wymienisz na <strong className="text-white">prawdziwe nagrody</strong> —
                klucze Steam, skiny CS2, gifted suby na Twitch, custom kolor nicka Discord, voice 1-on-1 z Ghostem,
                bilety na offline meetup.
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
                Welcome bonus
              </div>
              <div className="text-xs text-zinc-500 mt-2">
                Za pierwsze logowanie. Bez warunków.
              </div>
            </div>
          </div>
        </Section>

        {/* Funkcje */}
        <Section title="Funkcje" id="funkcje">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <Link
                  key={f.title}
                  href={f.href}
                  className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-sm p-4 hover:border-red-900/50 transition-all group"
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
        <Section title="Jak zacząć" id="jak-zaczac">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-sm p-4 flex gap-4"
              >
                <div
                  className="font-display text-4xl flex-shrink-0 leading-none"
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
        <Section title="Jak zarabiać Ghost Tokens" id="zarabianie">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EARN_WAYS.map((w) => (
              <div
                key={w.title}
                className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-sm p-3 flex items-start gap-3"
              >
                <span className="text-2xl flex-shrink-0">{w.emoji}</span>
                <div>
                  <h3 className="font-bold text-white text-sm mb-0.5">{w.title}</h3>
                  <p className="text-zinc-500 text-xs leading-relaxed">{w.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mt-4 text-center">
            * Mnożniki kumulują się (sub × happy_hour × streak).
          </p>
        </Section>

        {/* Socials */}
        <Section title="Znajdziesz nas tutaj" id="socials">
          <p className="text-zinc-400 text-sm mb-4 max-w-2xl">
            Wszystkie oficjalne kanały Ghost Empire. Discord to centrum społeczności — eventy, drop codes, wsparcie.
          </p>
          <SocialLinksGrid />
        </Section>

        {/* Changelog */}
        <Section title="Changelog" id="changelog">
          <p className="text-zinc-500 text-xs mb-4">Kliknij wpis, aby rozwinąć szczegóły.</p>
          <ChangelogList entries={CHANGELOG} />
        </Section>

        {/* Legal links */}
        <div className="py-6 text-center text-xs text-zinc-600 font-mono">
          <Link href="/privacy" className="hover:text-red-400 underline-offset-2 hover:underline">
            Polityka prywatności
          </Link>
          {" · "}
          <Link href="/terms" className="hover:text-red-400 underline-offset-2 hover:underline">
            Regulamin
          </Link>
        </div>

        {/* Final CTA */}
        {!isAuthed && (
          <section className="py-12 text-center">
            <div className="text-zinc-500 text-sm mb-4">Gotowy?</div>
            <Link
              href="/auth/signin"
              className="inline-flex items-center gap-2 px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-bold text-base tracking-widest uppercase transition-all"
            >
              Dołącz do imperium <ArrowRight className="w-5 h-5" />
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

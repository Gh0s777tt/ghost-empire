// src/app/about/page.tsx
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Header } from "@/components/Header";
import {
  Ghost, ShoppingBag, Trophy, Calendar, Award, MessageCircle, Mic2,
  Zap, Gift, Sparkles, ArrowRight,
} from "lucide-react";
import { SocialLinksGrid, SocialLinksRow } from "@/components/SocialLinks";

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
    icon: Award, color: "#a855f7",
    title: "OSIĄGNIĘCIA",
    desc: "22 achievementy: common, rare, epic, legendary. Wbij level, streak, milestone tokens.",
    href: "/profile",
  },
  {
    icon: Zap, color: "#FF4500",
    title: "DAILY QUESTY",
    desc: "Codziennie 3 zadania: czat, voice, drop. Bonus reward za wszystkie naraz.",
    href: "/profile",
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
  { emoji: "⚡", title: "Happy Hours x2", desc: "W trakcie aktywnego Happy Hour wszystkie tokeny lecą podwójnie." },
  { emoji: "🏆", title: "Daily questy", desc: "3 zadania dziennie. Skończ wszystkie = bonus pula." },
  { emoji: "👑", title: "Subskrypcja Twitch/Kick", desc: "Subowie dostają mnożnik na earnings + dostęp do ekskluzywnych itemów." },
];

const STEPS = [
  { n: 1, title: "Zaloguj się", desc: "Przez Twitch lub Discord — wybór masz na stronie logowania. Pierwsze logowanie = 500 GT welcome bonus." },
  { n: 2, title: "Połącz drugą platformę", desc: "Wejdź na /profile i dodaj drugą platformę (Twitch + Discord). Subowie na obu = Dual Supporter." },
  { n: 3, title: "Bądź aktywny", desc: "Pisz na Discord, hańguj na voice, wpisuj drop codes podczas live. Tokeny lecą w tle." },
  { n: 4, title: "Wymień na nagrody", desc: "Wejdź na /shop. Coś dla każdego — od 8,000 GT (kolor nicka) po 1,500,000 GT (legendarny skin)." },
];

const CHANGELOG = [
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
                <strong className="text-white">Ghost Empire</strong> to portal społeczności łączący Twitch, Kick i Discord
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
          <div className="space-y-4">
            {CHANGELOG.map((entry) => (
              <div
                key={entry.date}
                className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-sm p-5"
                style={{
                  clipPath:
                    "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))",
                }}
              >
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-red-400 px-2 py-0.5 border border-red-900/50">
                    {entry.date}
                  </span>
                  <h3 className="font-bold text-white text-base">{entry.title}</h3>
                </div>
                <ul className="space-y-1.5">
                  {entry.items.map((item, i) => (
                    <li key={i} className="text-zinc-400 text-xs flex gap-2">
                      <span className="text-red-600 flex-shrink-0">▸</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
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

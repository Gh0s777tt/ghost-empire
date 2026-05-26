// src/app/terms/page.tsx
// Regulamin portalu Ghost Empire
import Link from "next/link";
import { Header } from "@/components/Header";
import { FileText } from "lucide-react";

export const metadata = {
  title: "Regulamin",
  description: "Regulamin korzystania z portalu Ghost Empire.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-black">
      <Header />
      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <FileText className="w-6 h-6 text-red-500" />
              <h1
                className="font-display text-4xl text-white tracking-wider"
                style={{ textShadow: "2px 0 0 rgba(229,9,20,0.6), -2px 0 0 rgba(139,0,0,0.4)" }}
              >
                REGULAMIN
              </h1>
            </div>
            <p className="text-zinc-500 text-sm">
              Ostatnia aktualizacja: 26 maja 2026
            </p>
          </div>

          <Section title="§1. Postanowienia ogólne">
            <Numbered>
              <Item>Niniejszy regulamin określa zasady korzystania z portalu Ghost Empire (dalej: <em>Portal</em>) dostępnego pod adresem ghost-empire-web.vercel.app.</Item>
              <Item>Operatorem Portalu jest <strong>Gh0s77tt</strong> — streamer prowadzący działalność na Twitch, Kick i Discord.</Item>
              <Item>Korzystanie z Portalu wymaga założenia konta przez OAuth (Twitch lub Discord) i akceptacji niniejszego regulaminu oraz <Link href="/privacy" className="text-red-400 hover:underline">polityki prywatności</Link>.</Item>
            </Numbered>
          </Section>

          <Section title="§2. Konto użytkownika">
            <Numbered>
              <Item>Konto tworzone jest automatycznie przy pierwszym logowaniu przez OAuth.</Item>
              <Item>Każdy użytkownik otrzymuje na start <strong>500 Ghost Tokens (GT)</strong> jako bonus powitalny.</Item>
              <Item>Użytkownik może połączyć wiele platform (Twitch + Discord) z jednym kontem.</Item>
              <Item>Dane konta (avatar, nick) są synchronizowane z OAuth providerem przy każdym logowaniu.</Item>
              <Item>Użytkownik zobowiązuje się nie tworzyć wielu kont w celu obejścia limitów ani nadużycia ekonomii.</Item>
            </Numbered>
          </Section>

          <Section title="§3. Ghost Tokens (GT)">
            <Numbered>
              <Item>Ghost Tokens to <strong>wewnętrzna waluta wirtualna</strong> Portalu — NIE mają wartości pieniężnej, nie podlegają wymianie na pieniądze ani odsprzedaży.</Item>
              <Item>GT zarabia się przez aktywność: wiadomości na Discord, czas na voice, drop codes na live, daily questy, eventy.</Item>
              <Item>GT można wydać wyłącznie w sklepie Portalu na nagrody (klucze Steam, skiny CS2, gifted suby, cosmetics).</Item>
              <Item>Operator zastrzega sobie prawo do <strong>zmiany cen, dostępności i listy nagród</strong> bez wcześniejszego ogłoszenia.</Item>
              <Item>GT przepadają przy usunięciu konta i nie podlegają zwrotowi.</Item>
              <Item>Próby <strong>nieuczciwego zdobycia GT</strong> (boty, multikonta, exploity) skutkują utratą tokenów + banem.</Item>
            </Numbered>
          </Section>

          <Section title="§4. Sklep i realizacja nagród">
            <Numbered>
              <Item>Zakupy w sklepie są <strong>finalne</strong> — GT odpisywane są natychmiast.</Item>
              <Item>Nagrody fizyczne i klucze gier dostarczane są ręcznie — kontakt przez ticket na Discord. Termin dostawy: do 7 dni.</Item>
              <Item>Niektóre nagrody mają wymagania: minimum level, sub tier (T1/T2/T3/OG/DUAL), staż subskrypcji w miesiącach.</Item>
              <Item>W przypadku braku możliwości dostarczenia nagrody (out of stock, błąd) — Operator zwraca GT.</Item>
              <Item>Nagrody nie podlegają zwrotowi po dostarczeniu (klucze Steam są nieodwracalne).</Item>
            </Numbered>
          </Section>

          <Section title="§5. Eventy i konkursy">
            <Numbered>
              <Item>Eventy (giveaway, raffle, contest, happy_hour) prowadzone są przez Operatora.</Item>
              <Item>Wygrywający są <strong>losowani algorytmem cryptographically-secure</strong> (node:crypto.randomInt). Algorytm jest sprawiedliwy i otwarty (kod jest na GitHub).</Item>
              <Item>Raffles: 1 bilet = 1 szansa. Każdy bilet jest osobnym losem — kupując więcej zwiększasz szansę proporcjonalnie.</Item>
              <Item>Wygrana w giveaway/raffle nie podlega wymianie na GT ani inne nagrody.</Item>
              <Item>Niektóre eventy mają wymagania (np. "aktywny subskrybent") — sprawdzane są przy losowaniu.</Item>
            </Numbered>
          </Section>

          <Section title="§6. Zachowanie użytkowników">
            <p className="mb-3">Zabronione jest:</p>
            <ul className="space-y-1.5 ml-4">
              <Bullet>Spam na Discord w celu farmienia GT</Bullet>
              <Bullet>Używanie botów, skryptów, autoclickerów do zdobywania tokenów</Bullet>
              <Bullet>Tworzenie multikont, omijanie banów</Bullet>
              <Bullet>Próby exploitów technicznych (SQL injection, XSS, brute-force kodów drop)</Bullet>
              <Bullet>Obraźliwe lub nielegalne treści w bio, username, social linkach</Bullet>
              <Bullet>Wykorzystywanie błędów ekonomii (np. ujemne ceny) zamiast ich zgłaszania</Bullet>
              <Bullet>Sprzedaż / wymiana / pożyczanie konta innym osobom</Bullet>
            </ul>
          </Section>

          <Section title="§7. Sankcje">
            <Numbered>
              <Item>Naruszenie regulaminu skutkuje (wybór należy do Operatora): ostrzeżeniem, utratą GT, czasowym banem (1-30 dni), permanentnym banem.</Item>
              <Item>Permanentny ban = utrata wszystkich GT i nagród niezrealizowanych.</Item>
              <Item>Ban jest decyzją Operatora i nie podlega odwołaniu, chyba że zachodzi oczywiste nieporozumienie.</Item>
              <Item>Banned użytkownik może skontaktować się przez Discord w celu wyjaśnienia.</Item>
            </Numbered>
          </Section>

          <Section title="§8. Ograniczenie odpowiedzialności">
            <Numbered>
              <Item>Portal udostępniany jest <em>"as is"</em> — Operator nie gwarantuje 100% uptime ani braku błędów.</Item>
              <Item>Operator NIE ponosi odpowiedzialności za przerwy w działaniu, utratę GT z powodu błędów technicznych, ataków DDoS, problemów z hosterem.</Item>
              <Item>W przypadku awarii systemu Operator dołoży starań aby przywrócić stan sprzed problemu, ale nie gwarantuje pełnej rekompensaty.</Item>
              <Item>Portal może być całkowicie wyłączony w dowolnym momencie — wówczas Operator informuje o tym z 30-dniowym wyprzedzeniem.</Item>
            </Numbered>
          </Section>

          <Section title="§9. Zmiany regulaminu">
            <Numbered>
              <Item>Operator zastrzega sobie prawo do zmiany regulaminu.</Item>
              <Item>Większe zmiany ogłaszane są na Discord z 7-dniowym wyprzedzeniem.</Item>
              <Item>Korzystanie z Portalu po wprowadzeniu zmian oznacza ich akceptację. Jeśli nie zgadzasz się — usuń konto.</Item>
            </Numbered>
          </Section>

          <Section title="§10. Postanowienia końcowe">
            <Numbered>
              <Item>Regulamin podlega prawu polskiemu.</Item>
              <Item>W sprawach nieuregulowanych stosuje się przepisy Kodeksu Cywilnego oraz RODO.</Item>
              <Item>Spory rozstrzyga sąd właściwy dla miejsca zamieszkania Operatora, chyba że Konsument wybierze inaczej.</Item>
              <Item>Kontakt: serwer Discord{" "}
                <a href="https://discord.gg/deAPJ9Ym2F" target="_blank" rel="noreferrer" className="text-red-400 hover:underline">
                  discord.gg/deAPJ9Ym2F
                </a>
              </Item>
            </Numbered>
          </Section>

          <div className="border-t border-zinc-800 pt-6 text-center text-xs text-zinc-600">
            Zobacz też: <Link href="/privacy" className="text-zinc-400 hover:text-red-400">Polityka prywatności</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-sm p-5"
      style={{
        clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))",
      }}
    >
      <h2 className="font-display text-xl text-white tracking-wider mb-3">{title}</h2>
      <div className="text-zinc-300 text-sm leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

function Numbered({ children }: { children: React.ReactNode }) {
  return <ol className="space-y-1.5 ml-4 list-decimal list-outside marker:text-red-500 marker:font-mono">{children}</ol>;
}

function Item({ children }: { children: React.ReactNode }) {
  return <li className="pl-1">{children}</li>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="text-red-500 flex-shrink-0">▸</span>
      <span>{children}</span>
    </li>
  );
}

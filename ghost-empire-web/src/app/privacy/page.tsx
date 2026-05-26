// src/app/privacy/page.tsx
// Polityka prywatności — wymóg RODO przy zbieraniu danych osobowych przez OAuth
import Link from "next/link";
import { Header } from "@/components/Header";
import { Shield } from "lucide-react";

export const metadata = {
  title: "Polityka prywatności",
  description: "Jak Ghost Empire przetwarza Twoje dane osobowe (RODO).",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black">
      <Header />
      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-6 h-6 text-red-500" />
              <h1
                className="font-display text-4xl text-white tracking-wider"
                style={{ textShadow: "2px 0 0 rgba(229,9,20,0.6), -2px 0 0 rgba(139,0,0,0.4)" }}
              >
                POLITYKA PRYWATNOŚCI
              </h1>
            </div>
            <p className="text-zinc-500 text-sm">
              Ostatnia aktualizacja: 26 maja 2026
            </p>
          </div>

          <Section title="1. Administrator danych">
            <p>
              Administratorem Twoich danych osobowych w portalu Ghost Empire (dalej: <em>Portal</em>)
              jest <strong>Gh0s77tt</strong> — streamer prowadzący działalność na platformach
              Twitch, Kick i Discord. Kontakt w sprawach RODO:
              przez serwer Discord{" "}
              <a href="https://discord.gg/deAPJ9Ym2F" target="_blank" rel="noreferrer" className="text-red-400 hover:underline">
                discord.gg/deAPJ9Ym2F
              </a>
              {" "}— wiadomość prywatna do admina.
            </p>
          </Section>

          <Section title="2. Jakie dane zbieramy">
            <p className="mb-3">Przy logowaniu przez OAuth (Twitch / Discord) Portal otrzymuje:</p>
            <ul className="space-y-1.5 ml-4">
              <Bullet>Twój <strong>adres email</strong> (z konta Twitch lub Discord)</Bullet>
              <Bullet>Twój <strong>nick</strong> (username) oraz wyświetlana nazwa (display name)</Bullet>
              <Bullet>Twój <strong>avatar</strong> (URL obrazka)</Bullet>
              <Bullet>Twój <strong>ID platformy</strong> (Twitch User ID, Discord User ID — unikalne identyfikatory)</Bullet>
              <Bullet>OAuth <strong>access token i refresh token</strong> (do utrzymania sesji i odświeżania danych)</Bullet>
              <Bullet>Status <strong>subskrypcji</strong> kanału (jeśli dostępny przez API)</Bullet>
            </ul>
            <p className="mt-3">Podczas korzystania z Portalu zbieramy też:</p>
            <ul className="space-y-1.5 ml-4 mt-2">
              <Bullet>Liczbę wiadomości na Discord, czas spędzony na voice — przesyłane przez bota Discord</Bullet>
              <Bullet>Historię transakcji Ghost Tokens (zarobione, wydane, donacje)</Bullet>
              <Bullet>Zdobyte osiągnięcia, ukończone questy, kupione przedmioty w sklepie</Bullet>
              <Bullet>IP request'u przy akcjach administracyjnych (audit log, do celów bezpieczeństwa)</Bullet>
            </ul>
          </Section>

          <Section title="3. Po co przetwarzamy dane">
            <ul className="space-y-1.5 ml-4">
              <Bullet><strong>Autoryzacja:</strong> logowanie i utrzymanie sesji (art. 6 ust. 1 lit. b RODO — wykonanie umowy)</Bullet>
              <Bullet><strong>Ekonomia Ghost Tokens:</strong> naliczanie nagród, realizacja zakupów, prowadzenie rankingu</Bullet>
              <Bullet><strong>Identyfikacja subskrybentów:</strong> przyznawanie dodatkowych funkcji subom Twitch/Kick</Bullet>
              <Bullet><strong>Bezpieczeństwo:</strong> audit log akcji admin, rate limiting, wykrywanie nadużyć (art. 6 ust. 1 lit. f — uzasadniony interes)</Bullet>
              <Bullet><strong>Komunikacja:</strong> powiadomienia w portalu (np. "wygrałeś giveaway")</Bullet>
            </ul>
          </Section>

          <Section title="4. Komu przekazujemy dane">
            <ul className="space-y-1.5 ml-4">
              <Bullet><strong>Vercel Inc.</strong> (USA) — hosting Portalu. Standardowe klauzule umowne (SCC)</Bullet>
              <Bullet><strong>Supabase Inc.</strong> (Frankfurt, EU) — baza danych. Hosted w eu-central-1</Bullet>
              <Bullet><strong>Twitch Interactive Inc.</strong> i <strong>Discord Inc.</strong> — providery OAuth, do uwierzytelnienia</Bullet>
              <Bullet>Nie sprzedajemy ani nie udostępniamy danych marketerom</Bullet>
            </ul>
          </Section>

          <Section title="5. Jak długo przechowujemy dane">
            <ul className="space-y-1.5 ml-4">
              <Bullet><strong>Konto użytkownika:</strong> do momentu usunięcia (na Twój wniosek)</Bullet>
              <Bullet><strong>OAuth tokens:</strong> rotowane automatycznie, stare usuwane</Bullet>
              <Bullet><strong>Sesje:</strong> 30 dni od ostatniego logowania</Bullet>
              <Bullet><strong>Audit log akcji admin:</strong> bezterminowo (do celów bezpieczeństwa i forensics)</Bullet>
              <Bullet><strong>Powiadomienia:</strong> usuwane po 90 dniach</Bullet>
            </ul>
          </Section>

          <Section title="6. Twoje prawa (RODO)">
            <ul className="space-y-1.5 ml-4">
              <Bullet><strong>Prawo dostępu</strong> — możesz poprosić o kopię swoich danych</Bullet>
              <Bullet><strong>Prawo do sprostowania</strong> — poprawiamy błędne dane</Bullet>
              <Bullet><strong>Prawo do usunięcia</strong> (prawo do bycia zapomnianym) — kasujemy konto i wszystkie powiązane dane</Bullet>
              <Bullet><strong>Prawo do ograniczenia przetwarzania</strong></Bullet>
              <Bullet><strong>Prawo do przenoszenia danych</strong> — eksport w formacie JSON</Bullet>
              <Bullet><strong>Prawo do wniesienia skargi</strong> do Prezesa UODO (https://uodo.gov.pl)</Bullet>
            </ul>
            <p className="mt-3">
              Aby skorzystać z dowolnego prawa — napisz na Discord do admina serwera{" "}
              <a href="https://discord.gg/deAPJ9Ym2F" target="_blank" rel="noreferrer" className="text-red-400 hover:underline">
                Ghost Empire
              </a>. Odpowiemy w ciągu 30 dni.
            </p>
          </Section>

          <Section title="7. Bezpieczeństwo">
            <p>Stosujemy:</p>
            <ul className="space-y-1.5 ml-4 mt-2">
              <Bullet>HTTPS (TLS 1.3) na całym ruchu</Bullet>
              <Bullet>HSTS preload (force-https na 2 lata)</Bullet>
              <Bullet>Content Security Policy, X-Frame-Options, Permissions-Policy headers</Bullet>
              <Bullet>Rate limiting na publicznych endpointach</Bullet>
              <Bullet>Atomic database transactions dla operacji ekonomii</Bullet>
              <Bullet>Audit log z IP dla wszystkich akcji administracyjnych</Bullet>
              <Bullet>Hasła OAuth NIE są przechowywane — używamy tylko tokenów</Bullet>
            </ul>
          </Section>

          <Section title="8. Cookies">
            <p>Portal używa cookies wyłącznie technicznych (sesja NextAuth) — niezbędnych do funkcjonowania. Nie używamy cookies trackingowych / marketingowych / analytics.</p>
          </Section>

          <Section title="9. Zmiany polityki">
            <p>Zmiany publikujemy na tej stronie. Większe zmiany ogłaszamy na Discord. Korzystanie z Portalu po wprowadzeniu zmian oznacza ich akceptację.</p>
          </Section>

          <div className="border-t border-zinc-800 pt-6 text-center text-xs text-zinc-600">
            Zobacz też: <Link href="/terms" className="text-zinc-400 hover:text-red-400">Regulamin</Link>
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

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="text-red-500 flex-shrink-0">▸</span>
      <span>{children}</span>
    </li>
  );
}

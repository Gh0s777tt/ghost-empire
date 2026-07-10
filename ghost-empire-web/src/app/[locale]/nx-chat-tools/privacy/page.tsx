// Public privacy policy for the NX Chat Tools browser extension. Hosted here so the
// Chrome Web Store / AMO listings have a stable public URL. Standalone legal page —
// no tenant/session/DB dependencies, safe on the apex and every portal. Bilingual
// (English first for store reviewers, Polish below).
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — NX Chat Tools",
  description: "Privacy policy for the NX Chat Tools browser extension. No data collection; runs entirely locally.",
  robots: { index: true, follow: true },
};

const HOSTS: [string, string][] = [
  ["https://7tv.io", "Fetch global and per-channel 7TV emote sets."],
  ["wss://events.7tv.io", "7TV EventAPI WebSocket — live emote updates."],
  ["https://cdn.7tv.app", "7TV emote images."],
  ["https://api.betterttv.net", "BetterTTV (BTTV) emote sets."],
  ["https://cdn.betterttv.net", "BTTV emote images."],
  ["https://api.frankerfacez.com", "FrankerFaceZ (FFZ) emote sets."],
  ["https://cdn.frankerfacez.com", "FFZ emote images."],
  ["https://kick.com/api", "Resolve a Kick channel's public ID from its slug."],
];

const CONTACT = "dzierzawskii98.dam@gmail.com";

export default function NxPrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 text-neutral-200">
      <p className="mb-8 text-sm">
        <Link href="/" className="text-violet-400 hover:underline">← empire-forge.com</Link>
      </p>

      <h1 className="mb-1 text-3xl font-extrabold text-white">Privacy Policy — NX Chat Tools</h1>
      <p className="mb-8 text-sm text-neutral-400">Last updated: 2026-07-10</p>

      <section className="space-y-4 leading-relaxed">
        <h2 className="mt-8 text-xl font-bold text-white">In short</h2>
        <p>
          NX Chat Tools <strong>does not collect, store off-device, or sell any personal data</strong>. The
          extension runs <strong>entirely locally</strong> in your browser. We have no servers that receive any
          of your data. No analytics, no tracking, no ads.
        </p>

        <h2 className="mt-8 text-xl font-bold text-white">What the extension processes (locally)</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Chat content visible on the page</strong> (usernames, messages, badges) — read from the
            Twitch/Kick page DOM to render emotes, show moderation actions, compute stats, and keep the session
            history/log. Processed <strong>in the tab&apos;s memory</strong> and discarded when the tab is closed or
            reloaded. None of it leaves your browser.
          </li>
          <li>
            <strong>Your settings</strong> (enabled modules, timeout presets, keywords, toxicity lexicon,
            watchlist, muted words, ping/ignore lists, ban reasons, moderation notes, etc.) — saved in browser
            storage (<code>chrome.storage</code>), i.e. your own profile. Browser profile sync, if enabled, is a
            standard browser feature (Google/Mozilla), not our server.
          </li>
        </ul>

        <h2 className="mt-8 text-xl font-bold text-white">Network connections</h2>
        <p>
          The extension connects <strong>only</strong> to the public emote-provider APIs/CDNs and to Kick&apos;s
          public API:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/15 text-left text-neutral-400">
                <th className="py-2 pr-4 font-semibold">Host</th>
                <th className="py-2 font-semibold">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {HOSTS.map(([host, purpose]) => (
                <tr key={host} className="border-b border-white/5">
                  <td className="py-2 pr-4 font-mono text-violet-300">{host}</td>
                  <td className="py-2">{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Only what is required to fetch the correct emote set is sent to these services: the{" "}
          <strong>public channel ID or name</strong>. We <strong>never send</strong> usernames, message content,
          your settings, or any other data. The extension makes no network requests beyond the hosts above.
        </p>

        <h2 className="mt-8 text-xl font-bold text-white">Permissions and why</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li><code>storage</code> — save your settings in your browser profile.</li>
          <li><code>alarms</code> — keep the 7TV EventAPI WebSocket alive after the Manifest V3 service worker sleeps.</li>
          <li>Access to <code>*.twitch.tv</code>, <code>*.kick.com</code> — core function: read chat and render on these pages.</li>
          <li>Access to <code>7tv.io</code>, <code>api.betterttv.net</code>, <code>api.frankerfacez.com</code> — fetch public emote sets.</li>
        </ul>
        <p>
          The extension does <strong>not</strong> use <code>tabs</code>, <code>cookies</code>, or{" "}
          <code>webRequest</code> permissions and loads <strong>no remote code</strong> — all code is bundled in
          the package.
        </p>

        <h2 className="mt-8 text-xl font-bold text-white">Telemetry and diagnostics</h2>
        <p>
          The extension includes selector health diagnostics that print messages <strong>only to the local
          browser console</strong> (DevTools). Nothing is sent anywhere.
        </p>

        <h2 className="mt-8 text-xl font-bold text-white">Children</h2>
        <p>
          The extension is not directed at children and does not knowingly collect any data from children
          (because it collects no data from anyone).
        </p>

        <h2 className="mt-8 text-xl font-bold text-white">Contact</h2>
        <p>
          Privacy questions: <a href={`mailto:${CONTACT}`} className="text-violet-400 hover:underline">{CONTACT}</a>.
        </p>

        <hr className="my-10 border-white/10" />

        <h2 className="text-xl font-bold text-white">Polityka prywatności (PL)</h2>
        <p>
          NX Chat Tools <strong>nie zbiera, nie przechowuje poza urządzeniem ani nie sprzedaje żadnych danych
          osobowych</strong>. Rozszerzenie działa <strong>w całości lokalnie</strong> w Twojej przeglądarce. Nie
          mamy serwerów, które odbierałyby Twoje dane. Brak analityki, trackingu i reklam.
        </p>
        <p>
          Treść czatu (nicki, wiadomości, odznaki) jest czytana z DOM strony Twitch/Kick i przetwarzana{" "}
          <strong>w pamięci karty</strong> — znika po zamknięciu/odświeżeniu. Ustawienia są zapisywane w profilu
          przeglądarki (<code>chrome.storage</code>). Jedyne połączenia sieciowe to pobieranie publicznych
          zestawów emotek z hostów wymienionych w tabeli powyżej oraz publiczne API Kicka (ustalenie ID kanału po
          nazwie). Do tych usług <strong>nie wysyłamy</strong> nicków ani treści wiadomości — jedynie publiczne
          ID/nazwę kanału. Brak <code>tabs</code>/<code>cookies</code>/<code>webRequest</code>, brak zdalnego kodu.
          Kontakt: <a href={`mailto:${CONTACT}`} className="text-violet-400 hover:underline">{CONTACT}</a>.
        </p>

        <p className="mt-10 text-sm text-neutral-500">
          Not affiliated with Twitch, Kick, 7TV, BetterTTV or FrankerFaceZ.
        </p>
      </section>
    </main>
  );
}

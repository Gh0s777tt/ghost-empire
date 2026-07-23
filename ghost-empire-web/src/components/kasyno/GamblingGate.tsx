"use client";
// src/components/kasyno/GamblingGate.tsx
// 18+ / responsible-gaming acknowledgment gate in front of the GT casino & wheel.
//
// WHY: the GT games are chance-based (RNG) and — via donations (real money → GT) and the
// shop (GT → items of real-world value) — sit uncomfortably close to Polish gambling-law
// definitions. This gate is a HARM-REDUCTION / consumer-protection measure (it does NOT by
// itself make the casino compliant — see the legal analysis). It requires the player to
// confirm they are 18+ and understand GT has no cash value, before the games render.
//
// Self-contained on purpose: bilingual PL/EN inline copy (locale-aware) so it needs NO edits
// to the 10 next-intl message files. Consent is stored client-side (localStorage) — no DB,
// no schema change, fully reversible. Renders `children` only after acknowledgment.
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";

const ACK_KEY = "ge-gambling-ack-v1";

const COPY = {
  pl: {
    badge: "18+",
    title: "Zanim zagrasz",
    l1: "Gry w tej sekcji są oparte na losowości i przeznaczone wyłącznie dla osób pełnoletnich (18+).",
    l2: "Grasz za żetony 🪙 — wirtualną walutę kasyna bez wartości pieniężnej. Żetonów nie można kupić, wypłacić ani wymienić na nagrody o wartości rynkowej.",
    l3: "Graj rozsądnie i dla zabawy. Jeśli gra przestaje być rozrywką, zrób przerwę.",
    confirm: "Mam ukończone 18 lat i rozumiem powyższe",
    leave: "Wróć",
  },
  en: {
    badge: "18+",
    title: "Before you play",
    l1: "The games in this section are chance-based and intended for adults only (18+).",
    l2: "You play with chips 🪙 — a virtual casino currency with no monetary value. Chips cannot be bought, cashed out, or exchanged for items of real-world value.",
    l3: "Play responsibly and for fun. If it stops being entertainment, take a break.",
    confirm: "I am 18 or older and I understand the above",
    leave: "Go back",
  },
} as const;

export function GamblingGate({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const c = locale === "pl" ? COPY.pl : COPY.en;
  // null = still checking localStorage (avoids SSR/hydration mismatch); true/false after mount.
  const [acked, setAcked] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setAcked(localStorage.getItem(ACK_KEY) === "1");
    } catch {
      setAcked(false); // storage blocked → show the gate (fail safe)
    }
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(ACK_KEY, "1");
    } catch {
      /* ignore — session-only ack */
    }
    setAcked(true);
  };

  if (acked === null) return null; // brief pre-check blank; no flash of casino before consent
  if (acked) return <>{children}</>;

  return (
    <div className="relative z-10 mx-auto max-w-md rounded-2xl border border-amber-500/30 bg-zinc-950/80 p-6 text-center shadow-2xl backdrop-blur">
      <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-400 text-lg font-black text-amber-400">
        {c.badge}
      </div>
      <h1 className="mb-3 text-xl font-bold text-zinc-100">{c.title}</h1>
      <ul className="mb-6 space-y-2 text-left text-sm text-zinc-300">
        <li>• {c.l1}</li>
        <li>• {c.l2}</li>
        <li>• {c.l3}</li>
      </ul>
      <button
        type="button"
        onClick={accept}
        className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-black transition hover:brightness-110 active:translate-y-px"
      >
        {c.confirm}
      </button>
      <Link
        href="/"
        className="mt-3 inline-block text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
      >
        {c.leave}
      </Link>
    </div>
  );
}

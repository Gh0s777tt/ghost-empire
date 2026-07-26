// src/app/wheel/page.tsx
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { WheelPageClient } from "@/components/wheel/WheelPageClient";
import { GamblingGate } from "@/components/kasyno/GamblingGate";
import { notFound } from "next/navigation";
import { CASINO_SURFACES_ENABLED } from "@/lib/compliance";

export const dynamic = "force-dynamic";

// Wheel runs on free "Żetony/Chips" (🪙) — non-branded casino currency, same on every portal.
// The page is retired (see below), so it must not stay indexed or advertised either.
export const metadata = { title: "Niedostępne", robots: { index: false, follow: false } };

export default async function WheelPage() {
  // §7 ust. 12 zakazuje mechaniki i nazewnictwa kasynowego niezależnie od wartości nagrody, więc
  // ta powierzchnia jest wycofana. Dane graczy zostają nietknięte — patrz lib/compliance.ts.
  if (!CASINO_SURFACES_ENABLED) notFound();

  const session = await auth();

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/3 right-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, #8B5CF6 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-[130px] opacity-10"
          style={{ background: "radial-gradient(circle, #10B981 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <GamblingGate>
          <WheelPageClient isAuthenticated={!!session?.user?.id} />
        </GamblingGate>
      </main>
    </div>
  );
}

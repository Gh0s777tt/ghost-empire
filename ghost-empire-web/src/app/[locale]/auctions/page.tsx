// src/app/[locale]/auctions/page.tsx
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/admin";
import { Header } from "@/components/Header";
import { AuctionsClient } from "@/components/auctions/AuctionsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Aukcje",
  description: "Licytuj wyjątkowe nagrody za Ghost Tokens — kto da więcej, ten wygrywa.",
};

export default async function AuctionsPage() {
  const session = await auth();
  // Admins/mods with the events permission see the create + cancel controls. The API
  // re-checks this independently, so the flag is purely for showing the UI.
  const gate = await requirePermission("create_events");

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <AuctionsClient isAuthenticated={!!session?.user?.id} canManage={gate.ok} />
      </main>
    </div>
  );
}

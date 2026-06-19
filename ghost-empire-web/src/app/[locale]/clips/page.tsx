// src/app/[locale]/clips/page.tsx
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { ClipsClient } from "@/components/clips/ClipsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Klip tygodnia",
  description: "Głosuj na najlepszy klip tygodnia ze streamów — zwycięzca trafia na podium.",
};

export default async function ClipsPage() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/4 right-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <ClipsClient isAuthenticated={!!session?.user?.id} />
      </main>
    </div>
  );
}

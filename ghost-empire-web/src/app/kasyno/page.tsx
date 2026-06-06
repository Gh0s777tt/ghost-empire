// src/app/kasyno/page.tsx
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { KasynoClient } from "@/components/kasyno/KasynoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kasyno GT", description: "Sloty i coinflip za Ghost Tokens. Graj rozsądnie." };

export default async function KasynoPage() {
  const session = await auth();
  let balance: number | null = null;
  if (session?.user?.id) {
    const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { tokens: true } });
    balance = u?.tokens ?? 0;
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15" style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-[130px] opacity-10" style={{ background: "radial-gradient(circle, #E50914 0%, transparent 70%)" }} />
      </div>
      <Header />
      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <KasynoClient isAuthenticated={!!session?.user?.id} initialBalance={balance} />
      </main>
    </div>
  );
}

// src/app/shop/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { ShopClient } from "@/components/shop/ShopClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sklep",
  description: "Wymień Ghost Tokens na klucze Steam, skiny CS2, gifted suby i więcej.",
};

export default async function ShopPage() {
  const session = await getServerSession(authOptions);

  const items = await prisma.shopItem.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
  });

  let userContext: { tokens: number; level: number; subTiers: string[]; maxSubMonths: number } | null = null;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        tokens: true,
        level: true,
        connections: {
          where: { isSubscriber: true },
          select: { subTier: true, subMonths: true },
        },
      },
    });
    if (user) {
      userContext = {
        tokens: user.tokens,
        level: user.level,
        subTiers: user.connections.map((c) => c.subTier ?? "").filter(Boolean),
        maxSubMonths: user.connections.reduce((m, c) => Math.max(m, c.subMonths), 0),
      };
    }
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/3 right-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, #E50914 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-[130px] opacity-10"
          style={{ background: "radial-gradient(circle, #8B0000 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <ShopClient
          items={items}
          userContext={userContext}
          isAuthenticated={!!session?.user?.id}
        />
      </main>
    </div>
  );
}

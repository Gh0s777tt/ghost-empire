// src/app/wheel/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Header } from "@/components/Header";
import { WheelPageClient } from "@/components/wheel/WheelPageClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Koło Fortuny",
  description: "Wydaj Ghost Tokens, zakręć kołem i wygraj nagrody GT.",
};

export default async function WheelPage() {
  const session = await getServerSession(authOptions);

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
        <WheelPageClient isAuthenticated={!!session?.user?.id} />
      </main>
    </div>
  );
}

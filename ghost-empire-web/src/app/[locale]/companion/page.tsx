// src/app/[locale]/companion/page.tsx
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { CompanionPageClient } from "@/components/companion/CompanionPageClient";
import { getCurrentTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

// White-label: feeding the companion costs this portal's own currency (tenant.tokenName).
export async function generateMetadata() {
  const { tokenName } = await getCurrentTenant();
  return {
    title: "Widmowy Kompan",
    description: `Karm swojego widmowego kompana za ${tokenName} i patrz, jak ewoluuje.`,
  };
}

export default async function CompanionPage() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <CompanionPageClient isAuthenticated={!!session?.user?.id} />
      </main>
    </div>
  );
}

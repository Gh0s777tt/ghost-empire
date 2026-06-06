// src/app/polls/page.tsx
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { PollsClient } from "@/components/polls/PollsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ankiety",
  description: "Głosuj w ankietach społeczności Ghost Empire — wybór gier, decyzje na stream i więcej.",
};

export default async function PollsPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const polls = await prisma.poll.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 30,
    include: { votes: { select: { optionIndex: true, userId: true } } },
  });

  const data = polls
    .map((p) => ({
      id: p.id,
      question: p.question,
      options: p.options,
      status: p.status,
      accentColor: p.accentColor,
      counts: p.options.map((_, i) => p.votes.filter((v) => v.optionIndex === i).length),
      total: p.votes.length,
      yourVote: userId ? (p.votes.find((v) => v.userId === userId)?.optionIndex ?? null) : null,
    }))
    // Open polls first, then most recent.
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "open" ? -1 : 1));

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, #E50914 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-[130px] opacity-10"
          style={{ background: "radial-gradient(circle, #8B0000 0%, transparent 70%)" }} />
      </div>

      <Header />

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <PollsClient polls={data} isAuthenticated={!!userId} />
      </main>
    </div>
  );
}

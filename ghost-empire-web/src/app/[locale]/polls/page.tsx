// src/app/polls/page.tsx
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId, getCurrentTenant } from "@/lib/tenant";
import { Header } from "@/components/Header";
import { PollsClient } from "@/components/polls/PollsClient";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getCurrentTenant();
  return {
    title: "Ankiety",
    description: `Głosuj w ankietach społeczności ${t.name} — wybór gier, decyzje na stream i więcej.`,
  };
}

export default async function PollsPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const tid = await currentTenantId();
  const polls = await prisma.poll.findMany({
    where: tid ? { tenantId: tid } : {},
    orderBy: [{ createdAt: "desc" }],
    take: 30,
    select: { id: true, question: true, options: true, status: true, accentColor: true },
  });
  const pollIds = polls.map((p) => p.id);

  // Tally per option via groupBy + fetch only THIS viewer's votes — instead of loading
  // every PollVote row for 30 polls and counting in JS (matches the overlay feed). #audit4
  const [tally, myVotes] = await Promise.all([
    pollIds.length
      ? prisma.pollVote.groupBy({ by: ["pollId", "optionIndex"], where: { pollId: { in: pollIds } }, _count: true })
      : Promise.resolve([] as { pollId: string; optionIndex: number; _count: number }[]),
    userId && pollIds.length
      ? prisma.pollVote.findMany({ where: { userId, pollId: { in: pollIds } }, select: { pollId: true, optionIndex: true } })
      : Promise.resolve([] as { pollId: string; optionIndex: number }[]),
  ]);

  const countsByPoll = new Map<string, number[]>(polls.map((p) => [p.id, p.options.map(() => 0)]));
  for (const row of tally) {
    const arr = countsByPoll.get(row.pollId);
    if (arr && row.optionIndex >= 0 && row.optionIndex < arr.length) arr[row.optionIndex] = row._count;
  }
  const myVoteByPoll = new Map<string, number>(myVotes.map((v) => [v.pollId, v.optionIndex]));

  const data = polls
    .map((p) => {
      const counts = countsByPoll.get(p.id) ?? p.options.map(() => 0);
      return {
        id: p.id,
        question: p.question,
        options: p.options,
        status: p.status,
        accentColor: p.accentColor,
        counts,
        total: counts.reduce((s, n) => s + n, 0),
        yourVote: userId ? (myVoteByPoll.get(p.id) ?? null) : null,
      };
    })
    // Open polls first, then most recent.
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "open" ? -1 : 1));

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-[130px] opacity-10"
          style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--brand), black 55%) 0%, transparent 70%)" }} />
      </div>

      <Header />

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <PollsClient polls={data} isAuthenticated={!!userId} />
      </main>
    </div>
  );
}

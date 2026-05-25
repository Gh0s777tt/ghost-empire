// src/app/events/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { EventsClient } from "@/components/events/EventsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Eventy",
  description: "Giveawaye, raffle, happy hours i konkursy w Ghost Empire.",
};

export default async function EventsPage() {
  const session = await getServerSession(authOptions);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const events = await prisma.event.findMany({
    where: {
      active: true,
      OR: [
        // Still open for participation
        {
          drawnAt: null,
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        },
        // Recently drawn — keep visible for 7 days so winners are public
        { drawnAt: { gt: sevenDaysAgo } },
      ],
    },
    orderBy: [{ type: "asc" }, { drawnAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    include: {
      _count: {
        select: { entries: true, raffleTickets: true },
      },
      entries: {
        where: { isWinner: true },
        select: {
          user: {
            select: { id: true, username: true, displayName: true, image: true },
          },
        },
      },
    },
  });

  let userTickets: Record<string, number> = {};
  let userEntries: Set<string> = new Set();
  let userTokens = 0;

  if (session?.user?.id) {
    const userId = session.user.id;
    const [user, entries, ticketGroups] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { tokens: true },
      }),
      prisma.eventEntry.findMany({
        where: { userId, eventId: { in: events.map((e) => e.id) } },
        select: { eventId: true },
      }),
      prisma.raffleTicket.groupBy({
        by: ["eventId"],
        where: { userId, eventId: { in: events.map((e) => e.id) } },
        _count: { id: true },
      }),
    ]);

    userTokens = user?.tokens ?? 0;
    userEntries = new Set(entries.map((e) => e.eventId));
    userTickets = Object.fromEntries(
      ticketGroups.map((g) => [g.eventId, g._count.id]),
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/4 left-1/3 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, #E50914 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full blur-[130px] opacity-10"
          style={{ background: "radial-gradient(circle, #FF4500 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <EventsClient
          events={events.map((e) => ({
            id: e.id,
            type: e.type,
            name: e.name,
            description: e.description,
            multiplier: e.multiplier,
            prize: e.prize,
            prizeImageUrl: e.prizeImageUrl,
            winnersCount: e.winnersCount,
            requirement: e.requirement,
            ticketPrice: e.ticketPrice,
            maxTicketsPerUser: e.maxTicketsPerUser,
            startsAt: e.startsAt?.toISOString() ?? null,
            endsAt: e.endsAt?.toISOString() ?? null,
            drawnAt: e.drawnAt?.toISOString() ?? null,
            entriesCount: e._count.entries,
            ticketsCount: e._count.raffleTickets,
            winners: e.entries.map((entry) => entry.user),
          }))}
          userTickets={userTickets}
          userEntries={Array.from(userEntries)}
          userTokens={userTokens}
          isAuthenticated={!!session?.user?.id}
        />
      </main>
    </div>
  );
}

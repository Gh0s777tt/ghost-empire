// src/app/api/admin/analytics-charts/route.ts
// Growth charts for /admin#analytics (#769): 30-day new-user + GT-flow series and an
// 8-week signup-cohort retention grid. Read-only aggregates, tenant-scoped (users by
// tenantId; transactions through their user), bucketed in SQL and shaped by the pure
// helpers in lib/analytics-series (unit-tested).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { currentTenantId } from "@/lib/tenant";
import { dayKeys, weekKeys, fillSeries, buildCohortGrid } from "@/lib/analytics-series";

export const dynamic = "force-dynamic";

const DAYS = 30;
const WEEKS = 8;

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const tid = await currentTenantId();

  const now = Date.now();
  const sinceDays = new Date(now - DAYS * 24 * 60 * 60 * 1000);
  const sinceWeeks = new Date(now - WEEKS * 7 * 24 * 60 * 60 * 1000);

  const [newUsers, flow, sizes, activity] = await Promise.all([
    prisma.$queryRaw<{ d: string; n: number }[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS d, count(*)::int AS n
      FROM "users"
      WHERE "createdAt" >= ${sinceDays} AND (${tid}::text IS NULL OR "tenantId" = ${tid})
      GROUP BY 1`,
    prisma.$queryRaw<{ d: string; earned: number; spent: number }[]>`
      SELECT to_char(date_trunc('day', t."createdAt"), 'YYYY-MM-DD') AS d,
             COALESCE(SUM(CASE WHEN t."amount" > 0 THEN t."amount" ELSE 0 END), 0)::int AS earned,
             COALESCE(SUM(CASE WHEN t."amount" < 0 THEN -t."amount" ELSE 0 END), 0)::int AS spent
      FROM "transactions" t JOIN "users" u ON u."id" = t."userId"
      WHERE t."createdAt" >= ${sinceDays} AND (${tid}::text IS NULL OR u."tenantId" = ${tid})
      GROUP BY 1`,
    prisma.$queryRaw<{ cohort: string; size: number }[]>`
      SELECT to_char(date_trunc('week', "createdAt"), 'YYYY-MM-DD') AS cohort, count(*)::int AS size
      FROM "users"
      WHERE "createdAt" >= ${sinceWeeks} AND (${tid}::text IS NULL OR "tenantId" = ${tid})
      GROUP BY 1`,
    prisma.$queryRaw<{ cohort: string; week: string; users: number }[]>`
      SELECT to_char(date_trunc('week', u."createdAt"), 'YYYY-MM-DD') AS cohort,
             to_char(date_trunc('week', t."createdAt"), 'YYYY-MM-DD') AS week,
             count(DISTINCT u."id")::int AS users
      FROM "users" u JOIN "transactions" t ON t."userId" = u."id"
      WHERE u."createdAt" >= ${sinceWeeks} AND t."createdAt" >= ${sinceWeeks}
        AND (${tid}::text IS NULL OR u."tenantId" = ${tid})
      GROUP BY 1, 2`,
  ]);

  const dAxis = dayKeys(DAYS, now);
  const usersSparse: Record<string, number> = {};
  for (const r of newUsers) usersSparse[r.d] = r.n;
  const earnedSparse: Record<string, number> = {};
  const spentSparse: Record<string, number> = {};
  for (const r of flow) { earnedSparse[r.d] = r.earned; spentSparse[r.d] = r.spent; }

  return NextResponse.json({
    days: dAxis,
    newUsers: fillSeries(dAxis, usersSparse),
    earned: fillSeries(dAxis, earnedSparse),
    spent: fillSeries(dAxis, spentSparse),
    weeks: weekKeys(WEEKS, now),
    cohorts: buildCohortGrid(sizes, activity, WEEKS, now),
  });
}

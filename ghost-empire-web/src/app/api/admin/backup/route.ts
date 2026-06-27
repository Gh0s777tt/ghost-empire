// src/app/api/admin/backup/route.ts
// Admin-only: download a JSON backup of the configurable content + catalog + user
// balances. Deliberately EXCLUDES secrets/PII (auth accounts, sessions, OAuth tokens,
// emails) and high-volume ephemera (chat feed, alert queue, event logs, rate limits).
import { NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/admin";
import { buildBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";

export async function GET() {
  // SECURITY: buildBackup() reads are global (every user's GT balance + role flags across
  // ALL tenants). Gate to the platform owner, not a per-tenant admin. #audit-H1.
  const auth = await requirePlatformOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const data = await buildBackup();

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ghost-empire-backup-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

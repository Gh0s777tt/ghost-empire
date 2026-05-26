// src/app/api/cron/streamlabs-poll/route.ts
// Vercel Cron handler — polls Streamlabs for new donations periodically.
// Vercel auto-sets Authorization: Bearer ${CRON_SECRET} on cron-triggered requests.
import { NextResponse } from "next/server";
import { pollAndProcessDonations } from "@/lib/streamlabs";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pollAndProcessDonations();
  return NextResponse.json(result);
}

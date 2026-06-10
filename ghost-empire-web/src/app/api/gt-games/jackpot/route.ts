// src/app/api/gt-games/jackpot/route.ts
// Public read of the progressive jackpot pool (seed + Redis surplus) for the casino UI.
import { NextResponse } from "next/server";
import { jackpotPool } from "@/lib/gt-games";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ pool: await jackpotPool() });
}

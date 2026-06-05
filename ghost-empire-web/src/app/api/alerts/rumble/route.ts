// src/app/api/alerts/rumble/route.ts
// Token-gated feed for the Rumble overlay (live status + follower/subscriber counts).
import { NextResponse } from "next/server";
import { isValidOverlayToken } from "@/lib/alerts";
import { getRumbleStatus } from "@/lib/rumble";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!(await isValidOverlayToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getRumbleStatus());
}

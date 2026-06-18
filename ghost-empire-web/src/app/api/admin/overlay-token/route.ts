// src/app/api/admin/overlay-token/route.ts
// Returns the shared OBS overlay token to admins so any section can build a
// ready-to-paste overlay URL. getSettings() lazily generates the token on first
// read, so this always returns one.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getSettings } from "@/lib/alerts";
import { featureGateResponse } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const gated = await featureGateResponse("overlays");
  if (gated) return gated;
  const settings = await getSettings();
  return NextResponse.json({ token: settings.overlayToken });
}

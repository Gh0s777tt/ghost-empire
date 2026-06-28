// src/app/api/admin/govee-test/route.ts
// Admin-only: fire a one-off visible test on THIS portal's Govee light (flash green → white)
// so a streamer can confirm their creds + device work without waiting for a real alert (#725).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { currentTenantId } from "@/lib/tenant";
import { testGoveeLight } from "@/lib/govee";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  const r = await testGoveeLight(tid);
  return NextResponse.json(r);
}

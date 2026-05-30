// src/app/api/bot/welcome/route.ts
// PUBLIC GET — ghost-empire-chat fetches the welcome config periodically.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await prisma.welcomeConfig.findUnique({ where: { id: "default" } });
  return NextResponse.json({
    enabled: config?.enabled ?? false,
    template: config?.template ?? "Witaj {user}! Miło Cię widzieć 👋",
  });
}

// src/app/api/admin/merge-users/route.ts
// Admin-only. Three actions via POST body, plus GET for the duplicate scan.
//
//   GET                                              → returns duplicate groups
//   POST { action: "preview", primary, secondary }   → returns counts of what will move
//   POST { action: "execute", primary, secondary, confirm } → performs the merge (destructive)
//
// `confirm` must equal the secondary user's username — a GitHub-style guard against accidents.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { detectDuplicates, previewMerge, executeMerge } from "@/lib/user-merge";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const groups = await detectDuplicates();
    return NextResponse.json({ groups });
  } catch (e) {
    console.error("[merge-users] detect failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "detect_failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { action?: string; primary?: string; secondary?: string; confirm?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, primary, secondary, confirm } = body;
  if (!primary || !secondary || typeof primary !== "string" || typeof secondary !== "string") {
    return NextResponse.json({ error: "Missing primary/secondary userId" }, { status: 400 });
  }
  if (primary === secondary) {
    return NextResponse.json({ error: "primary === secondary" }, { status: 400 });
  }

  if (action === "preview") {
    try {
      const preview = await previewMerge(primary, secondary);
      return NextResponse.json(preview);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "preview_failed" },
        { status: 500 },
      );
    }
  }

  if (action === "execute") {
    // Confirm-by-typing-username guard
    const secondaryUser = await prisma.user.findUnique({
      where: { id: secondary },
      select: { username: true, isAdmin: true, isModerator: true },
    });
    if (!secondaryUser) {
      return NextResponse.json({ error: "Secondary user not found" }, { status: 404 });
    }
    if (!confirm || confirm.trim() !== (secondaryUser.username ?? "")) {
      return NextResponse.json(
        {
          error: "Confirmation mismatch — wpisz dokładny username drugiego konta żeby potwierdzić",
        },
        { status: 400 },
      );
    }

    // Refuse to delete an admin/mod account silently — too easy to lose roles
    if (secondaryUser.isAdmin || secondaryUser.isModerator) {
      return NextResponse.json(
        {
          error:
            "Konto secondary jest adminem/moderatorem — odbierz role w sekcji Użytkownicy zanim scalisz, bo role NIE przenoszą się na primary",
        },
        { status: 409 },
      );
    }

    try {
      const result = await executeMerge({
        primaryUserId: primary,
        secondaryUserId: secondary,
      });

      await logAdminAction({
        adminId: auth.userId,
        action: "merge_users",
        targetType: "user",
        targetId: primary,
        details: {
          primaryUserId: primary,
          secondaryUserId: secondary,
          secondaryUsername: secondaryUser.username,
          moved: result.summary,
        },
        req,
      });

      return NextResponse.json(result);
    } catch (e) {
      console.error("[merge-users] execute failed:", e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "execute_failed" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: "action: preview | execute" }, { status: 400 });
}

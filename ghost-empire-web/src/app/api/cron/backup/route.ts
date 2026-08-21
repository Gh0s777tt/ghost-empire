// src/app/api/cron/backup/route.ts
// Scheduled off-site backup: builds the JSON backup (lib/backup — config/catalog + user
// balances, NO secrets/PII) and uploads it to the configured S3-compatible bucket
// (Cloudflare R2 / Backblaze B2 / AWS S3). DORMANT until BACKUP_S3_* env is set — returns
// { skipped: true } and does nothing otherwise, so the cron stays green with no storage
// configured — a uśpienie widać w liście kontrolnej panelu (krok `backup`), żeby nie było ciche.
// Nieudana WYSYŁKA to co innego: zwracamy 503, bo monitoring cronów patrzy na kod odpowiedzi. CRON_SECRET-gated (constant-time) like the other Vercel crons.
import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/utils";
import { createLogger } from "@/lib/logger";
import { buildBackup } from "@/lib/backup";
import { uploadBackup, backupBucketConfigured } from "@/lib/backup-storage";

const log = createLogger("cron.backup");

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!backupBucketConfigured()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "BACKUP_S3_* not configured" });
  }
  const json = JSON.stringify(await buildBackup());
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const result = await uploadBackup(`backups/ghost-empire-${stamp}.json`, json);
  if (!result.uploaded) {
    log.error("backup upload failed", result.error, { status: result.status });
    // 503, a NIE 200 z `ok: false`. Monitoring cronów Vercela patrzy na kod odpowiedzi, więc
    // nieudana wysyłka wyglądała dotąd jak udany przebieg — a kopia, o której myślisz, że jest,
    // ale jej nie ma, to najgorszy możliwy rodzaj cichej awarii. Uśpienie (`skipped`) zostaje
    // dwusetką celowo: brak konfiguracji to stan zamierzony, nie porażka zadania.
    return NextResponse.json({ ok: false, ...result, bytes: json.length }, { status: 503 });
  }
  return NextResponse.json({ ok: true, ...result, bytes: json.length });
}

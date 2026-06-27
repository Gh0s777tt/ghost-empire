// src/lib/backup-storage.ts
// Optional off-site upload of a backup to any S3-compatible bucket (Cloudflare R2,
// Backblaze B2, AWS S3). DORMANT until BACKUP_S3_* env is set → no-op otherwise, so the
// app + the cron stay green with no storage configured (same dry-wired pattern as Stripe/
// AI). Requests are SigV4-signed via aws4fetch (tiny, zero-config, works on serverless).
import { AwsClient } from "aws4fetch";

/** True once all four required BACKUP_S3_* env vars are present. */
export function backupBucketConfigured(): boolean {
  return Boolean(
    process.env.BACKUP_S3_ENDPOINT &&
      process.env.BACKUP_S3_BUCKET &&
      process.env.BACKUP_S3_ACCESS_KEY_ID &&
      process.env.BACKUP_S3_SECRET_ACCESS_KEY,
  );
}

export type UploadResult = { uploaded: boolean; key?: string; status?: number; error?: string };

/** PUT the backup JSON to `<endpoint>/<bucket>/<key>`. No-op (not-configured) without env. */
export async function uploadBackup(key: string, json: string): Promise<UploadResult> {
  if (!backupBucketConfigured()) return { uploaded: false, error: "not-configured" };
  const endpoint = process.env.BACKUP_S3_ENDPOINT!.replace(/\/+$/, "");
  const bucket = process.env.BACKUP_S3_BUCKET!;
  const client = new AwsClient({
    accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY!,
    service: "s3",
    region: process.env.BACKUP_S3_REGION || "auto", // R2 uses "auto"
  });
  try {
    const res = await client.fetch(`${endpoint}/${bucket}/${key}`, {
      method: "PUT",
      body: json,
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { uploaded: false, status: res.status, error: body.slice(0, 300) };
    }
    return { uploaded: true, key, status: res.status };
  } catch (e) {
    return { uploaded: false, error: (e as Error).message };
  }
}

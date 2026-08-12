// src/app/api/upload/route.ts
// Auth'owany upload mediów streamera (tło portalu / grafiki+animacje alertów / elementy scen) →
// Supabase Storage, pod prefiksem tenanta. Zwraca publiczny URL do wklejenia w istniejące pola
// URL (bgImageUrl / alert imageUrl / scena) — dzięki temu ZERO zmian schematu.
//
// Bezpieczeństwo: requireAdmin (streamer wgrywa WŁASNE media), rate-limit per user, walidacja i
// prefiks per-portal siedzą w lib/media-upload.ts (magic-bytes allowlist, SVG wykluczony, cap).
//
// ⚠️ LIMIT TRANSPORTU: Vercel Functions mają limit body ~4.5 MB — ta trasa PROXY-uje plik przez
// serwer, więc nadaje się do OBRAZÓW (tła, grafiki alertów; zwykle <4.5MB), ale NIE do dużego
// wideo. Duże/wideo media → osobna ścieżka „signed upload URL" (browser → Supabase bezpośrednio,
// z pominięciem serwera), zaplanowana jako fast-follow (docs/PLAN-UPDATE-2026-08.md §2a). Cap w
// lib to 20 MB (limit STORAGE, istotny dopiero dla signed-URL).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { uploadMedia, mediaUploadConfigured, MAX_MEDIA_BYTES } from "@/lib/media-upload";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";
// Wideo do 20 MB — podnieś limit body ponad domyślne 4 MB Next/Vercela dla tej trasy.
export const maxDuration = 60;

const log = createLogger("upload");

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!mediaUploadConfigured()) {
    return NextResponse.json({ error: "Upload mediów nie jest skonfigurowany na tym wdrożeniu." }, { status: 503 });
  }

  // Upload jest tani dla usera, ale kosztowny dla nas (transfer + storage) — ogranicz tempo.
  const rl = await rateLimit(`upload:${auth.userId}`, 40, 5 * 60_000, { failClosed: true });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Za szybko. Spróbuj za chwilę." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane (oczekiwano multipart/form-data z polem 'file')" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "Brak pliku" }, { status: 400 });
  // Wczesne odcięcie po deklarowanym rozmiarze — zanim wciągniemy bajty do pamięci.
  if (file.size > MAX_MEDIA_BYTES) {
    return NextResponse.json({ error: `Plik za duży (limit ${Math.round(MAX_MEDIA_BYTES / 1024 / 1024)} MB)` }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const tid = await currentTenantId();
  const result = await uploadMedia(bytes, tid ?? "founder");
  if (!result.ok) {
    if (result.status >= 500) log.error("media upload failed", undefined, { status: result.status, error: result.error });
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ url: result.url, kind: result.kind }, { headers: { "Cache-Control": "no-store" } });
}

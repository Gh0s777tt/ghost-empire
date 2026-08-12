// src/lib/media-upload.ts
// Upload mediów streamera (własne tło portalu / grafiki+animacje alertów / elementy scen) do
// Supabase Storage — enabler dla update'u 2026-08 (docs/PLAN-UPDATE-2026-08.md §2a).
//
// DLACZEGO Supabase Storage: portal już stoi na Supabase (Postgres) — zero nowego dostawcy.
// DLACZEGO przez REST (fetch), a nie @supabase/storage-js: to jedno PUT + publiczny URL —
// nie warto ciągnąć zależności do runtime'u (patrz reguła "add a dependency deliberately").
// DRY-WIRED jak Stripe/AI/backup: bez env `mediaUploadConfigured()` === false i endpoint zwraca
// 503, zamiast się wywalać.
//
// BEZPIECZEŃSTWO (to auth'owany upload plików — traktujemy wejście jak wrogie):
//  • ALLOWLIST po ZAWARTOŚCI (magic bytes), nie po deklarowanym Content-Type — deklaracja jest
//    kłamliwa. SVG jest ŚWIADOMIE wykluczony: renderowany w źródle przeglądarkowym OBS mógłby
//    wykonać skrypt (XSS). Tylko rastry + wideo.
//  • ścieżka `<tenantId>/<uuid>.<ext>` — izolacja per-portal (nie da się nadpisać cudzego pliku)
//    + losowa nazwa (nie da się zgadnąć/wyliczyć).
//  • upsert:false — nie nadpisujemy istniejących obiektów.
//  • publiczny URL jest z NASZEGO storage (bucket publiczny), więc konsument (overlay/OBS) nie
//    robi SSRF — to nasza domena, nie dowolny host usera.
import { randomUUID } from "node:crypto";

/** Bajtowe cap na jeden plik. Grafiki są małe; wideo overlaya też powinno być krótkie. */
export const MAX_MEDIA_BYTES = 20 * 1024 * 1024; // 20 MB

/** Dozwolone typy: raster + wideo. Klucz = wykryty MIME; `ext` do nazwy pliku. BEZ SVG (XSS). */
export const ALLOWED_MEDIA: Record<string, { ext: string; kind: "image" | "video" }> = {
  "image/png": { ext: "png", kind: "image" },
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/gif": { ext: "gif", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "image/avif": { ext: "avif", kind: "image" },
  "video/mp4": { ext: "mp4", kind: "video" },
  "video/webm": { ext: "webm", kind: "video" },
};

/** Czy bajty [a..] zaczynają się od wzorca `sig` (od offsetu `off`). */
function at(buf: Uint8Array, off: number, sig: number[]): boolean {
  if (off + sig.length > buf.length) return false;
  for (let i = 0; i < sig.length; i++) if (buf[off + i] !== sig[i]) return false;
  return true;
}

/**
 * Wykryj MIME z MAGIC BYTES zawartości (ignoruje deklarowany Content-Type). Zwraca jeden z kluczy
 * ALLOWED_MEDIA albo null, gdy nie rozpoznano/niedozwolony.
 */
export function sniffMediaMime(buf: Uint8Array): string | null {
  if (at(buf, 0, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (at(buf, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(buf, 0, [0x47, 0x49, 0x46, 0x38])) return "image/gif"; // GIF8
  // RIFF....WEBP
  if (at(buf, 0, [0x52, 0x49, 0x46, 0x46]) && at(buf, 8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  // ....ftyp{avif|mp4}
  if (at(buf, 4, [0x66, 0x74, 0x79, 0x70])) {
    if (at(buf, 8, [0x61, 0x76, 0x69, 0x66])) return "image/avif"; // ftypavif
    return "video/mp4"; // ftypisom / ftypmp42 / ftypM4V …
  }
  if (at(buf, 0, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm"; // EBML (webm/mkv)
  return null;
}

const BUCKET = () => (process.env.MEDIA_BUCKET || "media").replace(/^\/+|\/+$/g, "");
const SUPA_URL = () => (process.env.SUPABASE_URL || "").replace(/\/+$/, "");

/** True gdy skonfigurowano upload (URL projektu + service key). Bez tego endpoint zwraca 503. */
export function mediaUploadConfigured(): boolean {
  return Boolean(SUPA_URL() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export type MediaUploadResult =
  | { ok: true; url: string; path: string; mime: string; kind: "image" | "video" }
  | { ok: false; status: number; error: string };

/**
 * Zwaliduj i wgraj jeden plik do Supabase Storage pod `<tenantId>/<uuid>.<ext>`.
 * @param bytes surowa zawartość pliku.
 * @param tenantKey prefiks izolujący portal (tenantId; dla foundera/legacy → "founder").
 * @returns publiczny URL albo błąd (status do zmapowania na HTTP).
 */
export async function uploadMedia(bytes: Uint8Array, tenantKey: string): Promise<MediaUploadResult> {
  if (!mediaUploadConfigured()) return { ok: false, status: 503, error: "Upload nieskonfigurowany (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / bucket)" };
  if (bytes.length === 0) return { ok: false, status: 400, error: "Pusty plik" };
  if (bytes.length > MAX_MEDIA_BYTES) return { ok: false, status: 413, error: `Plik za duży (limit ${Math.round(MAX_MEDIA_BYTES / 1024 / 1024)} MB)` };

  const mime = sniffMediaMime(bytes);
  if (!mime || !ALLOWED_MEDIA[mime]) {
    return { ok: false, status: 415, error: "Niedozwolony typ pliku (dozwolone: PNG/JPG/GIF/WebP/AVIF/MP4/WebM; SVG wykluczony ze względów bezpieczeństwa)" };
  }
  const { ext, kind } = ALLOWED_MEDIA[mime];
  // Prefiks per-portal + losowa nazwa: izolacja i brak kolizji/zgadywania.
  const safeTenant = tenantKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "founder";
  const path = `${safeTenant}/${randomUUID()}.${ext}`;

  const res = await fetch(`${SUPA_URL()}/storage/v1/object/${BUCKET()}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": mime,
      // Nie nadpisujemy istniejących obiektów; cache długi (nazwa jest niemutowalna).
      "x-upsert": "false",
      "cache-control": "public, max-age=31536000, immutable",
    },
    body: bytes as unknown as BodyInit,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, status: 502, error: `Storage odrzucił upload (${res.status})${text ? ": " + text.slice(0, 200) : ""}` };
  }
  // Bucket jest PUBLICZNY → publiczny URL do wklejenia w tło/alerty/sceny.
  const url = `${SUPA_URL()}/storage/v1/object/public/${BUCKET()}/${path}`;
  return { ok: true, url, path, mime, kind };
}

"use client";
// src/components/admin/MediaUploadButton.tsx
// Reużywalny przycisk uploadu mediów (update 2026-08 §2a): wybiera plik, POST-uje multipart do
// /api/upload i oddaje publiczny URL przez onUploaded. Używany przez tło (Wygląd), a docelowo
// przez alerty i sceny — jeden komponent, żeby walidacja/UX były spójne wszędzie.
//
// Transport: Vercel Functions mają limit body ~4.5 MB, więc to nadaje się do OBRAZÓW; duże wideo
// pójdzie osobną ścieżką signed-URL (patrz /api/upload). Serwer i tak waliduje typ po magic-bytes.
import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export function MediaUploadButton({
  onUploaded,
  onError,
  accept = "image/png,image/jpeg,image/gif,image/webp,image/avif",
  className = "",
}: {
  /** Wywoływane z publicznym URL-em (i wykrytym typem) po udanym uploadzie. `kind` z /api/upload. */
  onUploaded: (url: string, kind?: "image" | "video") => void;
  /** Opcjonalny handler błędu (np. toast sekcji). */
  onError?: (msg: string) => void;
  /** Filtr pickera plików (nie zastępuje walidacji serwera). */
  accept?: string;
  className?: string;
}) {
  const t = useTranslations("admin");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { url?: string; kind?: "image" | "video"; error?: string };
      if (!res.ok || !data.url) {
        onError?.(data.error || t("mediaUploadErr"));
        return;
      }
      onUploaded(data.url, data.kind);
    } catch {
      onError?.(t("mediaUploadErr"));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = ""; // pozwól wgrać ten sam plik ponownie
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handle(f);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={`flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-600 px-2.5 py-1.5 transition-colors disabled:opacity-50 ${className}`}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {busy ? t("mediaUploading") : t("mediaUpload")}
      </button>
    </>
  );
}

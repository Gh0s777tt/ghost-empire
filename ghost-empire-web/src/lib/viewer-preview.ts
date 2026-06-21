// src/lib/viewer-preview.ts
// "View portal as a regular viewer" (#audit3 UX): an admin/owner can hide the admin/mod
// chrome to QA the public experience. It's a pure UI lens persisted in a cookie — it never
// changes permissions (the server still enforces admin everywhere), so it's safe by design.
// Pure helpers (cookie name + parse + serialize) so the contract is unit-tested.

export const VIEWER_PREVIEW_COOKIE = "ge-view-as-viewer";

/** Parse the cookie value into a boolean — only the literal "1" means preview is on. */
export function readViewerPreview(value: string | undefined | null): boolean {
  return value === "1";
}

/** Build the `document.cookie` string that sets (1y) or clears the preview flag. */
export function viewerPreviewCookie(on: boolean): string {
  return on
    ? `${VIEWER_PREVIEW_COOKIE}=1; path=/; max-age=31536000; samesite=lax`
    : `${VIEWER_PREVIEW_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

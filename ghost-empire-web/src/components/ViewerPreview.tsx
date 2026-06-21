"use client";
// src/components/ViewerPreview.tsx
// Client context for "view portal as a regular viewer" (#audit3). Holds a boolean lens
// (initialized from the server-read cookie so there's no hydration flash) and a setter that
// persists it to a cookie. Purely cosmetic — it hides admin/mod chrome (e.g. the header
// badges) so the owner can QA the public experience; it never relaxes any server-side gate.
import { createContext, useCallback, useContext, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, X } from "lucide-react";
import { viewerPreviewCookie } from "@/lib/viewer-preview";

type Ctx = { preview: boolean; setPreview: (on: boolean) => void };
const ViewerPreviewContext = createContext<Ctx>({ preview: false, setPreview: () => {} });

export function useViewerPreview(): Ctx {
  return useContext(ViewerPreviewContext);
}

export function ViewerPreviewProvider({ initial, children }: { initial: boolean; children: React.ReactNode }) {
  const [preview, setPreviewState] = useState(initial);
  const setPreview = useCallback((on: boolean) => {
    // Persist the choice (read back server-side in the layout on the next load) and flip the
    // client lens instantly. No server data depends on it yet, so no router.refresh needed.
    document.cookie = viewerPreviewCookie(on);
    setPreviewState(on);
  }, []);
  return <ViewerPreviewContext.Provider value={{ preview, setPreview }}>{children}</ViewerPreviewContext.Provider>;
}

/** Full-width notice shown while previewing-as-viewer, with a one-click exit. Self-hides. */
export function ViewerPreviewBanner() {
  const { preview, setPreview } = useViewerPreview();
  const t = useTranslations("viewerPreview");
  if (!preview) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-3 bg-amber-500 text-black px-4 py-1.5 text-xs font-bold">
      <span className="inline-flex items-center gap-1.5">
        <Eye className="w-3.5 h-3.5" />
        {t("banner")}
      </span>
      <button
        type="button"
        onClick={() => setPreview(false)}
        className="inline-flex items-center gap-1 px-2 py-1 bg-black/85 text-amber-300 hover:bg-black text-[10px] font-bold uppercase tracking-widest rounded"
      >
        <X className="w-3 h-3" />
        {t("exit")}
      </button>
    </div>
  );
}

// src/components/HowItWorks.tsx
// Collapsible "How does it work?" explainer shown under page headers. Native
// <details>/<summary> — renders on the server and works without JS. The label
// comes from common.howItWorks; pass the page-specific explanation as children.
import { useTranslations } from "next-intl";

export default function HowItWorks({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  return (
    <details className="group mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 open:bg-zinc-950 max-w-2xl">
      <summary className="cursor-pointer select-none list-none px-3 py-2 text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-amber-300 transition-colors flex items-center gap-2 [&::-webkit-details-marker]:hidden">
        <span className="w-4 h-4 rounded-full border border-current text-[10px] inline-flex items-center justify-center shrink-0">?</span>
        {t("howItWorks")}
        <span className="ms-auto text-zinc-600 group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="px-3 pb-3 text-sm leading-relaxed text-zinc-300">{children}</div>
    </details>
  );
}

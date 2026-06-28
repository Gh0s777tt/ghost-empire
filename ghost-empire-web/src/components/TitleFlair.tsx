"use client";
// src/components/TitleFlair.tsx
// Renders a user's equipped cosmetic title (#761) as a small rarity-colored flair badge next to
// their name. Returns null when nothing is equipped / the id is unknown, so it's invisible for
// users without a title. Client component → usable in both /profile (client) and /u (server tree).
import { useTranslations } from "next-intl";
import { titleById, TITLE_RARITY_COLOR } from "@/lib/titles";

export function TitleFlair({ titleId, className = "" }: { titleId: string | null | undefined; className?: string }) {
  const t = useTranslations("titles");
  const def = titleById(titleId);
  if (!def) return null;
  const color = TITLE_RARITY_COLOR[def.rarity];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest border ${className}`}
      style={{ color, borderColor: `${color}66`, background: `${color}1a` }}
      title={t(`rarity_${def.rarity}`)}
    >
      {t(`title_${def.id}`)}
    </span>
  );
}

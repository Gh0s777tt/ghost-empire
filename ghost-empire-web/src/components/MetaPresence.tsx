// src/components/MetaPresence.tsx
// Server component: the portal's Instagram presence — follower count + latest media of the
// streamer's IG business account, shown once they paste an IG Graph token + account id in
// /admin#integrations (#753). Renders NOTHING when not configured (dormant, no error). Mirrors
// XPresence; IG posts carry an image, so this shows a thumbnail grid instead of text rows.
import { getTranslations, getLocale } from "next-intl/server";
import { getInstagramProfile } from "@/lib/meta-social";

export async function MetaPresence({ tenantId }: { tenantId: string | null }) {
  const ig = await getInstagramProfile(tenantId);
  if (!ig.configured || !ig.username) return null;

  const [t, locale] = await Promise.all([getTranslations("igSocial"), getLocale()]);
  const fmt = new Intl.NumberFormat(locale);

  return (
    <section className="border border-zinc-800 bg-black/30 p-4 sm:p-5" aria-label={t("title")}>
      <div className="flex items-center gap-3 mb-3">
        {ig.avatarUrl ? (
          <img src={ig.avatarUrl} alt="" width={40} height={40} className="w-10 h-10 rounded-full border border-zinc-700 object-cover" />
        ) : null}
        <div className="min-w-0">
          <div className="font-display text-lg text-white tracking-wide leading-none">{t("title")}</div>
          <a
            href={`https://instagram.com/${ig.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-400 hover:text-white font-mono"
          >
            @{ig.username}
            {ig.followers > 0 && <span className="text-zinc-600"> · {t("followers", { count: ig.followers, n: fmt.format(ig.followers) })}</span>}
          </a>
        </div>
      </div>

      {ig.posts.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {ig.posts.slice(0, 6).map((p) => (
            <a
              key={p.id}
              href={p.permalink}
              target="_blank"
              rel="noopener noreferrer"
              title={p.caption ?? undefined}
              className="block aspect-square overflow-hidden border border-zinc-900 hover:border-zinc-600 transition-colors bg-zinc-950"
            >
              {p.imageUrl ? (
                <img src={p.imageUrl} alt={p.caption ?? ""} className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">IG</span>
              )}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

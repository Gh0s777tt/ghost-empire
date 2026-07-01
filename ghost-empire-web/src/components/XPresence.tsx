// src/components/XPresence.tsx
// Server component: the portal's X (Twitter) presence — follower count + latest posts of the
// streamer's handle, shown once they paste an X token + @handle in /admin#integrations (#752).
// Renders NOTHING when the portal has no X token configured, so it's invisible (no error) on
// portals that never set it up.
import { getTranslations, getLocale } from "next-intl/server";
import { getXProfile } from "@/lib/x-social";

function shortDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d);
}

export async function XPresence({ tenantId }: { tenantId: string | null }) {
  const x = await getXProfile(tenantId);
  if (!x.configured || !x.username) return null;

  const [t, locale] = await Promise.all([getTranslations("xSocial"), getLocale()]);
  const fmt = new Intl.NumberFormat(locale);

  return (
    <section className="border border-zinc-800 bg-black/30 p-4 sm:p-5" aria-label={t("title")}>
      <div className="flex items-center gap-3 mb-3">
        {x.avatarUrl ? (
          <img src={x.avatarUrl} alt="" width={40} height={40} className="w-10 h-10 rounded-full border border-zinc-700 object-cover" loading="lazy" decoding="async" />
        ) : null}
        <div className="min-w-0">
          <div className="font-display text-lg text-white tracking-wide leading-none">{t("title")}</div>
          <a
            href={`https://x.com/${x.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-400 hover:text-white font-mono"
          >
            @{x.username}
            {x.followers > 0 && <span className="text-zinc-600"> · {t("followers", { count: x.followers, n: fmt.format(x.followers) })}</span>}
          </a>
        </div>
      </div>

      {x.posts.length > 0 && (
        <ul className="space-y-2">
          {x.posts.slice(0, 4).map((p) => {
            const date = shortDate(p.createdAt, locale);
            return (
              <li key={p.id}>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block border border-zinc-900 bg-zinc-950/60 px-3 py-2 hover:border-zinc-700 transition-colors"
                >
                  <p className="text-sm text-zinc-200 line-clamp-3 whitespace-pre-wrap">{p.text}</p>
                  {date && <span className="text-[10px] text-zinc-600 font-mono">{date}</span>}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

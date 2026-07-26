// src/app/[locale]/hub/page.tsx
// Public link-in-bio "Hub" (#hub) — a shareable, mobile-first, brand-themed page of tappable links
// the portal owner curates (Linktree-style). Deliberately CHROME-LESS (no site Header/nav): it's
// meant to be the link in a Twitch/Instagram bio. Gated by the owner's `hubEnabled` toggle → a
// disabled/absent hub is a 404, never a broken empty page. Everything (logo, colour, bg, links) is
// per-tenant, so every portal gets its own hub with zero founder branding.
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentTenant } from "@/lib/tenant";
import { parseHubLinks, hubPlatformTiles, hubLive } from "@/lib/hub";

export async function generateMetadata() {
  const { name, hubBio } = await loadHub();
  return {
    title: `${name} — linki`,
    description: hubBio ?? `Wszystkie linki ${name} w jednym miejscu.`,
    robots: { index: true, follow: true },
  };
}

/** Resolve the current portal's brand + hub config in one place (used by page + metadata). */
async function loadHub() {
  const tenant = await getCurrentTenant();
  const row = tenant.id
    ? await prisma.tenant.findUnique({
        where: { id: tenant.id },
        select: { hubEnabled: true, hubBio: true, hubLinks: true, socialLinks: true },
      })
    : null;

  // Live badge from THIS portal's own sessions. `endedAt: null` means still live; hubLive() also
  // rejects a stale row, because a missed EventSub stream.offline would otherwise claim a week-long
  // stream. `.catch` keeps a public page from 500-ing on a DB hiccup — it just shows no badge.
  const sessions = tenant.id
    ? await prisma.streamSession
        .findMany({
          where: { tenantId: tenant.id, endedAt: null },
          orderBy: { startedAt: "desc" },
          take: 5,
          select: { platform: true, startedAt: true, endedAt: true },
        })
        .catch(() => [])
    : [];

  return {
    name: tenant.name,
    logoUrl: tenant.logoUrl,
    brandColor: tenant.brandColor,
    bgImageUrl: tenant.bgImageUrl,
    ownerHandle: tenant.ownerHandle,
    hubEnabled: row?.hubEnabled ?? false,
    hubBio: row?.hubBio ?? null,
    links: parseHubLinks(row?.hubLinks),
    // Read from the portal's OWN socialLinks column, deliberately NOT through parseTenantSocials:
    // that helper falls back to the founder's channels when a tenant has none, which is right for the
    // footer and would be a white-label leak on a streamer's own link-in-bio page.
    platforms: hubPlatformTiles(row?.socialLinks as { platform: string; url: string }[] | null),
    live: hubLive(sessions, new Date()),
  };
}

export default async function HubPage() {
  const hub = await loadHub();
  if (!hub.hubEnabled) notFound();

  const accent = hub.brandColor || "#E50914";
  const liveLabel = hub.live ? `LIVE · ${hub.live.label}` : null;
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center px-5 py-12 sm:py-16 relative"
      style={{
        background: hub.bgImageUrl
          ? `linear-gradient(rgba(0,0,0,0.82), rgba(0,0,0,0.92)), url(${hub.bgImageUrl}) center/cover fixed`
          : `radial-gradient(120% 80% at 50% 0%, ${accent}1f, #000 60%)`,
      }}
    >
      <main className="w-full max-w-md flex flex-col items-center">
        {/* Brand header */}
        <div
          className="w-24 h-24 rounded-full overflow-hidden mb-4 ring-2"
          style={{ boxShadow: `0 0 48px ${accent}55`, borderColor: accent, ["--tw-ring-color" as string]: `${accent}` }}
        >
          <img src={hub.logoUrl ?? "/brand/skull.png"} alt={hub.name} className="w-full h-full object-cover" />
        </div>
        <h1 className="font-display text-3xl text-white tracking-wider text-center">{hub.name}</h1>
        {hub.ownerHandle && <p className="font-mono text-xs text-zinc-400 mt-1">@{hub.ownerHandle}</p>}
        {/* Live badge. Rendered only from this portal's own open StreamSession rows, and only when
            hubLive() accepts them — a stale row (missed stream.offline webhook) shows nothing, because
            a false "live" costs trust while a missed one costs a click. */}
        {liveLabel && (() => {
          // Only a link when the live platform is actually among the portal's own socials. Otherwise a
          // plain badge: an <a> with no href looks clickable and does nothing, which is a small lie.
          const url = hub.platforms.find((p) => p.platform === hub.live?.platform)?.url;
          const cls =
            "mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-bold" +
            " tracking-widest uppercase text-white";
          const style = { borderColor: accent, background: `${accent}22` };
          const dot = <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: accent }} />;
          return url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className={cls} style={style}>
              {dot}
              {liveLabel}
            </a>
          ) : (
            <span className={cls} style={style}>
              {dot}
              {liveLabel}
            </span>
          );
        })()}
        {hub.hubBio && <p className="text-sm text-zinc-300 text-center mt-3 leading-relaxed max-w-sm">{hub.hubBio}</p>}

        {/* Platform tiles — from the portal's OWN socialLinks only. No entries → no row, never a
            fallback to anyone else's channels. */}
        {hub.platforms.length > 0 && (
          <div className="w-full grid grid-cols-2 gap-2 mt-6 sm:grid-cols-4">
            {hub.platforms.map((p) => (
              <a
                key={p.platform}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-2 rounded-lg border bg-zinc-950/60 text-center text-[11px] font-bold
                           tracking-wider uppercase text-zinc-200 transition-colors hover:text-white"
                style={{ borderColor: `${accent}44` }}
              >
                {p.label}
              </a>
            ))}
          </div>
        )}

        {/* Links */}
        <div className="w-full flex flex-col gap-3 mt-8">
          {hub.links.map((l) => (
            <a
              key={l.id}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 w-full px-5 py-4 rounded-xl border bg-zinc-950/70 backdrop-blur-sm
                         text-white font-semibold transition-all hover:-translate-y-0.5 active:translate-y-0"
              style={{ borderColor: `${accent}66` }}
            >
              <span className="text-xl w-6 text-center shrink-0">{l.icon || "🔗"}</span>
              <span className="flex-1 text-center pe-6">{l.label}</span>
            </a>
          ))}
          {hub.links.length === 0 && (
            <p className="text-center text-sm text-zinc-500 py-6">Brak linków — dodaj je w panelu (Hub).</p>
          )}
        </div>

        {/* Subtle attribution back to the portal */}
        <a href="/" className="mt-12 text-[11px] font-mono uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors">
          {hub.name} ↗
        </a>
      </main>
    </div>
  );
}

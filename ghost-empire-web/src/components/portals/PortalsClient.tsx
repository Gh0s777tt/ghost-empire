"use client";
// src/components/portals/PortalsClient.tsx
// The "switch streamers" hub (#508): the portal you're on + the portals you follow,
// so you can jump between favorite streamers from one place. Follow/unfollow acts on
// the CURRENT portal (the API derives the tenant from the host). Switching to another
// portal is a normal cross-origin link to its subdomain/custom domain — which only
// becomes available once subdomains are deployed (NEXT_PUBLIC_ROOT_DOMAIN); until then
// followed portals show without a switch link and the page explains why.
import { useState, useEffect, useCallback } from "react";
import { Loader2, Star, Check, Plus, ArrowUpRight, Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/EmptyState";
import { signIn } from "next-auth/react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type Portal = {
  slug: string;
  name: string;
  logoUrl: string | null;
  brandColor: string;
  url: string | null;
  isCurrent: boolean;
};
type Data = { portals: Portal[]; currentFollowed: boolean; canFollowCurrent: boolean };

export function PortalsClient({ isAuthenticated }: { isAuthenticated: boolean }) {
  const t = useTranslations("portals");
  const tc = useTranslations("common");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(false);
    try { setData(await apiGet<Data>("/api/portals")); }
    catch { setErr(true); /* guests never reach here — they skip the load */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (isAuthenticated) void load(); else setLoading(false); }, [isAuthenticated, load]);

  async function toggleFollow(follow: boolean) {
    setBusy(true);
    try {
      await apiPost("/api/portals", undefined, { method: follow ? "POST" : "DELETE" });
      await load();
    } catch (e) {
      setToast(e instanceof ApiError ? humanError(e.message) : t("errGeneric"));
      setTimeout(() => setToast(null), 3000);
    }
    setBusy(false);
  }

  function humanError(code: string): string {
    if (code === "hub-not-ready") return t("notReady");
    if (code === "rate-limited") return t("rateLimited");
    return t("errGeneric");
  }

  if (!isAuthenticated) {
    return (
      <div>
        <Heading t={t} />
        <div className="border border-zinc-900 bg-black/20 rounded-xl p-8 text-center">
          <Globe className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
          <p className="text-zinc-400 text-sm mb-4">{t("loginPrompt")}</p>
          <button
            onClick={() => void signIn()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-bold tracking-wide transition-colors"
          >
            {t("login")}
          </button>
        </div>
      </div>
    );
  }

  const current = data?.portals.find((p) => p.isCurrent) ?? null;
  const others = data?.portals.filter((p) => !p.isCurrent) ?? [];

  return (
    <div>
      <Heading t={t} />

      {toast && <div className="mb-4 text-sm px-3 py-2 rounded-lg border border-red-800/60 bg-red-950/30 text-red-300">{toast}</div>}

      {loading ? (
        <div className="text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}</div>
      ) : err ? (
        <ErrorState title={tc("errorTitle")} message={t("errGeneric")} retryLabel={tc("retry")} onRetry={() => { setLoading(true); void load(); }} />
      ) : (
        <div className="space-y-6">
          {/* The portal you're currently on — with the follow toggle. */}
          {current && (
            <section>
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">{t("thisPortal")}</div>
              <PortalCard portal={current}>
                {data?.canFollowCurrent ? (
                  <button
                    onClick={() => void toggleFollow(true)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-200 hover:border-red-600 text-xs font-bold tracking-wide transition-colors disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} {t("follow")}
                  </button>
                ) : data?.currentFollowed ? (
                  <button
                    onClick={() => void toggleFollow(false)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-800/80 text-emerald-100 hover:bg-emerald-800 text-xs font-bold tracking-wide transition-colors disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {t("following")}
                  </button>
                ) : null}
              </PortalCard>
            </section>
          )}

          {/* Portals you follow — jump to any of them. */}
          <section>
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">{t("followed")}</div>
            {others.length === 0 ? (
              <div className="border border-zinc-900 bg-black/20 rounded-xl p-6 text-center">
                <Star className="w-8 h-8 mx-auto mb-2 text-zinc-700" />
                <p className="text-zinc-400 text-sm">{t("emptyFollows")}</p>
                <p className="text-zinc-600 text-xs mt-1">{t("emptyFollowsHint")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {others.map((p) => (
                  <PortalCard key={p.slug} portal={p}>
                    {p.url ? (
                      <a
                        href={p.url}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-200 hover:border-red-600 text-xs font-bold tracking-wide transition-colors"
                      >
                        {t("switch")} <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <span className="text-[11px] text-zinc-600">{t("switchUnavailable")}</span>
                    )}
                  </PortalCard>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Heading({ t }: { t: (k: string) => string }) {
  return (
    <>
      <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
        <Globe className="w-6 h-6 text-red-500" /> {t("title")}
      </h1>
      <p className="text-zinc-500 text-sm mb-6">{t("subtitle")}</p>
    </>
  );
}

function PortalCard({ portal, children }: { portal: Portal; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border border-zinc-800 bg-black/30 rounded-xl p-3">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden border border-zinc-800"
        style={{ background: `${portal.brandColor}22` }}
      >
        {portal.logoUrl ? (
          <img src={portal.logoUrl} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <span className="text-lg" style={{ color: portal.brandColor }}>👻</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white font-semibold truncate">{portal.name}</div>
        <div className="text-[11px] text-zinc-600 truncate font-mono">{portal.slug}</div>
      </div>
      {children}
    </div>
  );
}

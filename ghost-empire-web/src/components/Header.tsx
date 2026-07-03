"use client";
// src/components/Header.tsx
import { useEffect, useRef, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
// Locale-aware usePathname (next-intl): returns the path WITHOUT the locale prefix.
// Links use TransitionLink — a drop-in for next-intl's <Link> that adds a View
// Transition crossfade between pages (locale routing preserved; degrades gracefully).
import { usePathname } from "@/i18n/navigation";
import { TransitionLink as Link } from "@/components/TransitionLink";
import { Ghost, ShoppingBag, Trophy, Calendar, Award, Users, ShieldCheck, LogOut, Zap, Gift, Heart, BarChart3, Disc3, Gamepad2, Dice5, ChevronDown, HelpCircle, Rocket, Film, Volume2, Globe, Brain, Sparkles, Eye, Target, Crown, Star, Gavel, TrendingUp, LayoutDashboard, ListChecks, Ticket, type LucideIcon } from "lucide-react";
import { displayNick } from "@/lib/utils";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { NotificationBell } from "@/components/NotificationBell";
import { DailyBonusButton } from "@/components/DailyBonusButton";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTour } from "@/components/tour/SiteTour";
import { BALANCE_EVENT } from "@/lib/balance-bus";
import { useTenantBranding } from "@/components/TenantBranding";
import { useViewerPreview } from "@/components/ViewerPreview";

// Grouped navigation. Labels are i18n keys (namespace "nav") resolved at render.
type NavKey =
  | "home" | "shop" | "ranking" | "games" | "casino" | "wheel"
  | "library" | "community" | "activities" | "events" | "polls" | "predictions" | "achievements" | "schedule" | "companion" | "clans" | "clips" | "sounds" | "trivia" | "collectibles" | "market" | "bounties" | "auctions" | "leagues" | "wrapped" | "quests" | "seasons";
type NavLeaf = { href: string; tk: NavKey; icon: LucideIcon };
type NavGroup = { tk: NavKey; icon: LucideIcon; children: NavLeaf[] };
type NavEntry = NavLeaf | NavGroup;
const isGroup = (e: NavEntry): e is NavGroup => "children" in e;

const NAV: NavEntry[] = [
  { href: "/",        tk: "home",    icon: Ghost },
  { href: "/shop",    tk: "shop",    icon: ShoppingBag },
  { href: "/ranking", tk: "ranking", icon: Trophy },
  {
    tk: "games", icon: Gamepad2,
    children: [
      { href: "/kasyno", tk: "casino",  icon: Dice5 },
      { href: "/wheel",  tk: "wheel",   icon: Disc3 },
      { href: "/companion", tk: "companion", icon: Ghost },
      { href: "/sounds", tk: "sounds", icon: Volume2 },
      { href: "/games",  tk: "library", icon: Gamepad2 },
    ],
  },
  // #784/A7 — the old single "community" dropdown had grown to 14 items (too many to scan). Split
  // into "community" (identity / collection / status) and "activities" (live / interactive /
  // time-bound), and surface /quests + /seasons that were previously reachable only via the
  // command palette. Grouping is intentionally balanced (8+8); easy to re-tune.
  {
    tk: "community", icon: Users,
    children: [
      { href: "/clans",        tk: "clans",        icon: Users },
      { href: "/clips",        tk: "clips",        icon: Film },
      { href: "/collectibles", tk: "collectibles", icon: Sparkles },
      { href: "/market",       tk: "market",       icon: ShoppingBag },
      { href: "/leagues",      tk: "leagues",      icon: Crown },
      { href: "/wrapped",      tk: "wrapped",      icon: Star },
      { href: "/achievements", tk: "achievements", icon: Award },
      { href: "/seasons",      tk: "seasons",      icon: Ticket },
    ],
  },
  {
    tk: "activities", icon: Calendar,
    children: [
      { href: "/events",       tk: "events",       icon: Calendar },
      { href: "/bounties",     tk: "bounties",     icon: Target },
      { href: "/auctions",     tk: "auctions",     icon: Gavel },
      { href: "/predictions",  tk: "predictions",  icon: TrendingUp },
      { href: "/polls",        tk: "polls",        icon: BarChart3 },
      { href: "/trivia",       tk: "trivia",       icon: Brain },
      { href: "/quests",       tk: "quests",       icon: ListChecks },
      { href: "/schedule",     tk: "schedule",     icon: Zap },
    ],
  },
];

// Flattened leaf list for the mobile scroll strip.
const NAV_LEAVES: NavLeaf[] = NAV.flatMap((e) => (isGroup(e) ? e.children : [e]));

function isLeafActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

type ResolvedLeaf = { href: string; label: string; icon: LucideIcon };

export function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tDeck = useTranslations("deck");
  const { brandName, logoUrl, isPlatformBrand } = useTenantBranding();
  const { preview, setPreview } = useViewerPreview();
  const tTour = useTranslations("tour");
  const fmt = useLocaleFmt();
  const [menuOpen, setMenuOpen] = useState(false);
  const { start: startTour } = useTour();

  // Live GT balance: actions emit the server-returned balance on the balance-bus and the
  // header updates instantly; a fresh session value (60s refetch / focus) clears the
  // override so the newest source always wins.
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const sessionTokens = session?.user?.tokens;
  useEffect(() => {
    const onBalance = (e: Event) => setLiveBalance((e as CustomEvent<number>).detail);
    window.addEventListener(BALANCE_EVENT, onBalance);
    return () => window.removeEventListener(BALANCE_EVENT, onBalance);
  }, []);
  useEffect(() => { setLiveBalance(null); }, [sessionTokens]);
  // Escape closes the account menu (it already closes on backdrop click). #audit-v2 a11y
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header
      className="sticky top-0 z-50 border-b border-red-900/30"
      style={{
        background: "linear-gradient(180deg, rgba(0,0,0,0.97) 0%, rgba(10,10,10,0.90) 100%)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 shrink-0 overflow-hidden rounded-md ring-1 ring-red-600/50 bg-black transition-transform group-hover:scale-105">
              <img src={logoUrl ?? "/brand/skull.png"} alt={brandName} width={36} height={36} decoding="async" className="w-full h-full object-cover" />
            </div>
            <div className="hidden sm:block leading-none">
              <span
                className="font-display text-xl text-white tracking-wider"
                style={{ textShadow: "2px 0 0 rgb(var(--brand-rgb) / 0.6), -2px 0 0 rgba(139,0,0,0.4)" }}
              >
                {brandName}
              </span>
              <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-mono mt-0.5">
                {t("tagline")}
              </p>
            </div>
          </Link>

          {/* Desktop nav — direct links + dropdown groups (hover / keyboard-focus) */}
          <nav className="hidden lg:flex items-center gap-0.5" aria-label={t("mainNav")} data-tour="nav">
            {NAV.map((entry) =>
              isGroup(entry) ? (
                <NavDropdown
                  key={entry.tk}
                  label={t(entry.tk)}
                  icon={entry.icon}
                  items={entry.children.map((c) => ({ href: c.href, label: t(c.tk), icon: c.icon }))}
                  pathname={pathname}
                />
              ) : (
                <NavLink key={entry.href} href={entry.href} label={t(entry.tk)} icon={entry.icon} pathname={pathname} />
              ),
            )}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Go Premium CTA (#744) — gold, prominent, links to the pricing page.
                White-label (#746): a platform storefront brand (founder + the E-Forge public
                brand) shows it to everyone; on a streamer's white-label sub-portal only its
                admin (who can actually upgrade that portal) sees it — viewers/guests don't get
                upsold the SaaS plan on someone else's portal. */}
            {(isPlatformBrand || session?.user?.isAdmin) && (
              <Link
                href="/premium"
                data-tour="premium"
                title={t("premium")}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase text-black transition-all clip-tag ${
                  pathname.startsWith("/premium") ? "ring-1 ring-amber-300" : ""
                }`}
                style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("premium")}</span>
              </Link>
            )}
            {/* Interactive tour — available anytime, also for guests */}
            <button
              onClick={startTour}
              title={tTour("startLabel")}
              aria-label={tTour("startLabel")}
              className="w-8 h-8 inline-flex items-center justify-center border border-zinc-800 text-zinc-500 hover:text-amber-300 hover:border-amber-500 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            <ThemeToggle />
            <LocaleSwitcher />
            {session ? (
              <>
                {/* Token balance */}
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 border border-zinc-800 bg-zinc-950" data-tour="tokens">
                  <span className="text-sm">👻</span>
                  <AnimatedBalance value={liveBalance ?? session.user.tokens} fmt={fmt} />
                </div>

                {/* Drop code shortcut */}
                <Link
                  href="/drops"
                  data-tour="drop"
                  className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 border text-[10px] font-bold tracking-widest uppercase transition-all ${
                    pathname.startsWith("/drops")
                      ? "border-orange-500 bg-orange-600 text-white"
                      : "border-orange-900 text-orange-400 hover:border-orange-500"
                  }`}
                  title={t("drop")}
                >
                  <Gift className="w-3 h-3" />
                  {t("drop")}
                </Link>

                {/* Daily bonus — claim from any page (hidden on the homepage, where the card lives) */}
                <DailyBonusButton />

                {/* Notifications */}
                <span data-tour="bell" className="inline-flex"><NotificationBell /></span>

                {/* Donator badge (visual only, no link) */}
                {session.user.isDonator && (
                  <span
                    className="hidden sm:flex items-center gap-1.5 px-2 py-1.5 border border-yellow-700 bg-yellow-600/15 text-yellow-300 text-[10px] font-bold tracking-widest uppercase"
                    title="Donator"
                  >
                    <Heart className="w-3 h-3" />
                    DONATOR
                  </span>
                )}

                {/* Moderator badge — clickable to /admin (hidden while previewing as a viewer) */}
                {session.user.isModerator && !session.user.isAdmin && !preview && (
                  <Link
                    href="/admin"
                    className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 border text-[10px] font-bold tracking-widest uppercase transition-all ${
                      pathname.startsWith("/admin")
                        ? "border-blue-500 bg-blue-600 text-white"
                        : "border-blue-700 bg-blue-600/15 text-blue-300 hover:border-blue-500"
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    MOD
                  </Link>
                )}

                {/* Admin badge (also links to admin panel) — hidden while previewing as a viewer */}
                {session.user.isAdmin && !preview && (
                  <Link
                    href="/admin"
                    className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 border text-[10px] font-bold tracking-widest uppercase transition-all clip-tag ${
                      pathname.startsWith("/admin")
                        ? "border-red-500 bg-red-600 text-white"
                        : "border-red-900 text-red-400 hover:border-red-500"
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    ADMIN
                  </Link>
                )}

                {/* User avatar + account menu */}
                <div className="relative" data-tour="avatar">
                  <button
                    onClick={() => setMenuOpen((o) => !o)}
                    className="flex items-center gap-2"
                    aria-label={t("account")}
                    aria-haspopup="true"
                    aria-expanded={menuOpen}
                  >
                    {session.user.image ? (
                      <img src={session.user.image} alt="" width={32} height={32} className="w-8 h-8 border border-red-500/50 object-cover" />
                    ) : (
                      <img src="/brand/skull.png" alt="" width={32} height={32} className="w-8 h-8 border border-red-500/50 object-cover bg-black" />
                    )}
                  </button>
                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                      <div className="absolute end-0 top-full mt-1 w-52 border border-zinc-800 bg-zinc-950 shadow-xl z-50">
                        <div className="p-3 border-b border-zinc-800">
                          <p className="text-xs font-bold text-white truncate">
                            {displayNick(session.user.name, session.user.username)}
                          </p>
                          <p className="text-[10px] text-zinc-500 font-mono">LVL {session.user.level}</p>
                        </div>
                        <Link
                          href="/profile"
                          onClick={() => setMenuOpen(false)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                        >
                          <Users className="w-3.5 h-3.5" />
                          {t("myProfile")}
                        </Link>
                        <Link
                          href="/portals"
                          onClick={() => setMenuOpen(false)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors border-t border-zinc-800"
                        >
                          <Globe className="w-3.5 h-3.5" />
                          {t("portals")}
                        </Link>
                        <Link
                          href="/onboarding"
                          onClick={() => setMenuOpen(false)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-red-400/90 hover:text-red-300 hover:bg-zinc-900 transition-colors border-t border-zinc-800"
                        >
                          <Rocket className="w-3.5 h-3.5" />
                          {t("launchPortal")}
                        </Link>
                        {(session.user.isAdmin || session.user.isModerator) && (
                          <Link
                            href="/deck"
                            onClick={() => setMenuOpen(false)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors border-t border-zinc-800"
                          >
                            <LayoutDashboard className="w-3.5 h-3.5" />
                            {tDeck("title")}
                          </Link>
                        )}
                        {(session.user.isAdmin || session.user.isModerator) && (
                          <button
                            onClick={() => { setPreview(!preview); setMenuOpen(false); }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-amber-400/90 hover:text-amber-300 hover:bg-zinc-900 transition-colors border-t border-zinc-800"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {preview ? t("exitViewerPreview") : t("viewAsViewer")}
                          </button>
                        )}
                        <button
                          onClick={() => signOut({ callbackUrl: "/" })}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-400 hover:text-red-400 hover:bg-zinc-900 transition-colors border-t border-zinc-800"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          {t("logout")}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <button
                onClick={() => signIn()}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs tracking-widest uppercase transition-all clip-tag"
              >
                {t("login")}
              </button>
            )}
          </div>
        </div>

        {/* Mobile nav — flat horizontal scroll of every destination (groups expanded) */}
        <nav className="lg:hidden flex overflow-x-auto no-scrollbar items-center gap-1 pb-2 -mt-1" aria-label={t("mainNav")} data-tour="nav">
          {NAV_LEAVES.map(({ href, tk, icon: Icon }) => {
            const active = isLeafActive(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase transition-all border ${
                  active ? "border-red-500 bg-red-600/20 text-red-300" : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Icon className="w-3 h-3" />
                {t(tk)}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

// A single top-level direct link (desktop nav).
function NavLink({ href, label, icon: Icon, pathname }: { href: string; label: string; icon: LucideIcon; pathname: string }) {
  const active = isLeafActive(href, pathname);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative px-3 py-2 flex items-center gap-2 text-[11px] font-semibold tracking-widest uppercase transition-all ${
        active ? "text-white" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {active && <span className="absolute inset-0 bg-red-600/10 border-s-2 border-red-600" />}
      <Icon className="w-3.5 h-3.5 relative z-10" />
      <span className="relative z-10">{label}</span>
    </Link>
  );
}

// A dropdown group (desktop nav). Opens on hover or keyboard focus (focus-within) — pure CSS.
function NavDropdown({ label, icon: Icon, items, pathname }: { label: string; icon: LucideIcon; items: ResolvedLeaf[]; pathname: string }) {
  const anyActive = items.some((c) => isLeafActive(c.href, pathname));
  return (
    <div className="relative group">
      <button
        type="button"
        aria-haspopup="true"
        className={`relative px-3 py-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-widest uppercase transition-all ${
          anyActive ? "text-white" : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        {anyActive && <span className="absolute inset-0 bg-red-600/10 border-s-2 border-red-600" />}
        <Icon className="w-3.5 h-3.5 relative z-10" />
        <span className="relative z-10">{label}</span>
        <ChevronDown className="w-3 h-3 relative z-10 text-zinc-600 transition-transform group-hover:rotate-180" />
      </button>
      <div className="absolute start-0 top-full pt-1 hidden group-hover:block group-focus-within:block z-50">
        <div
          className="min-w-[210px] border border-zinc-800 bg-zinc-950 shadow-xl"
          style={{ clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))" }}
        >
          {items.map((c) => {
            const Ic = c.icon;
            const active = isLeafActive(c.href, pathname);
            return (
              <Link
                key={c.href}
                href={c.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 px-3 py-2.5 text-[11px] font-semibold tracking-widest uppercase transition-colors border-s-2 ${
                  active ? "bg-red-600/15 text-white border-red-600" : "text-zinc-400 hover:text-white hover:bg-zinc-900 border-transparent"
                }`}
              >
                <Ic className="w-3.5 h-3.5 shrink-0" />
                {c.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// GT balance with a count-up roll: when the value changes, the number eases to the new
// value over ~600 ms (writes go straight to the DOM — no per-frame re-renders) with a
// brief golden pulse. A timeout guarantees the final value even if rAF is paused
// (hidden tab) and prefers-reduced-motion skips straight to the result.
function AnimatedBalance({ value, fmt }: { value: number; fmt: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = prev.current;
    const to = value;
    prev.current = value;
    if (from === to) { el.textContent = fmt(to); return; }
    const reduced = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { el.textContent = fmt(to); return; }
    const DUR = 600;
    let raf = 0, start = 0;
    el.classList.remove("ge-bal-pulse");
    void el.offsetWidth; // restart the pulse animation
    el.classList.add("ge-bal-pulse");
    const tick = (now: number) => {
      if (!start) start = now;
      const k = Math.min(1, (now - start) / DUR);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const t = setTimeout(() => { cancelAnimationFrame(raf); el.textContent = fmt(to); }, DUR + 120);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [value, fmt]);

  return (
    <span ref={ref} className="font-mono text-sm font-bold text-white tabular-nums inline-block">
      {fmt(value)}
    </span>
  );
}

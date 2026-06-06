"use client";
// src/components/Header.tsx
import { useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ghost, ShoppingBag, Trophy, Calendar, Award, Users, ShieldCheck, LogOut, Zap, Gift, Heart, BarChart3, Disc3, Gamepad2, Dice5, ChevronDown, type LucideIcon } from "lucide-react";
import { fmt, displayNick } from "@/lib/utils";
import { NotificationBell } from "@/components/NotificationBell";

// Grouped navigation. As the site grew (Koło / Kasyno / Gry / Ankiety …) a flat row ran out
// of horizontal space, so related destinations live in dropdown groups (like the admin nav) —
// new features go into a group instead of adding another top-level tab. PROFIL is reachable
// from the avatar menu, so it's not duplicated here.
type NavLeaf = { href: string; label: string; icon: LucideIcon };
type NavGroup = { label: string; icon: LucideIcon; children: NavLeaf[] };
type NavEntry = NavLeaf | NavGroup;
const isGroup = (e: NavEntry): e is NavGroup => "children" in e;

const NAV: NavEntry[] = [
  { href: "/",        label: "HOME",    icon: Ghost },
  { href: "/shop",    label: "SKLEP",   icon: ShoppingBag },
  { href: "/ranking", label: "RANKING", icon: Trophy },
  {
    label: "GRY", icon: Gamepad2,
    children: [
      { href: "/kasyno", label: "KASYNO",          icon: Dice5 },
      { href: "/wheel",  label: "KOŁO FORTUNY",    icon: Disc3 },
      { href: "/games",  label: "BIBLIOTEKA GIER", icon: Gamepad2 },
    ],
  },
  {
    label: "SPOŁECZNOŚĆ", icon: Users,
    children: [
      { href: "/events",       label: "EVENTY",        icon: Calendar },
      { href: "/polls",        label: "ANKIETY",       icon: BarChart3 },
      { href: "/achievements", label: "OSIĄGNIĘCIA",   icon: Award },
      { href: "/schedule",     label: "PLAN STREAMÓW", icon: Zap },
    ],
  },
];

// Flattened leaf list for the mobile scroll strip.
const NAV_LEAVES: NavLeaf[] = NAV.flatMap((e) => (isGroup(e) ? e.children : [e]));

function isLeafActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

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
              <img src="/brand/skull.png" alt="GH0ST EMPIRE" className="w-full h-full object-cover" />
            </div>
            <div className="hidden sm:block leading-none">
              <span
                className="font-display text-xl text-white tracking-wider"
                style={{
                  textShadow:
                    "2px 0 0 rgba(229,9,20,0.6), -2px 0 0 rgba(139,0,0,0.4)",
                }}
              >
                GH0ST EMPIRE
              </span>
              <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-mono mt-0.5">
                Oficjalny Portal
              </p>
            </div>
          </Link>

          {/* Desktop nav — direct links + dropdown groups (hover / keyboard-focus) */}
          <nav className="hidden lg:flex items-center gap-0.5" aria-label="Główna nawigacja">
            {NAV.map((entry) =>
              isGroup(entry) ? (
                <NavDropdown key={entry.label} group={entry} pathname={pathname} />
              ) : (
                <NavLink key={entry.href} item={entry} pathname={pathname} />
              ),
            )}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {session ? (
              <>
                {/* Token balance */}
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 border border-zinc-800 bg-zinc-950">
                  <span className="text-sm">👻</span>
                  <span className="font-mono text-sm font-bold text-white tabular-nums">
                    {fmt(session.user.tokens)}
                  </span>
                </div>

                {/* Drop code shortcut */}
                <Link
                  href="/drops"
                  className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 border text-[10px] font-bold tracking-widest uppercase transition-all ${
                    pathname.startsWith("/drops")
                      ? "border-orange-500 bg-orange-600 text-white"
                      : "border-orange-900 text-orange-400 hover:border-orange-500"
                  }`}
                  title="Wpisz drop code"
                >
                  <Gift className="w-3 h-3" />
                  DROP
                </Link>

                {/* Notifications */}
                <NotificationBell />

                {/* Donator badge (visual only, no link) */}
                {session.user.isDonator && (
                  <span
                    className="hidden sm:flex items-center gap-1.5 px-2 py-1.5 border border-yellow-700 bg-yellow-600/15 text-yellow-300 text-[10px] font-bold tracking-widest uppercase"
                    title="Donator — wsparłeś projekt"
                  >
                    <Heart className="w-3 h-3" />
                    DONATOR
                  </span>
                )}

                {/* Moderator badge — clickable to /admin (panel shows their permissions only) */}
                {session.user.isModerator && !session.user.isAdmin && (
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

                {/* Admin badge (also links to admin panel) */}
                {session.user.isAdmin && (
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

                {/* User avatar + account menu (click-toggle — works on mobile/touch too) */}
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen((o) => !o)}
                    className="flex items-center gap-2"
                    aria-label="Menu konta"
                    aria-haspopup="true"
                    aria-expanded={menuOpen}
                  >
                    {session.user.image ? (
                      <img
                        src={session.user.image}
                        alt=""
                        className="w-8 h-8 border border-red-500/50 object-cover"
                      />
                    ) : (
                      <img
                        src="/brand/skull.png"
                        alt=""
                        className="w-8 h-8 border border-red-500/50 object-cover bg-black"
                      />
                    )}
                  </button>
                  {menuOpen && (
                    <>
                      {/* Backdrop — click anywhere to close */}
                      <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 w-52 border border-zinc-800 bg-zinc-950 shadow-xl z-50">
                        <div className="p-3 border-b border-zinc-800">
                          <p className="text-xs font-bold text-white truncate">
                            {displayNick(session.user.name, session.user.username)}
                          </p>
                          <p className="text-[10px] text-zinc-500 font-mono">
                            LVL {session.user.level}
                          </p>
                        </div>
                        <Link
                          href="/profile"
                          onClick={() => setMenuOpen(false)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                        >
                          <Users className="w-3.5 h-3.5" />
                          Mój profil
                        </Link>
                        <button
                          onClick={() => signOut({ callbackUrl: "/" })}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-400 hover:text-red-400 hover:bg-zinc-900 transition-colors border-t border-zinc-800"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Wyloguj się
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
                ZALOGUJ
              </button>
            )}
          </div>
        </div>

        {/* Mobile nav — flat horizontal scroll of every destination (groups expanded) */}
        <nav className="lg:hidden flex overflow-x-auto no-scrollbar items-center gap-1 pb-2 -mt-1" aria-label="Główna nawigacja">
          {NAV_LEAVES.map(({ href, label, icon: Icon }) => {
            const active = isLeafActive(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase transition-all border ${
                  active
                    ? "border-red-500 bg-red-600/20 text-red-300"
                    : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

// A single top-level direct link (desktop nav).
function NavLink({ item, pathname }: { item: NavLeaf; pathname: string }) {
  const Icon = item.icon;
  const active = isLeafActive(item.href, pathname);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative px-3 py-2 flex items-center gap-2 text-[11px] font-semibold tracking-widest uppercase transition-all ${
        active ? "text-white" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {active && <span className="absolute inset-0 bg-red-600/10 border-l-2 border-red-600" />}
      <Icon className="w-3.5 h-3.5 relative z-10" />
      <span className="relative z-10">{item.label}</span>
    </Link>
  );
}

// A dropdown group (desktop nav). Opens on hover or keyboard focus (focus-within) — pure CSS,
// no state — so it scales as more destinations are added without crowding the bar.
function NavDropdown({ group, pathname }: { group: NavGroup; pathname: string }) {
  const Icon = group.icon;
  const anyActive = group.children.some((c) => isLeafActive(c.href, pathname));
  return (
    <div className="relative group">
      <button
        type="button"
        aria-haspopup="true"
        className={`relative px-3 py-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-widest uppercase transition-all ${
          anyActive ? "text-white" : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        {anyActive && <span className="absolute inset-0 bg-red-600/10 border-l-2 border-red-600" />}
        <Icon className="w-3.5 h-3.5 relative z-10" />
        <span className="relative z-10">{group.label}</span>
        <ChevronDown className="w-3 h-3 relative z-10 text-zinc-600 transition-transform group-hover:rotate-180" />
      </button>
      {/* pt-1 keeps a continuous hover area between the button and the panel */}
      <div className="absolute left-0 top-full pt-1 hidden group-hover:block group-focus-within:block z-50">
        <div
          className="min-w-[210px] border border-zinc-800 bg-zinc-950 shadow-xl"
          style={{ clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))" }}
        >
          {group.children.map((c) => {
            const Ic = c.icon;
            const active = isLeafActive(c.href, pathname);
            return (
              <Link
                key={c.href}
                href={c.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 px-3 py-2.5 text-[11px] font-semibold tracking-widest uppercase transition-colors border-l-2 ${
                  active
                    ? "bg-red-600/15 text-white border-red-600"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-900 border-transparent"
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

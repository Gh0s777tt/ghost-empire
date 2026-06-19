"use client";
// src/components/TransitionLink.tsx
// Drop-in replacement for next-intl's <Link> that wraps the soft navigation in a
// View Transition (a quick crossfade between pages). It keeps next-intl's
// locale-aware routing — it just routes the click through useRouter().push inside
// document.startViewTransition. Everything degrades gracefully: unsupported browser,
// reduced-motion, modifier/middle clicks, new-tab links or same-path clicks all fall
// straight through to the normal <Link> behavior, so navigation never breaks.
import { type ComponentProps, type MouseEvent } from "react";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { shouldAnimateNavigation, startViewTransitionNavigation, supportsViewTransitions, prefersReducedMotion } from "@/lib/view-transition";

type LinkProps = ComponentProps<typeof Link>;

export function TransitionLink({ href, onClick, ...rest }: LinkProps) {
  const router = useRouter();
  const pathname = usePathname();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e); // preserve any caller handler (e.g. closing a menu)

    // Only animate simple string hrefs (what the nav uses); object hrefs fall
    // through to <Link>'s default navigation. Cheap bail-outs first so we never
    // preventDefault when we won't actually transition.
    if (typeof href !== "string") return;
    if (!supportsViewTransitions() || prefersReducedMotion()) return;
    const targetBlank = (rest as { target?: string }).target === "_blank";
    if (!shouldAnimateNavigation(e, { targetBlank, samePath: href === pathname })) return;

    // We own this navigation: stop <Link>'s default and drive it ourselves so the
    // DOM swap happens inside the view transition.
    e.preventDefault();
    startViewTransitionNavigation(() => router.push(href));
  }

  return <Link href={href} onClick={handleClick} {...rest} />;
}

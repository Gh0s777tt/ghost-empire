// src/lib/compliance.ts
// The one switch that closes the surfaces REGULAMIN_GHOST_TOKENS.md §7 ust. 12 forbids.
//
// THE CLAUSE (binding since 2026-07-26, non-derogable per §28 ust. 2):
//   "W żadnej funkcji Portalu nie stosuje się oprawy graficznej, MECHANIKI ani nazewnictwa
//    odwzorowujących gry na automatach i gry kasynowe, w szczególności: bębnów, koła fortuny,
//    ruletki, kart, żetonów, mnożników stawki, mechanizmu »spin«, liczników bliskości wygranej,
//    animacji stopniowego odsłaniania nagrody, a także określeń »kasyno«, »jackpot«, »zakład«,
//    »stawka«, »wygrana pieniężna«. Zakaz obowiązuje NIEZALEŻNIE OD WARTOŚCI NAGRODY."
//
// WHY A RENAME IS NOT ENOUGH — the load-bearing detail. The ban covers the MECHANIC, not just the
// word: a slot machine called something else is still a reproduction of a slot machine, and the same
// goes for the wheel of fortune, roulette, card games and stake multipliers. And because the ban
// applies regardless of prize value, the portal's earlier defence — "chips are free and worthless,
// so this is not gambling" — does not satisfy this clause at all. It is about form, not value.
//
// WHY A SWITCH RATHER THAN DELETION. The owner's standing instruction is that nothing is deleted.
// Balances, game history, achievements and the code all stay exactly where they are; only the
// surfaces become unreachable. That keeps the change reversible if the legal position changes, and it
// keeps the reason in ONE greppable place instead of scattered across a dozen routes.
//
// WHAT IS DELIBERATELY NOT GATED: duels and heists (PvP / co-op, not a reproduction of a casino
// game) and predictions (governed by §14A, which permits them). Their COPY still has to lose the
// forbidden words — that is a separate slice — but the features themselves stay open.

/**
 * Whether the casino-style surfaces may be reached.
 *
 * @remarks
 * `false` because §7 ust. 12 forbids the mechanic, not merely the name — see the file header. This is
 * a compliance flag, not a feature flag: do not flip it to ship a feature, and do not read it as
 * "casino temporarily off". Flipping it back requires the terms to change first.
 */
export const CASINO_SURFACES_ENABLED = false;

/** Machine-readable reason, returned by the gated APIs so a caller sees WHY rather than a bare 404. */
export const CASINO_DISABLED_REASON = "casino_surfaces_disabled_by_terms_7_12";

/**
 * Guard for a gated API route.
 *
 * @returns `null` when the surface may run, or a ready `Response` to return when it may not.
 *
 * @example
 * ```ts
 * const blocked = casinoGate();
 * if (blocked) return blocked;
 * ```
 */
export function casinoGate(): Response | null {
  if (CASINO_SURFACES_ENABLED) return null;
  return Response.json(
    {
      error: "Ta funkcja została wyłączona i nie jest już dostępna.",
      reason: CASINO_DISABLED_REASON,
    },
    // 410 Gone, not 404: the endpoint existed and is intentionally retired. A client that gets 410
    // knows to stop retrying, and an operator reading logs can tell this from a routing mistake.
    { status: 410 },
  );
}

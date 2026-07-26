// src/lib/donation-rate.ts
// THE PROHIBITION on turning money into GT. This module used to be the shared real-money→GT rate; it
// is now the single place that enforces that no such conversion exists.
//
// WHY (REGULAMIN_GHOST_TOKENS.md — ruled the binding terms by the owner, 2026-07-26):
//   §7 ust. 3  — "GT nie są przyznawane w zamian za świadczenie pieniężne. GT nie są i nie będą
//                naliczane za: wpłatę, darowiznę (donate, tip) […]. Liczba GT przyznanych
//                Użytkownikowi nie zależy od kwoty jakiejkolwiek wpłaty ani od faktu jej dokonania."
//   §8 ust. 1  — the sources of GT are a CLOSED list: drop codes, quests, the daily bonus,
//                watch-streak, Discord activity, weekly goals, the season pass. A payment is not one.
//   §8 ust. 4  — the ban covers indirect forms too: multipliers, starting bonuses, extra tasks,
//                shortened unlocks, higher daily caps.
//   §28 ust. 2 — §7 is NON-DEROGABLE: no event or campaign rules can reinstate it.
// The stated legal reason is that GT with monetary value would fall under the Polish gambling act.
//
// WHAT THIS MEANS IN CODE: `gtFromPln` still exists and all five money-in rails still call it, so a
// donation is still RECORDED, matched to a supporter, announced on the overlay, and counted toward
// goals and the subathon — none of which the terms forbid. It simply always returns 0, so no rail
// can credit GT. Keeping the call sites rather than deleting them is deliberate: the prohibition is
// enforced in ONE auditable place, and a future rail copied from an existing one inherits it free.
//
// ⚠️ DO NOT "restore" the rate. A test pins the result at 0 across the input range and cites the
// clause. If you are here because that test failed, the change you are making is a compliance
// violation, not a bug fix.

/**
 * GT credited for a PLN amount — always 0.
 *
 * @param _pln - The donation's PLN value. Accepted and ignored, so every money-in rail keeps a
 *               single greppable call site for the prohibition.
 * @returns Always `0`.
 *
 * @remarks
 * §7 ust. 3 of the binding terms forbids two things at once: crediting GT *for* a payment, and the
 * credited amount depending on the payment's size or on the payment happening at all. Only a constant
 * zero satisfies both — a merely "small" or "flat" rate would still breach the first half.
 *
 * @example
 * ```ts
 * const tokensGranted = gtFromPln(plnAmount); // 0, by §7 ust. 3, on every rail
 * ```
 */
export function gtFromPln(_pln: number): number {
  return 0;
}

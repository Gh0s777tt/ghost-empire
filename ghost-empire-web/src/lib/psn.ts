// src/lib/psn.ts
// PlayStation Network — owned/played titles via the trophy API. Takes an npsso (per-portal,
// from GameLibraryConfig, falling back to the PSN_NPSSO env — resolved by the caller) which
// psn-api exchanges for a short-lived access token each call.
// ⚠️ The npsso expires (~60 days) — re-grab it from
// https://ca.account.sony.com/api/v1/ssocookie when sync starts failing.
import { exchangeNpssoForCode, exchangeCodeForAccessToken, getUserTitles } from "psn-api";

export type PsnTitle = { id: string; name: string; image: string | null; platform: string; lastPlayed: string | null };

export async function fetchPsnTitles(npsso: string): Promise<PsnTitle[]> {
  if (!npsso) throw new Error("PSN_NPSSO nie ustawiony");

  const accessCode = await exchangeNpssoForCode(npsso);
  const auth = await exchangeCodeForAccessToken(accessCode);

  const res = await getUserTitles(auth, "me", { limit: 800 });
  // Only titles with a STABLE external key (npCommunicationId). The old `|| trophyTitleName`
  // fallback keyed on the display name, so a missing/changed name re-keyed the same game as a
  // new row on the next sync — the old row was then pruned, losing its GameVotes. #audit4
  return (res.trophyTitles ?? [])
    .filter((t) => !!t.npCommunicationId)
    .map((t) => ({
      id: t.npCommunicationId!,
      name: t.trophyTitleName,
      image: t.trophyTitleIconUrl ?? null,
      platform: t.trophyTitlePlatform ?? "PS",
      lastPlayed: t.lastUpdatedDateTime ?? null,
    }));
}

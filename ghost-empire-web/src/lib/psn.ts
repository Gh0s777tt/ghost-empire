// src/lib/psn.ts
// PlayStation Network — owned/played titles via the trophy API. Uses the npsso
// (PSN_NPSSO env) which psn-api exchanges for a short-lived access token each call.
// ⚠️ The npsso expires (~60 days) — re-grab it from
// https://ca.account.sony.com/api/v1/ssocookie when sync starts failing.
import { exchangeNpssoForCode, exchangeCodeForAccessToken, getUserTitles } from "psn-api";

export type PsnTitle = { id: string; name: string; image: string | null; platform: string; lastPlayed: string | null };

export async function fetchPsnTitles(): Promise<PsnTitle[]> {
  const npsso = process.env.PSN_NPSSO;
  if (!npsso) throw new Error("PSN_NPSSO nie ustawiony");

  const accessCode = await exchangeNpssoForCode(npsso);
  const auth = await exchangeCodeForAccessToken(accessCode);

  const res = await getUserTitles(auth, "me", { limit: 800 });
  return (res.trophyTitles ?? []).map((t) => ({
    id: t.npCommunicationId || t.trophyTitleName,
    name: t.trophyTitleName,
    image: t.trophyTitleIconUrl ?? null,
    platform: t.trophyTitlePlatform ?? "PS",
    lastPlayed: t.lastUpdatedDateTime ?? null,
  }));
}

// src/app/api/search/semantic/route.ts
// Semantic search (#554): embed the query + the portal's corpus (pages + achievements +
// shop), rank by cosine similarity, return the best matches. DORMANT until an OpenAI key
// is configured (aiEmbed → null → { dormant: true }).
//
// Embeddings are cached via the shared `cacheJson` (#perf): with Upstash Redis the corpus
// + query vectors are SHARED across serverless instances (so a cold instance re-embeds
// nothing if any instance already did), falling back to per-instance memory without Redis.
// The corpus key carries a content hash, so editing a page/achievement/shop item rolls to
// a fresh key and re-embeds automatically. An in-flight dedup map coalesces concurrent
// identical embeds on one instance, so a cold start under load fires ONE OpenAI batch, not N.
import { NextResponse } from "next/server";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";
import { aiEmbed } from "@/lib/ai";
import { buildCorpus } from "@/lib/search-corpus";
import { rankBySimilarity } from "@/lib/semantic";
import { cacheJson } from "@/lib/redis";

export const dynamic = "force-dynamic";

const CORPUS_TTL_MS = 6 * 60 * 60_000; // 6h — content edits bust earlier via the hash in the key
const QUERY_TTL_MS = 60 * 60_000; // 1h — query embeddings are deterministic per text

// Sentinel thrown so a dormant/failed embed is NOT cached (cacheJson caches whatever the
// producer returns; throwing skips the write and surfaces as "dormant" to the caller).
class DormantError extends Error {}

// In-flight dedup (per instance): collapse concurrent identical embed calls into one, so a
// cold start under load fires one OpenAI batch instead of N. Cross-instance sharing +
// persistence is handled by cacheJson (Redis).
const inFlightCorpus = new Map<string, Promise<number[][] | null>>();
const inFlightQuery = new Map<string, Promise<number[] | null>>();

function dedup<T>(map: Map<string, Promise<T | null>>, key: string, run: () => Promise<T | null>): Promise<T | null> {
  const existing = map.get(key);
  if (existing) return existing;
  const p = (async () => {
    try {
      return await run();
    } catch {
      return null; // dormant / failed — not cached
    } finally {
      map.delete(key);
    }
  })();
  map.set(key, p);
  return p;
}

function hashTexts(texts: string[]): string {
  let h = 5381;
  const s = texts.join("");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await rateLimit(`semsearch:${ip}`, 30, 60_000, { failClosed: false });
  if (!rl.allowed) return NextResponse.json({ results: [], dormant: false }, { status: 429 });

  let body: { q?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ results: [], dormant: false }, { status: 400 }); }
  const q = String(body.q ?? "").trim().slice(0, 200);
  if (q.length < 3) return NextResponse.json({ results: [], dormant: false });

  const tid = await currentTenantId();
  const corpus = await buildCorpus(tid);
  if (corpus.length === 0) return NextResponse.json({ results: [], dormant: false });
  const texts = corpus.map((c) => c.text);
  const ckey = `${tid ?? "_"}|${hashTexts(texts)}`;

  const vecs = await dedup(inFlightCorpus, ckey, () =>
    cacheJson<number[][]>(`semsearch:corpus:${ckey}`, CORPUS_TTL_MS, async () => {
      const e = await aiEmbed(texts);
      if (!e || e.length !== texts.length) throw new DormantError();
      return e;
    }),
  );
  if (!vecs) return NextResponse.json({ results: [], dormant: true });

  const qvec = await dedup(inFlightQuery, q, () =>
    cacheJson<number[]>(`semsearch:query:${tid ?? "_"}:${q}`, QUERY_TTL_MS, async () => {
      const e = await aiEmbed([q]);
      if (!e || !e[0]) throw new DormantError();
      return e[0];
    }),
  );
  if (!qvec) return NextResponse.json({ results: [], dormant: true });

  const items = corpus.map((c, i) => ({ title: c.title, type: c.type, href: c.href, vec: vecs[i] }));
  const results = rankBySimilarity(qvec, items, 8).filter((r) => r.score > 0.15);
  return NextResponse.json({ results, dormant: false });
}

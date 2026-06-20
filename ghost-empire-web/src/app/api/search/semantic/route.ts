// src/app/api/search/semantic/route.ts
// Semantic search (#554): embed the query + the portal's corpus (pages + achievements +
// shop), rank by cosine similarity, return the best matches. DORMANT until an OpenAI key
// is configured (aiEmbed → null → { dormant: true }). Corpus + query embeddings are
// cached in-memory per serverless instance (keyed by a content hash), so a warm instance
// re-embeds nothing; one batch embed on a cold start.
import { NextResponse } from "next/server";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";
import { aiEmbed } from "@/lib/ai";
import { buildCorpus } from "@/lib/search-corpus";
import { rankBySimilarity } from "@/lib/semantic";

export const dynamic = "force-dynamic";

const corpusCache = new Map<string, number[][]>(); // `${tid}|${hash}` → vectors (parallel to corpus order)
const queryCache = new Map<string, number[]>(); // query text → vector

function hashTexts(texts: string[]): string {
  let h = 5381;
  const s = texts.join("");
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

  let vecs = corpusCache.get(ckey);
  if (!vecs) {
    const e = await aiEmbed(texts);
    if (!e || e.length !== texts.length) return NextResponse.json({ results: [], dormant: true });
    if (corpusCache.size > 10) corpusCache.clear();
    vecs = e;
    corpusCache.set(ckey, vecs);
  }

  let qvec = queryCache.get(q);
  if (!qvec) {
    const e = await aiEmbed([q]);
    if (!e || !e[0]) return NextResponse.json({ results: [], dormant: true });
    if (queryCache.size > 500) queryCache.clear();
    qvec = e[0];
    queryCache.set(q, qvec);
  }

  const items = corpus.map((c, i) => ({ title: c.title, type: c.type, href: c.href, vec: vecs![i] }));
  const results = rankBySimilarity(qvec, items, 8).filter((r) => r.score > 0.15);
  return NextResponse.json({ results, dormant: false });
}

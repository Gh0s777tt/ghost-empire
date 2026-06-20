// src/lib/semantic.ts
// Pure vector-similarity helpers for semantic search (#554). The embeddings come from
// the AI provider (lib/ai aiEmbed); this file just does the maths — cosine similarity
// + ranking — so it's testable without any network.

/** Cosine similarity of two vectors in [-1, 1]. 0 for empty / zero vectors. */
export function cosineSim(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Rank items (each carrying a `vec`) by cosine to the query vector; top `limit`. */
export function rankBySimilarity<T extends { vec: number[] }>(queryVec: number[], items: T[], limit = 8): Array<Omit<T, "vec"> & { score: number }> {
  return items
    .map(({ vec, ...rest }) => ({ ...(rest as Omit<T, "vec">), score: cosineSim(queryVec, vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

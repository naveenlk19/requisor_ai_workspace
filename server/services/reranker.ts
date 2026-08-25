// Task #93 — Cross-encoder reranker.
//
// Calls Cohere Rerank (rerank-english-v3.0) to take the top-50 hybrid
// candidates down to top-k. If COHERE_API_KEY is missing or the call
// fails, we fall back to the hybrid score the caller already computed and
// log the degradation so admin telemetry can spot it.
//
// In-memory LRU keyed on sha256(query + sortedCandidateIds) caps re-paying
// the API when the user retries the same prompt within the cache window.

import crypto from "node:crypto";

const COHERE_URL = "https://api.cohere.com/v2/rerank";
const COHERE_MODEL = process.env.COHERE_RERANK_MODEL || "rerank-english-v3.0";
const CACHE_MAX = 500;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  order: number[];
  scores: number[];
  ts: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(query: string, ids: Array<number | string>): string {
  const h = crypto.createHash("sha256");
  h.update(query.trim().toLowerCase());
  h.update("|");
  h.update([...ids].sort().join(","));
  return h.digest("hex");
}

function pruneCache() {
  if (cache.size <= CACHE_MAX) return;
  const drop = cache.size - CACHE_MAX;
  const keys = Array.from(cache.keys()).slice(0, drop);
  for (const k of keys) cache.delete(k);
}

export interface RerankItem {
  id: number | string;
  text: string;
}

export interface RerankResult {
  /** Original candidate indexes ordered best→worst. Length ≤ topK. */
  order: number[];
  /** Per-position rerank score (cohere relevance ∈ [0,1]) aligned with order. */
  scores: number[];
  /** True when reranker errored / key missing and caller should fall back. */
  fallbackUsed: boolean;
  /** When fallbackUsed, the failure reason for logging. */
  reason?: string;
  cached: boolean;
}

export async function rerank(
  query: string,
  items: RerankItem[],
  topK = 8,
): Promise<RerankResult> {
  if (items.length === 0) {
    return { order: [], scores: [], fallbackUsed: false, cached: false };
  }

  const key = cacheKey(query, items.map((i) => i.id));
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    cache.delete(key);
    cache.set(key, hit);
    return {
      order: hit.order.slice(0, topK),
      scores: hit.scores.slice(0, topK),
      fallbackUsed: false,
      cached: true,
    };
  }

  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    return {
      order: items.slice(0, topK).map((_, i) => i),
      scores: [],
      fallbackUsed: true,
      reason: "missing-cohere-key",
      cached: false,
    };
  }

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 4000);
    const res = await fetch(COHERE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: COHERE_MODEL,
        query,
        documents: items.map((it) => it.text.slice(0, 2000)),
        top_n: Math.min(topK, items.length),
      }),
      signal: ac.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        order: items.slice(0, topK).map((_, i) => i),
        scores: [],
        fallbackUsed: true,
        reason: `cohere-${res.status}: ${body.slice(0, 140)}`,
        cached: false,
      };
    }
    const data: any = await res.json();
    const results: Array<{ index: number; relevance_score: number }> =
      data?.results || [];
    const order = results.map((r) => r.index);
    const scores = results.map((r) => r.relevance_score);
    cache.set(key, { order, scores, ts: Date.now() });
    pruneCache();
    return { order, scores, fallbackUsed: false, cached: false };
  } catch (err: any) {
    return {
      order: items.slice(0, topK).map((_, i) => i),
      scores: [],
      fallbackUsed: true,
      reason: `cohere-exception: ${err?.message || err}`,
      cached: false,
    };
  }
}

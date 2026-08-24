const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has",
  "have", "in", "is", "it", "its", "of", "on", "or", "that", "the", "this",
  "to", "was", "were", "will", "with", "i", "we", "you", "they", "he", "she",
  "my", "our", "your", "their", "me", "us", "them", "do", "does", "did", "not",
  "no", "yes", "so", "if", "then", "than", "also", "when", "where", "what",
  "why", "how", "which", "who", "whom", "can", "could", "should", "would",
  "may", "might", "just", "about", "into", "over", "such", "some", "any",
  "all", "more", "most", "other", "only",
]);

export interface MatchableEvidence {
  id: number;
  title: string;
  content: string;
  tags?: string[] | null;
}

export function tokenizeForMatching(input: string): string[] {
  return (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Mirrors the title-similarity heuristic used in the prioritize route:
 * exact match, substring containment for short-vs-long, and >=50% token Jaccard.
 */
export function isFuzzyTitleMatch(a: string, b: string): boolean {
  const aLower = (a || "").toLowerCase().trim();
  const bLower = (b || "").toLowerCase().trim();
  if (!aLower || !bLower) return false;
  if (aLower === bLower) return true;
  const shorter = aLower.length < bLower.length ? aLower : bLower;
  const longer = aLower.length < bLower.length ? bLower : aLower;
  if (shorter.length > 5 && longer.includes(shorter)) return true;
  const w1 = new Set(aLower.split(/\s+/));
  const w2 = new Set(bLower.split(/\s+/));
  const inter = [...w1].filter((w) => w2.has(w));
  const uni = new Set([...w1, ...w2]);
  return uni.size > 0 && inter.length / uni.size >= 0.5;
}

export function scoreEvidenceMatch(
  query: string,
  ev: MatchableEvidence,
): number {
  const queryTokens = tokenizeForMatching(query);
  if (queryTokens.length === 0) return 0;
  const queryTokenSet = new Set(queryTokens);

  const titleLower = (ev.title || "").toLowerCase();
  const contentLower = (ev.content || "").toLowerCase();
  const titleTokenSet = new Set(tokenizeForMatching(ev.title || ""));
  const tags = (ev.tags || []).map((t) => t.toLowerCase());

  let score = 0;

  for (const t of queryTokenSet) {
    if (titleTokenSet.has(t)) score += 5;
  }

  for (const t of queryTokenSet) {
    if (titleTokenSet.has(t)) continue;
    if (contentLower.includes(t)) score += 1;
  }

  for (const t of queryTokenSet) {
    if (tags.some((tag) => tag.includes(t))) score += 2;
  }

  if (isFuzzyTitleMatch(query, ev.title || "")) {
    score += 5;
  }

  return score;
}

export function findMatchingEvidence<T extends MatchableEvidence>(
  query: string,
  evidence: T[],
  limit = 5,
): T[] {
  const trimmed = (query || "").trim();
  if (trimmed.length < 3) return [];
  const scored = evidence
    .map((ev) => ({ ev, score: scoreEvidenceMatch(trimmed, ev) }))
    .filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.ev);
}

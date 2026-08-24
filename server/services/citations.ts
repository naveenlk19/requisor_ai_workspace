// Task #94 — Inline citations.
//
// Given the retrieved chunks for an AI response (Task #93 hybrid retrieval),
// this module:
//   1. Builds the system-prompt addition that teaches the model to emit
//      `[chunk_id:N]` citations where N is the 1-based index into the
//      numbered chunk list.
//   2. Parses the model's text after generation, validates each N is in
//      range, and produces a `citations[]` array with STABLE ids derived
//      from `{sourceType, sourceId, chunkIndex}` (not the per-response N).
//   3. Strips invalid `[chunk_id:N]` markers silently.
//
// The faithfulness verifier lives in `citation-faithfulness.ts`.

import type { RetrievedChunk } from "./retrieval";

export interface Citation {
  /** 1-based marker number used in the rendered text (`[chunk_id:N]`). */
  n: number;
  /** Stable, reload-safe id. Embedding-backed citations use
   *  `${sourceType}:${sourceId}:${chunkIndex}`. Task #99 — belief
   *  citations use the shorter `belief:<id>` form (chunkIndex is always 0
   *  for beliefs and carries no information). */
  citationId: string;
  sourceType: string;
  sourceId: number;
  chunkIndex: number;
  /** Underlying retrieved-row id from `embeddings.id` (for debugging). */
  chunkRowId: number;
  title: string | null;
  /** ~280-char preview for the chip popover. */
  preview: string;
  speaker: string | null;
  startMs: number | null;
  endMs: number | null;
  page: number | null;
  /** Task #98 — `"entity-neighbor"` when this chunk was added by 1-hop
   *  graph expansion rather than direct retrieval. Task #99 — `"belief"`
   *  when this citation represents a consolidated durable belief that
   *  fans out to N underlying source chunks. UI shows a "related" pill
   *  on the chip when set to entity-neighbor, and a "claim · N sources"
   *  pill when set to belief. */
  via: string | null;
  /** Task #98 — entity that linked this neighbor chunk back to the seed. */
  sharedEntity: { id: number; kind: string; name: string } | null;
  /** Task #99 — populated when via === 'belief'. The chip popover shows
   *  the canonical claim + mentionCount + holder + last seen, and a
   *  "View N sources" affordance that expands to the underlying chunks. */
  belief: {
    id: number;
    holder: string | null;
    mentionCount: number;
    lastSeenAt: string | null;
    weight: number;
    status: string;
    sourceEmbeddingIds: number[];
  } | null;
}

export interface ParsedCitations {
  /** Final text — invalid markers stripped, valid markers preserved verbatim. */
  text: string;
  /** Only the citations that the model actually emitted (deduped by N). */
  citations: Citation[];
  /** Count of valid markers shipped to the client (includes duplicates). */
  emittedCount: number;
  /** Count of out-of-range / malformed markers silently dropped. */
  invalidCount: number;
  /**
   * Per-sentence breakdown used by the faithfulness verifier:
   * `{sentence, citationNumbers: number[]}`. Sentence boundaries are
   * approximate (period / question mark / newline) but good enough for
   * NLI gating.
   */
  sentences: Array<{ sentence: string; citationNumbers: number[] }>;
}

const CITATION_RE = /\[chunk_id\s*:\s*(\d+)\]/gi;

/**
 * Prompt fragment we append to the system instructions. We do NOT redo
 * `formatRetrievedContext` here — it already prints `[Source N: …]\n<text>`
 * — we just tell the model how to reference those numbers back.
 */
export function buildCitationInstructions(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  const lines = chunks
    .map((c, i) => {
      const m = c.metadata || {};
      const label =
        m.title ||
        m.subject ||
        m.fileName ||
        m.conversationTitle ||
        m.featureTitle ||
        `${c.sourceType}#${c.sourceId}`;
      const speaker = m.speaker ? ` — ${m.speaker}` : "";
      return `  ${i + 1}. ${c.sourceType}${speaker} — ${label}`;
    })
    .join("\n");

  return `\n\n[CITATION INSTRUCTIONS]
You are answering using the numbered "[Retrieved Context]" sources above.
When a sentence is supported by one of those sources, append a citation
marker in the EXACT form \`[chunk_id:N]\` (no spaces, no other format)
immediately after the supporting clause, where N is the source number.

Rules:
- Only cite sources you actually used. Never invent a citation number.
- Valid N values are 1..${chunks.length}. Any other number will be stripped.
- Multiple citations on the same sentence are fine: \`...[chunk_id:1][chunk_id:3]\`.
- If a sentence is your own synthesis with no specific source backing,
  do NOT cite — leave it bare. Unfounded citations damage trust.
- Do not enclose citations in parentheses or footnote syntax — just the bare
  marker exactly as \`[chunk_id:N]\`.

Available sources:
${lines}
`;
}

/**
 * Parse the model's final text. Validates markers, builds the stable
 * `citations[]` list, strips invalid markers silently, and returns
 * per-sentence citation groups for the verifier.
 */
export function parseAndValidateCitations(
  rawText: string,
  chunks: RetrievedChunk[],
): ParsedCitations {
  if (!rawText) {
    return {
      text: rawText || "",
      citations: [],
      emittedCount: 0,
      invalidCount: 0,
      sentences: [],
    };
  }

  const maxN = chunks.length;
  const seen = new Map<number, Citation>();
  let emittedCount = 0;
  let invalidCount = 0;

  const cleaned = rawText.replace(CITATION_RE, (_full, numStr: string) => {
    const n = Number(numStr);
    if (!Number.isFinite(n) || n < 1 || n > maxN) {
      invalidCount += 1;
      return "";
    }
    if (!seen.has(n)) {
      const chunk = chunks[n - 1];
      const meta = chunk.metadata || {};
      const preview = (chunk.text || "").trim().replace(/\s+/g, " ").slice(0, 280);
      const stableId =
        chunk.sourceType === "belief"
          ? `belief:${chunk.sourceId}`
          : `${chunk.sourceType}:${chunk.sourceId}:${chunk.chunkIndex}`;
      seen.set(n, {
        n,
        citationId: stableId,
        sourceType: chunk.sourceType,
        sourceId: chunk.sourceId,
        chunkIndex: chunk.chunkIndex,
        chunkRowId: chunk.id,
        title:
          meta.title ??
          meta.subject ??
          meta.fileName ??
          meta.conversationTitle ??
          meta.featureTitle ??
          null,
        preview,
        speaker: meta.speaker ?? null,
        startMs: meta.startMs ?? null,
        endMs: meta.endMs ?? null,
        page: meta.page ?? null,
        via: meta.via ?? null,
        sharedEntity: meta.sharedEntity ?? null,
        belief: meta.belief ?? null,
      });
    }
    emittedCount += 1;
    return `[chunk_id:${n}]`; // canonicalised whitespace
  });

  // Per-sentence breakdown (used by faithfulness verifier).
  const sentences: Array<{ sentence: string; citationNumbers: number[] }> = [];
  const rawSentences = cleaned
    .split(/(?<=[.?!])\s+(?=[A-Z(\[])|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const s of rawSentences) {
    const nums: number[] = [];
    s.replace(CITATION_RE, (_f, ns) => {
      const n = Number(ns);
      if (Number.isFinite(n) && n >= 1 && n <= maxN) nums.push(n);
      return "";
    });
    if (nums.length > 0) sentences.push({ sentence: s, citationNumbers: nums });
  }

  const citations = Array.from(seen.values()).sort((a, b) => a.n - b.n);
  return {
    text: cleaned,
    citations,
    emittedCount,
    invalidCount,
    sentences,
  };
}

/**
 * One-shot helper used by route handlers — parse, run the faithfulness
 * verifier (per `RAG_CITATION_FAITHFULNESS_MODE`), and return the final
 * (stripped) text + citations + counters for telemetry. Verifier failures
 * are logged but never thrown — citations are returned unstripped.
 */
export async function processCitationsForResponse(
  rawText: string,
  chunks: RetrievedChunk[],
): Promise<{
  text: string;
  citations: Citation[];
  emittedCount: number;
  strippedCount: number;
  invalidCount: number;
  mode: string;
  verifierMs: number;
}> {
  const parsed = parseAndValidateCitations(rawText, chunks);
  if (parsed.citations.length === 0) {
    return {
      text: parsed.text,
      citations: [],
      emittedCount: parsed.emittedCount,
      strippedCount: 0,
      invalidCount: parsed.invalidCount,
      mode: "n/a",
      verifierMs: 0,
    };
  }
  const { verifyCitations } = await import("./citation-faithfulness");
  const v = await verifyCitations(parsed, chunks);
  const stripped = applyStripSet(parsed, v.stripNs);
  return {
    text: stripped.text,
    citations: stripped.citations,
    emittedCount: parsed.emittedCount,
    strippedCount: v.stripNs.size,
    invalidCount: parsed.invalidCount,
    mode: v.mode,
    verifierMs: v.latencyMs,
  };
}

/**
 * Apply a verifier strip-set to the parsed text. Removes
 * `[chunk_id:N]` markers for each N in `stripNs` and drops those
 * citations from the citations[] array (so the chip + the Sources
 * footer both disappear). Mutating-safe.
 */
export function applyStripSet(
  parsed: ParsedCitations,
  stripNs: Set<number>,
): ParsedCitations {
  if (stripNs.size === 0) return parsed;
  const text = parsed.text.replace(CITATION_RE, (full, numStr: string) => {
    return stripNs.has(Number(numStr)) ? "" : full;
  });
  const citations = parsed.citations.filter((c) => !stripNs.has(c.n));
  return {
    text,
    citations,
    emittedCount: parsed.emittedCount,
    invalidCount: parsed.invalidCount,
    sentences: parsed.sentences,
  };
}

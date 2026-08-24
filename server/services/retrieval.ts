// Task #93 — Hybrid Retrieval + Reranker.
//
// Single entry point used by Brain Hub /api/ai/chat and Project Planner
// /api/ai/chat-stream when ?retrieval=hybrid (default). Replaces the
// keyword "context-injector" with proper RAG:
//
//   query → embed
//        → pgvector cosine top-50  ┐
//                                  ├─ RRF fuse → top-50
//        → BM25 (tsvector)  top-50 ┘
//        → Cohere rerank → top-k (default 8)
//
// Returns verbatim chunks + ids + per-source metadata so the caller can
// (a) format `[Source: …]` context, (b) persist `retrievedChunkIds` in
// ai_response_feedback, and (c) hand them to Task #94 (citations).

import { sql } from "drizzle-orm";
import { db } from "../db";
import { embedQuery } from "./embeddings";
import { rerank } from "./reranker";

export interface RetrievalScope {
  userId: string;
  projectId?: number | string | null;
  conversationId?: number | null;
}

export interface RetrievalFilters {
  sourceTypes?: string[];
  since?: Date | null;
  until?: Date | null;
  speaker?: string | null;
}

export interface RetrievedChunk {
  id: number;
  text: string;
  sourceType: string;
  sourceId: number;
  chunkIndex: number;
  metadata: Record<string, any>;
  score: number;
  scoreBreakdown: {
    cosine?: number;
    bm25?: number;
    rrf: number;
    rerank?: number;
  };
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  retrievalMs: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  candidateCount: number;
  /** Task #98 — count of 1-hop entity-neighbor chunks merged into `chunks`. */
  neighborsAdded?: number;
  /** Task #98 — distinct entities backing the final chunks (per-question). */
  entitiesInContext?: number;
  /** Task #98 — edges backing the final chunks (per-question). */
  edgesInContext?: number;
  /** Task #99 — count of `belief` chunks (consolidated claims) merged in. */
  beliefsAdded?: number;
}

interface CandidateRow {
  id: number;
  source_type: string;
  source_id: number;
  chunk_index: number;
  content: string;
  metadata: any;
  cos_rank: number | null;
  bm25_rank: number | null;
  cos_score: number | null;
  bm25_score: number | null;
}

const RRF_K = 60;
const CANDIDATE_POOL = 50;

// Lean wire shape sent to clients (Task #94 renders citations from this).
// Task #98 — pass through `via` + `sharedEntity` so the citation chip can
// render a small "related" label and an entity preview when the chunk was
// surfaced by 1-hop neighbor expansion rather than direct lexical/vector
// match. Task #99 — also pass through `belief` for consolidated-claim
// chips.
export function serializeChunksForWire(chunks: RetrievedChunk[]) {
  return chunks.map((c) => {
    const meta = c.metadata || {};
    return {
      id: c.id,
      sourceType: c.sourceType,
      sourceId: c.sourceId,
      chunkIndex: c.chunkIndex,
      // Cap text on the wire — citations only need a snippet preview.
      text: (c.text || "").slice(0, 600),
      score: c.score,
      scoreBreakdown: c.scoreBreakdown,
      title: meta.title ?? meta.subject ?? meta.fileName ?? null,
      speaker: meta.speaker ?? null,
      startMs: meta.startMs ?? null,
      endMs: meta.endMs ?? null,
      page: meta.page ?? null,
      via: meta.via ?? null,
      sharedEntity: meta.sharedEntity ?? null,
      sharedPredicate: meta.sharedPredicate ?? null,
      belief: meta.belief ?? null,
    };
  });
}

export async function retrieveContext(opts: {
  query: string;
  scope: RetrievalScope;
  filters?: RetrievalFilters;
  k?: number;
  // Task #105 — when true (RAG eval harness), the query embedding skips
  // token-usage tracking so an eval run never writes to the user's budget
  // ledger. Retrieval itself is already read-only.
  readOnly?: boolean;
}): Promise<RetrievalResult> {
  const started = Date.now();
  const kRaw = opts.k ?? 8;
  const k = Number.isFinite(kRaw) ? Math.max(1, Math.min(20, Math.trunc(kRaw))) : 8;
  const query = (opts.query || "").trim();
  if (!query) {
    return {
      chunks: [],
      retrievalMs: 0,
      fallbackUsed: false,
      candidateCount: 0,
    };
  }

  // Embed the query (Gemini, same model as stored chunks, L2-normalised).
  // Read-only callers (eval harness) skip token-usage tracking.
  const qvec = await embedQuery(query, opts.scope.userId, !opts.readOnly);
  // If embedding failed we still try BM25-only so we never return 0 results
  // for a transient Gemini blip.
  const vecLiteral = qvec ? `[${qvec.join(",")}]` : null;

  // -----------------------------------------------------------------
  // Single SQL that returns the union of (top-50 by cosine) + (top-50
  // by BM25) and exposes both ranks/scores so we can RRF-fuse in JS.
  // -----------------------------------------------------------------
  // Scope filtering — userId always required; projectId / conversationId
  // optional. We filter on metadata->>'userId' since chunking.ts stores
  // userId in the chunk metadata.
  const userIdStr = String(opts.scope.userId);
  const projectIdStr = opts.scope.projectId != null ? String(opts.scope.projectId) : null;
  const conversationId = opts.scope.conversationId ?? null;
  const sourceTypes = opts.filters?.sourceTypes ?? null;
  const since = opts.filters?.since ?? null;
  const until = opts.filters?.until ?? null;

  // Filter fragments — drizzle's sql tag composes them safely.
  // Strict per-user authz: only return chunks whose embedding metadata
  // explicitly carries this user's id. Null/missing userId is treated as
  // "untrusted/shared" and excluded to prevent cross-tenant leakage in
  // shared-DB deployments. Chunkers in `services/chunking.ts` always set
  // metadata.userId; any backfilled row without one will be invisible
  // until it is re-embedded — that's the safer default.
  const speaker = opts.filters?.speaker?.trim() || null;
  const scopeFilter = sql`
    chunk_index >= 0
    AND status = 'ok'
    AND metadata->>'userId' = ${userIdStr}
    ${projectIdStr ? sql`AND metadata->>'projectId' = ${projectIdStr}` : sql``}
    ${conversationId ? sql`AND NOT (source_type = 'conversation' AND source_id <> ${conversationId})` : sql``}
    ${sourceTypes && sourceTypes.length ? sql`AND source_type = ANY(${sourceTypes}::text[])` : sql``}
    ${since ? sql`AND created_at >= ${since.toISOString()}::timestamp` : sql``}
    ${until ? sql`AND created_at <= ${until.toISOString()}::timestamp` : sql``}
    ${speaker ? sql`AND metadata->>'speaker' = ${speaker}` : sql``}
  `;

  let rows: CandidateRow[] = [];
  try {
    // When embedding failed (no qvec), skip the cosine branch entirely
    // rather than constructing an invalid `[]::vector` literal — pgvector
    // rejects empty-array casts. BM25-only is the graceful degradation.
    const cosCte = vecLiteral
      ? sql`
        cos AS (
          SELECT id,
                 (1 - (embedding <=> ${vecLiteral}::vector)) AS score,
                 ROW_NUMBER() OVER (ORDER BY embedding <=> ${vecLiteral}::vector ASC) AS rk
            FROM embeddings
           WHERE ${scopeFilter}
             AND embedding IS NOT NULL
           ORDER BY embedding <=> ${vecLiteral}::vector ASC
           LIMIT ${CANDIDATE_POOL}
        ),`
      : sql`
        cos AS (
          SELECT NULL::int AS id, NULL::float AS score, NULL::bigint AS rk WHERE FALSE
        ),`;
    const result: any = await db.execute(sql`
      WITH ${cosCte}
      bm AS (
        SELECT id,
               ts_rank_cd(tsv, plainto_tsquery('english', ${query})) AS score,
               ROW_NUMBER() OVER (ORDER BY ts_rank_cd(tsv, plainto_tsquery('english', ${query})) DESC) AS rk
          FROM embeddings
         WHERE ${scopeFilter}
           AND tsv @@ plainto_tsquery('english', ${query})
         ORDER BY score DESC
         LIMIT ${CANDIDATE_POOL}
      ),
      ids AS (
        SELECT id FROM cos UNION SELECT id FROM bm
      )
      SELECT e.id, e.source_type, e.source_id, e.chunk_index, e.content, e.metadata,
             cos.rk  AS cos_rank,  cos.score AS cos_score,
             bm.rk   AS bm25_rank, bm.score  AS bm25_score
        FROM ids
        JOIN embeddings e ON e.id = ids.id
        LEFT JOIN cos ON cos.id = e.id
        LEFT JOIN bm  ON bm.id  = e.id
    `);
    rows = (result.rows || result) as CandidateRow[];
  } catch (err: any) {
    console.warn("[retrieval] hybrid SQL failed:", err?.message || err);
    return {
      chunks: [],
      retrievalMs: Date.now() - started,
      fallbackUsed: true,
      fallbackReason: `sql-error: ${err?.message || err}`,
      candidateCount: 0,
    };
  }

  if (rows.length === 0) {
    return {
      chunks: [],
      retrievalMs: Date.now() - started,
      fallbackUsed: !qvec,
      fallbackReason: qvec ? undefined : "embed-failed-bm25-empty",
      candidateCount: 0,
    };
  }

  // RRF fusion. RRF(d) = Σ 1/(k + rank_i(d)).
  const fused = rows
    .map((r) => {
      const rrf =
        (r.cos_rank ? 1 / (RRF_K + Number(r.cos_rank)) : 0) +
        (r.bm25_rank ? 1 / (RRF_K + Number(r.bm25_rank)) : 0);
      return { row: r, rrf };
    })
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, CANDIDATE_POOL);

  // Task #99 — belief candidates are included in the SAME rerank pass as
  // raw chunks, not appended post-rerank. This way the cross-encoder gets
  // to decide whether a consolidated belief ("team is worried about Stripe
  // webhook latency, 7× mentions") outranks an individual chunk for the
  // current query — instead of every belief being force-inserted into the
  // top-K regardless of quality. Belief candidates are tagged with a
  // negative id so they don't collide with embeddings.id in the rerank
  // input. Fail-open: belief fetch failures don't block chunk retrieval.
  let beliefCandidates: RetrievedChunk[] = [];
  try {
    if (qvec) {
      beliefCandidates = await searchBeliefs(vecLiteral!, userIdStr, 5);
    }
  } catch (err: any) {
    console.warn(
      "[retrieval] belief candidate fetch failed (continuing):",
      err?.message || err,
    );
  }

  type FusedEntry =
    | { kind: "chunk"; row: any; rrf: number }
    | { kind: "belief"; belief: RetrievedChunk };
  const fusedAll: FusedEntry[] = [
    ...fused.map((f) => ({ kind: "chunk" as const, row: f.row, rrf: f.rrf })),
    ...beliefCandidates.map((b) => ({ kind: "belief" as const, belief: b })),
  ];

  // Cross-encoder rerank. Falls back to RRF order on key/api failure.
  const rr = await rerank(
    query,
    fusedAll.map((entry, i) =>
      entry.kind === "chunk"
        ? { id: entry.row.id, text: entry.row.content }
        : { id: -1_000_000 - i, text: entry.belief.text },
    ),
    k,
  );
  if (rr.fallbackUsed) {
    console.warn(
      `[retrieval] reranker fallback (${rr.reason}); using RRF order.`,
    );
  }

  const order = rr.order.length
    ? rr.order
    : fusedAll.slice(0, k).map((_, i) => i);
  let beliefsAdded = 0;
  const chunks: RetrievedChunk[] = order.slice(0, k).map((idx, i) => {
    const entry = fusedAll[idx];
    if (entry.kind === "belief") {
      beliefsAdded += 1;
      const b = entry.belief;
      return {
        ...b,
        score: rr.scores[i] ?? b.score,
        scoreBreakdown: {
          ...b.scoreBreakdown,
          rerank: rr.scores[i],
        },
      };
    }
    const meta = (entry.row.metadata || {}) as Record<string, any>;
    return {
      id: Number(entry.row.id),
      text: entry.row.content,
      sourceType: entry.row.source_type,
      sourceId: Number(entry.row.source_id),
      chunkIndex: Number(entry.row.chunk_index),
      metadata: meta,
      score: rr.scores[i] ?? entry.rrf,
      scoreBreakdown: {
        cosine: entry.row.cos_score != null ? Number(entry.row.cos_score) : undefined,
        bm25: entry.row.bm25_score != null ? Number(entry.row.bm25_score) : undefined,
        rrf: entry.rrf,
        rerank: rr.scores[i],
      },
    };
  });

  // Task #98 — 1-hop entity-neighbor expansion. After the lexical/vector
  // top-K is reranked, walk the entity_edges anchored to those chunks,
  // hop one step to neighbor entities, then pull up to 4 *other* embedding
  // chunks where those neighbors appear. This is the connective-tissue
  // layer that lets the retriever answer relational questions like
  // "who works on X?" — it surfaces chunks that didn't lexically match
  // the query but are graph-adjacent to ones that did.
  let neighborsAdded = 0;
  try {
    const neighborChunks = await expandWithEntityNeighbors(
      chunks,
      userIdStr,
      4,
    );
    if (neighborChunks.length) {
      chunks.push(...neighborChunks);
      neighborsAdded = neighborChunks.length;
    }
  } catch (err: any) {
    console.warn(
      "[retrieval] entity-neighbor expansion failed (continuing):",
      err?.message || err,
    );
  }

  // Task #98 — per-question entity/edge counts for ai_response_feedback
  // telemetry. One small query over the final chunk set. Fail-open.
  let entitiesInContext = 0;
  let edgesInContext = 0;
  try {
    const finalIds = chunks.map((c) => c.id).filter((n) => Number.isFinite(n));
    if (finalIds.length > 0) {
      // Pass a Postgres array literal string (not a JS array, which Drizzle
      // would interpolate as a record and fail to cast to int[]).
      const finalIdsLiteral = `{${finalIds.join(",")}}`;
      const counts: any = await db.execute(sql`
        SELECT
          COUNT(*)::int AS edges,
          COUNT(DISTINCT ent_id)::int AS entities
          FROM (
            SELECT ee.id, ee.src_entity_id AS ent_id
              FROM entity_edges ee
             WHERE ee.user_id = ${userIdStr}
               AND ee.source_embedding_id = ANY(${finalIdsLiteral}::int[])
            UNION ALL
            SELECT ee.id, ee.dst_entity_id AS ent_id
              FROM entity_edges ee
             WHERE ee.user_id = ${userIdStr}
               AND ee.source_embedding_id = ANY(${finalIdsLiteral}::int[])
          ) AS ee2
      `);
      const countsRow = ((counts.rows || counts) as any[])[0] || {};
      // edges is double-counted by the UNION ALL → halve it.
      edgesInContext = Math.floor(Number(countsRow.edges || 0) / 2);
      entitiesInContext = Number(countsRow.entities || 0);
    }
  } catch (err: any) {
    console.warn(
      "[retrieval] entity context-count failed (continuing):",
      err?.message || err,
    );
  }

  // Belief fusion now happens at rerank time (see above), so no separate
  // post-rerank append step here. `beliefsAdded` is set when iterating
  // the reranker output.

  const retrievalMs = Date.now() - started;
  console.log(
    `[retrieval] q="${query.slice(0, 60)}" candidates=${rows.length} reranked=${chunks.length - neighborsAdded - beliefsAdded} neighbors=${neighborsAdded} beliefs=${beliefsAdded} entities=${entitiesInContext} edges=${edgesInContext} fallback=${rr.fallbackUsed} ${retrievalMs}ms`,
  );

  return {
    chunks,
    retrievalMs,
    fallbackUsed: rr.fallbackUsed,
    fallbackReason: rr.reason,
    candidateCount: rows.length,
    neighborsAdded,
    entitiesInContext,
    edgesInContext,
    beliefsAdded,
  };
}

/**
 * Task #99 — vector search over `beliefs` for this user. Returns up to `cap`
 * belief-chunks shaped like RetrievedChunk so they merge into the same
 * citations pipeline as raw embedding chunks. Each chunk's text is a small
 * formatted summary of the claim; the underlying source-chunk ids ride along
 * in `metadata.belief.sourceEmbeddingIds` so the UI can expand the chip.
 *
 * `id` is set to a NEGATIVE number derived from the belief id so it never
 * collides with positive `embeddings.id` values used elsewhere
 * (retrievedChunkIds[], faithfulness verifier joins). Citations.ts derives
 * its stable citationId from `(sourceType, sourceId, chunkIndex)` instead,
 * which uses the real (positive) belief id — that string is reload-safe.
 */
async function searchBeliefs(
  qVecLiteral: string,
  userId: string,
  cap: number,
): Promise<RetrievedChunk[]> {
  if (cap <= 0) return [];
  let rows: any[] = [];
  try {
    const result: any = await db.execute(sql`
      SELECT id, subject_entity_id, predicate, object, holder, weight,
             mention_count, source_embedding_ids, last_seen_at, status,
             (1 - (embedding <=> ${qVecLiteral}::vector)) AS cos_score
        FROM beliefs
       WHERE user_id = ${userId}
         AND status = 'active'
         AND embedding IS NOT NULL
       ORDER BY embedding <=> ${qVecLiteral}::vector ASC
       LIMIT ${cap}
    `);
    rows = (result.rows || result) as any[];
  } catch (err: any) {
    // Table may not exist on a fresh DB pre-setup; fail-open.
    return [];
  }

  const out: RetrievedChunk[] = [];
  for (const row of rows) {
    const beliefId = Number(row.id);
    const mentionCount = Number(row.mention_count || 0);
    const holder = row.holder ? String(row.holder) : null;
    const predicate = String(row.predicate);
    const object = String(row.object);
    const cos = Number(row.cos_score || 0);
    // Filter weak matches — vector hit with cos < 0.55 is almost certainly
    // noise (beliefs are short; spurious neighbors are common).
    if (cos < 0.55) continue;
    const sourceIds = (row.source_embedding_ids || []).map((n: any) =>
      Number(n),
    );
    const text = `Durable belief: ${holder ? holder + " " : ""}${predicate} — ${object} (mentioned ${mentionCount}× across ${sourceIds.length} sources).`;
    out.push({
      id: -beliefId, // negative sentinel; see fn docstring
      text,
      sourceType: "belief",
      sourceId: beliefId,
      chunkIndex: 0,
      metadata: {
        userId,
        title: `${predicate}: ${object.slice(0, 60)}`,
        via: "belief",
        belief: {
          id: beliefId,
          holder,
          mentionCount,
          lastSeenAt: row.last_seen_at
            ? new Date(row.last_seen_at).toISOString()
            : null,
          weight: Number(row.weight || 0),
          status: String(row.status || "active"),
          sourceEmbeddingIds: sourceIds,
        },
      },
      score: cos,
      scoreBreakdown: { cosine: cos, rrf: 0, rerank: cos },
    });
  }
  return out;
}

/**
 * Task #98 — 1-hop expansion. Given the reranked top-K, find entities
 * mentioned in those chunks, hop to their neighbors via `entity_edges`,
 * and return new (non-overlapping) chunks where those neighbors appear.
 * Strict userId scoping on every join. Always returns a list (possibly
 * empty) — never throws.
 */
async function expandWithEntityNeighbors(
  seeds: RetrievedChunk[],
  userId: string,
  cap: number,
): Promise<RetrievedChunk[]> {
  if (seeds.length === 0 || cap <= 0) return [];
  const seedIds = seeds.map((c) => c.id).filter((n) => Number.isFinite(n));
  if (seedIds.length === 0) return [];
  const seedIdSet = new Set(seedIds);
  // Drizzle interpolates a JS array as a row/record `(1,2,3)`, so casting it
  // with `::int[]` raises "cannot cast type record to integer[]". Build a
  // Postgres array literal string ({1,2,3}) and pass it as a single param —
  // safe because every id is a finite number (filtered above).
  const seedIdsLiteral = `{${seedIds.join(",")}}`;

  // One round-trip: pick up to `cap` neighbor chunks. A neighbor chunk is an
  // embedding row that is anchored to an entity that ALSO appears in one of
  // the seed chunks (i.e. there exists an entity E with edges (e1)→E→(e2)
  // where e1.source_embedding_id IN seeds and e2.source_embedding_id NOT IN
  // seeds). We rank candidates by mention-frequency of the shared entity
  // so popular-topic neighbors win ties.
  const result: any = await db.execute(sql`
    WITH seed_entities AS (
      SELECT DISTINCT ee.src_entity_id AS entity_id
        FROM entity_edges ee
       WHERE ee.user_id = ${userId}
         AND ee.source_embedding_id = ANY(${seedIdsLiteral}::int[])
      UNION
      SELECT DISTINCT ee.dst_entity_id AS entity_id
        FROM entity_edges ee
       WHERE ee.user_id = ${userId}
         AND ee.source_embedding_id = ANY(${seedIdsLiteral}::int[])
    ),
    neighbor_rows AS (
      SELECT ee.source_embedding_id AS embedding_id,
             ent.id     AS shared_entity_id,
             ent.kind   AS shared_entity_kind,
             ent.display_name AS shared_entity_name,
             ent.mention_count,
             ee.predicate
        FROM entity_edges ee
        JOIN seed_entities se
          ON (se.entity_id = ee.src_entity_id OR se.entity_id = ee.dst_entity_id)
        JOIN entities ent
          ON ent.id = se.entity_id
         AND ent.user_id = ${userId}
       WHERE ee.user_id = ${userId}
         AND NOT (ee.source_embedding_id = ANY(${seedIdsLiteral}::int[]))
    ),
    ranked AS (
      SELECT embedding_id,
             shared_entity_id,
             shared_entity_kind,
             shared_entity_name,
             predicate,
             ROW_NUMBER() OVER (
               PARTITION BY embedding_id
               ORDER BY mention_count DESC, shared_entity_id ASC
             ) AS rn,
             MAX(mention_count) OVER (PARTITION BY embedding_id) AS rank_score
        FROM neighbor_rows
    )
    SELECT e.id, e.source_type, e.source_id, e.chunk_index, e.content, e.metadata,
           r.shared_entity_id, r.shared_entity_kind, r.shared_entity_name,
           r.predicate, r.rank_score
      FROM ranked r
      JOIN embeddings e ON e.id = r.embedding_id
     WHERE r.rn = 1
       AND e.status = 'ok'
       AND e.chunk_index >= 0
       AND e.metadata->>'userId' = ${userId}
     ORDER BY r.rank_score DESC, e.id DESC
     LIMIT ${cap}
  `);

  const rows = (result.rows || result) as any[];
  const out: RetrievedChunk[] = [];
  for (const row of rows) {
    const id = Number(row.id);
    if (seedIdSet.has(id)) continue;
    const meta = (row.metadata || {}) as Record<string, any>;
    out.push({
      id,
      text: String(row.content || ""),
      sourceType: String(row.source_type),
      sourceId: Number(row.source_id),
      chunkIndex: Number(row.chunk_index),
      metadata: {
        ...meta,
        via: "entity-neighbor",
        sharedEntity: {
          id: Number(row.shared_entity_id),
          kind: String(row.shared_entity_kind),
          name: String(row.shared_entity_name),
        },
        sharedPredicate: row.predicate ? String(row.predicate) : null,
      },
      score: 0,
      scoreBreakdown: { rrf: 0, rerank: 0 },
    });
  }
  return out;
}

/**
 * Format retrieved chunks into the `[Source: <label>]\n<text>` block we
 * paste into the system prompt. Verbatim — never summarised here. The
 * next task (citations) will read the same labels back to the user.
 */
export function formatRetrievedContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  const blocks = chunks.map((c, i) => {
    const label = humanLabel(c);
    return `[Source ${i + 1}: ${label}]\n${c.text}`;
  });
  return `[Retrieved Context — top ${chunks.length} chunks]\n\n${blocks.join("\n\n---\n\n")}`;
}

function humanLabel(c: RetrievedChunk): string {
  const m = c.metadata || {};
  const title =
    m.title ||
    m.fileName ||
    m.subject ||
    m.conversationTitle ||
    m.featureTitle ||
    `${c.sourceType}#${c.sourceId}`;
  const type = String(c.sourceType).replace(/_/g, " ");
  // Task #98 — annotate neighbor-expanded chunks so the LLM (and the user
  // reading the prompt back in debug mode) knows this chunk came in via
  // the graph, not lexical match.
  if (m.via === "entity-neighbor" && m.sharedEntity?.name) {
    return `${type} — ${title} (related via ${m.sharedEntity.name})`;
  }
  // Task #99 — annotate consolidated-belief chunks the same way.
  if (m.via === "belief" && m.belief) {
    return `belief — ${title} (consolidated from ${m.belief.mentionCount}× mentions)`;
  }
  return `${type} — ${title}`;
}

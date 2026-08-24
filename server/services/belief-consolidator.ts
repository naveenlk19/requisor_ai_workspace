// Task #99 — Nightly belief consolidation.
//
// `consolidateForUser(userId, sinceTimestamp)` is the unit of work the cron
// scheduler invokes once a day per active user. Algorithm:
//
//   1. Pull entity_edges authored in [sinceTimestamp, now], group by
//      (src_entity_id, predicate).
//   2. For any group backed by ≥3 distinct source_embedding_ids, ask
//      gpt-4o-mini to mint a single canonical claim
//      {predicate, object, weight, holder} grounded in those chunk texts.
//   3. Dedupe against existing active beliefs for that subject. A match is
//      either cosine(embedding) ≥ 0.85 OR Levenshtein on `predicate+object`
//      below a small threshold. On match: bump mentionCount, extend
//      sourceEmbeddingIds (deduped), update lastSeenAt.
//      On miss: insert a fresh belief.
//      On semantic opposite: insert + set contradictionOfBeliefId,
//      status='contradicted'.
//   4. Mark any active belief untouched for >30 days as `stale`.
//
// Cost guard: every LLM call funnels through `trackBudget`. If a user has
// already burned `BELIEF_CONSOLIDATION_MAX_TOKENS_PER_USER` (default 50k)
// for this run, we short-circuit and log a warning. Fail-open everywhere.

import { sql } from "drizzle-orm";
import OpenAI from "openai";
import { z } from "zod";
import { db } from "../db";
import { embedQuery } from "./embeddings";
import { trackTokenUsage } from "./token-tracker";

const MODEL = "gpt-4o-mini";
const MIN_MENTIONS = 3;
const MAX_CLAIM_CHARS = 400;
const COSINE_DEDUPE_THRESHOLD = 0.85;
const LEVENSHTEIN_DEDUPE_RATIO = 0.2; // edit distance / claim length
const DECAY_DAYS = 30;
const DEFAULT_BUDGET_TOKENS = 50_000;

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  if (openaiClient) return openaiClient;
  if (!process.env.OPENAI_API_KEY) return null;
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

const CanonicalClaimSchema = z.object({
  predicate: z.string().min(1).max(80),
  object: z.string().min(1).max(MAX_CLAIM_CHARS),
  holder: z.string().min(1).max(80).nullable().optional(),
  weight: z.number().min(0).max(1).default(0.6),
  contradicts_existing: z.boolean().default(false),
  contradicts_belief_id: z.number().int().nullable().optional(),
});
type CanonicalClaim = z.infer<typeof CanonicalClaimSchema>;

export interface ConsolidationResult {
  userId: string;
  groupsConsidered: number;
  beliefsInserted: number;
  beliefsUpdated: number;
  beliefsContradicted: number;
  beliefsDecayed: number;
  llmCalls: number;
  tokensUsed: number;
  budgetExceeded: boolean;
  errorCount: number;
}

interface EdgeGroupRow {
  src_entity_id: number;
  predicate: string;
  subject_name: string;
  subject_kind: string;
  source_embedding_ids: number[];
  mention_count: number;
}

interface ExistingBeliefRow {
  id: number;
  predicate: string;
  object: string;
  embedding: number[] | null;
  mention_count: number;
  source_embedding_ids: number[];
  status: string;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

function cosine(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

function parsePgVector(v: unknown): number[] | null {
  if (!v) return null;
  if (Array.isArray(v)) return v as number[];
  if (typeof v !== "string") return null;
  // pg returns vector as "[0.1,0.2,…]" literal.
  const trimmed = v.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!trimmed) return null;
  const out = trimmed.split(",").map((s) => Number(s));
  return out.some((n) => !Number.isFinite(n)) ? null : out;
}

async function loadGroupedEdges(
  userId: string,
  since: Date,
): Promise<EdgeGroupRow[]> {
  // Group recent edges by (subject, predicate). `src_entity_id` is the
  // subject by convention (extractor emits src→dst directional edges).
  const result: any = await db.execute(sql`
    SELECT
      ee.src_entity_id,
      ee.predicate,
      ent.display_name AS subject_name,
      ent.kind AS subject_kind,
      ARRAY_AGG(DISTINCT ee.source_embedding_id) AS source_embedding_ids,
      COUNT(DISTINCT ee.source_embedding_id)::int AS mention_count
      FROM entity_edges ee
      JOIN entities ent
        ON ent.id = ee.src_entity_id
       AND ent.user_id = ${userId}
     WHERE ee.user_id = ${userId}
       AND ee.created_at >= ${since.toISOString()}::timestamp
  GROUP BY ee.src_entity_id, ee.predicate, ent.display_name, ent.kind
    HAVING COUNT(DISTINCT ee.source_embedding_id) >= ${MIN_MENTIONS}
     ORDER BY mention_count DESC
     LIMIT 200
  `);
  return ((result.rows || result) as any[]).map((r) => ({
    src_entity_id: Number(r.src_entity_id),
    predicate: String(r.predicate),
    subject_name: String(r.subject_name),
    subject_kind: String(r.subject_kind),
    source_embedding_ids: (r.source_embedding_ids || []).map((n: any) =>
      Number(n),
    ),
    mention_count: Number(r.mention_count),
  }));
}

async function loadChunkTexts(
  userId: string,
  embeddingIds: number[],
): Promise<{ id: number; content: string }[]> {
  if (!embeddingIds.length) return [];
  const ids = embeddingIds.slice(0, 8);
  const result: any = await db.execute(sql`
    SELECT id, content
      FROM embeddings
     WHERE id = ANY(${ids}::int[])
       AND metadata->>'userId' = ${userId}
     LIMIT 8
  `);
  return ((result.rows || result) as any[]).map((r) => ({
    id: Number(r.id),
    content: String(r.content || "").slice(0, 800),
  }));
}

async function loadExistingBeliefs(
  userId: string,
  subjectEntityId: number,
): Promise<ExistingBeliefRow[]> {
  const result: any = await db.execute(sql`
    SELECT id, predicate, object, embedding,
           mention_count, source_embedding_ids, status
      FROM beliefs
     WHERE user_id = ${userId}
       AND subject_entity_id = ${subjectEntityId}
       AND status IN ('active','contradicted')
     LIMIT 50
  `);
  return ((result.rows || result) as any[]).map((r) => ({
    id: Number(r.id),
    predicate: String(r.predicate),
    object: String(r.object),
    embedding: parsePgVector(r.embedding),
    mention_count: Number(r.mention_count),
    source_embedding_ids: (r.source_embedding_ids || []).map((n: any) =>
      Number(n),
    ),
    status: String(r.status),
  }));
}

const SYSTEM_PROMPT = `You distill a single canonical CLAIM from several short business-communication snippets that all reference the same subject entity (e.g. a person, project, or feature) under the same loose relation.

Return STRICT JSON:
{
  "predicate": "<short verb-phrase, e.g. 'worried_about', 'wants', 'blocked_by', 'committed_to', 'owns'>",
  "object": "<concrete thing the predicate points at, ≤400 chars>",
  "holder": "<who holds the claim — 'team', a person's name, or null>",
  "weight": <0.0-1.0, how strongly the snippets converge on this claim>,
  "contradicts_existing": false,
  "contradicts_belief_id": null
}

Rules:
- Output ONE claim only — the most defensible one supported by ≥2 snippets.
- Use the subject as the implicit grammatical subject; do NOT repeat it in object.
- Prefer concrete language ("Stripe webhook latency >2s"), not generic ("performance").
- If existing beliefs are listed and any one is logically OPPOSED to your new claim, set contradicts_existing=true and contradicts_belief_id to its id.
- If snippets disagree among themselves, set weight low (0.3-0.5) and pick the most-mentioned framing.`;

function buildUserPrompt(
  group: EdgeGroupRow,
  chunks: { id: number; content: string }[],
  existing: ExistingBeliefRow[],
): string {
  const chunkBlock = chunks
    .map((c, i) => `Snippet ${i + 1} (chunk ${c.id}):\n"""\n${c.content}\n"""`)
    .join("\n\n");
  const existingBlock = existing.length
    ? `\n\nExisting active beliefs for this subject (for dedupe / contradiction):\n${existing
        .slice(0, 8)
        .map((e) => `- id=${e.id} predicate="${e.predicate}" object="${e.object}"`)
        .join("\n")}`
    : "";
  return `Subject entity: ${group.subject_name} (${group.subject_kind})
Loose relation observed: ${group.predicate}
Number of distinct supporting snippets: ${group.mention_count}

${chunkBlock}${existingBlock}`;
}

async function mintCanonicalClaim(
  group: EdgeGroupRow,
  chunks: { id: number; content: string }[],
  existing: ExistingBeliefRow[],
  userId: string,
): Promise<{
  claim: CanonicalClaim | null;
  promptTokens: number;
  completionTokens: number;
}> {
  const client = getOpenAI();
  if (!client) {
    return { claim: null, promptTokens: 0, completionTokens: 0 };
  }
  try {
    const resp = await client.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(group, chunks, existing) },
      ],
    });
    const raw = resp.choices?.[0]?.message?.content || "{}";
    const promptTokens = resp.usage?.prompt_tokens ?? 0;
    const completionTokens = resp.usage?.completion_tokens ?? 0;
    trackTokenUsage(
      userId,
      "belief-consolidation",
      MODEL,
      {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      { subjectEntityId: group.src_entity_id, predicate: group.predicate },
    ).catch(() => {});
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return { claim: null, promptTokens, completionTokens };
    }
    const validated = CanonicalClaimSchema.safeParse(parsedJson);
    if (!validated.success) {
      return { claim: null, promptTokens, completionTokens };
    }
    return { claim: validated.data, promptTokens, completionTokens };
  } catch (err: any) {
    console.warn(
      "[belief-consolidator] LLM call failed:",
      err?.message || err,
    );
    return { claim: null, promptTokens: 0, completionTokens: 0 };
  }
}

function matchExisting(
  claim: CanonicalClaim,
  claimVec: number[] | null,
  existing: ExistingBeliefRow[],
): ExistingBeliefRow | null {
  const claimStr = `${claim.predicate} ${claim.object}`.toLowerCase();
  for (const e of existing) {
    if (e.status !== "active") continue;
    const existStr = `${e.predicate} ${e.object}`.toLowerCase();
    if (claimVec && e.embedding) {
      const cs = cosine(claimVec, e.embedding);
      if (cs >= COSINE_DEDUPE_THRESHOLD) return e;
    }
    const dist = levenshtein(claimStr, existStr);
    const ratio = dist / Math.max(claimStr.length, 1);
    if (ratio <= LEVENSHTEIN_DEDUPE_RATIO) return e;
  }
  return null;
}

function vecLiteral(vec: number[] | null): string | null {
  if (!vec || !vec.length) return null;
  return `[${vec.join(",")}]`;
}

async function upsertBelief(
  userId: string,
  group: EdgeGroupRow,
  claim: CanonicalClaim,
  claimVec: number[] | null,
  existing: ExistingBeliefRow[],
): Promise<"inserted" | "updated" | "contradicted"> {
  const match = matchExisting(claim, claimVec, existing);
  const litVec = vecLiteral(claimVec);

  if (match) {
    // Idempotency: only count *new* source chunks toward mention_count. If
    // the cron's 26h window overlaps a prior run, or the backfill is
    // re-invoked, group.source_embedding_ids will repeat ids we've already
    // booked — adding `group.mention_count` blindly would double-count.
    const existingSet = new Set(match.source_embedding_ids);
    const newSourceIds = group.source_embedding_ids.filter(
      (id) => !existingSet.has(id),
    );
    const mergedSources = [...match.source_embedding_ids, ...newSourceIds];
    const delta = newSourceIds.length;
    if (delta === 0) {
      // No new evidence at all → just refresh weight and updated_at; do not
      // bump last_seen_at (nothing was actually re-seen) and do not bump
      // mention_count. This keeps repeated cron ticks over the same window
      // safe.
      await db.execute(sql`
        UPDATE beliefs
           SET weight = LEAST(1.0, GREATEST(weight, ${claim.weight})),
               updated_at = NOW(),
               decayed_at = NULL,
               status = 'active'
         WHERE id = ${match.id}
           AND user_id = ${userId}
      `);
    } else {
      await db.execute(sql`
        UPDATE beliefs
           SET mention_count = ${match.mention_count + delta},
               source_embedding_ids = ${mergedSources}::int[],
               last_seen_at = NOW(),
               updated_at = NOW(),
               weight = LEAST(1.0, GREATEST(weight, ${claim.weight})),
               decayed_at = NULL,
               status = 'active'
         WHERE id = ${match.id}
           AND user_id = ${userId}
      `);
    }
    return "updated";
  }

  // Detect contradiction: LLM signaled it AND the targeted belief exists
  // and belongs to this user.
  let contradictionOf: number | null = null;
  if (
    claim.contradicts_existing &&
    claim.contradicts_belief_id &&
    existing.some((e) => e.id === claim.contradicts_belief_id)
  ) {
    contradictionOf = claim.contradicts_belief_id;
  }

  if (litVec) {
    await db.execute(sql`
      INSERT INTO beliefs (
        user_id, subject_entity_id, predicate, object, holder, weight,
        embedding, source_embedding_ids, mention_count,
        contradiction_of_belief_id, status
      ) VALUES (
        ${userId}, ${group.src_entity_id}, ${claim.predicate}, ${claim.object},
        ${claim.holder ?? null}, ${claim.weight},
        ${litVec}::vector, ${group.source_embedding_ids}::int[], ${group.mention_count},
        ${contradictionOf}, ${contradictionOf ? "contradicted" : "active"}
      )
    `);
  } else {
    await db.execute(sql`
      INSERT INTO beliefs (
        user_id, subject_entity_id, predicate, object, holder, weight,
        source_embedding_ids, mention_count,
        contradiction_of_belief_id, status
      ) VALUES (
        ${userId}, ${group.src_entity_id}, ${claim.predicate}, ${claim.object},
        ${claim.holder ?? null}, ${claim.weight},
        ${group.source_embedding_ids}::int[], ${group.mention_count},
        ${contradictionOf}, ${contradictionOf ? "contradicted" : "active"}
      )
    `);
  }
  return contradictionOf ? "contradicted" : "inserted";
}

async function decayStaleBeliefs(userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - DECAY_DAYS * 24 * 60 * 60 * 1000);
  const result: any = await db.execute(sql`
    UPDATE beliefs
       SET status = 'stale',
           decayed_at = NOW(),
           updated_at = NOW()
     WHERE user_id = ${userId}
       AND status = 'active'
       AND last_seen_at < ${cutoff.toISOString()}::timestamp
    RETURNING id
  `);
  const rows = (result.rows || result) as any[];
  return rows.length;
}

/**
 * Consolidate beliefs for one user from `since` to now. Returns a structured
 * accounting row for the cron logger. Never throws — per-group errors are
 * caught and counted.
 */
export async function consolidateForUser(
  userId: string,
  since: Date,
): Promise<ConsolidationResult> {
  const out: ConsolidationResult = {
    userId,
    groupsConsidered: 0,
    beliefsInserted: 0,
    beliefsUpdated: 0,
    beliefsContradicted: 0,
    beliefsDecayed: 0,
    llmCalls: 0,
    tokensUsed: 0,
    budgetExceeded: false,
    errorCount: 0,
  };

  const budget = Number(
    process.env.BELIEF_CONSOLIDATION_MAX_TOKENS_PER_USER ||
      DEFAULT_BUDGET_TOKENS,
  );

  let groups: EdgeGroupRow[] = [];
  try {
    groups = await loadGroupedEdges(userId, since);
  } catch (err: any) {
    console.warn(
      `[belief-consolidator] loadGroupedEdges failed for ${userId}:`,
      err?.message || err,
    );
    return out;
  }
  out.groupsConsidered = groups.length;

  for (const group of groups) {
    if (out.tokensUsed >= budget) {
      console.warn(
        `[belief-consolidator] user=${userId} hit token budget (${out.tokensUsed}/${budget}); short-circuiting.`,
      );
      out.budgetExceeded = true;
      break;
    }
    try {
      const chunks = await loadChunkTexts(userId, group.source_embedding_ids);
      if (chunks.length < MIN_MENTIONS) continue;
      const existing = await loadExistingBeliefs(userId, group.src_entity_id);
      const { claim, promptTokens, completionTokens } =
        await mintCanonicalClaim(group, chunks, existing, userId);
      out.llmCalls += 1;
      out.tokensUsed += promptTokens + completionTokens;
      if (!claim) continue;
      const claimText = `${claim.predicate} ${claim.object}`.slice(0, 480);
      const claimVec = await embedQuery(claimText, userId);
      const verdict = await upsertBelief(
        userId,
        group,
        claim,
        claimVec,
        existing,
      );
      if (verdict === "inserted") out.beliefsInserted += 1;
      else if (verdict === "updated") out.beliefsUpdated += 1;
      else out.beliefsContradicted += 1;
    } catch (err: any) {
      out.errorCount += 1;
      console.warn(
        `[belief-consolidator] group failed (user=${userId} subject=${group.src_entity_id} predicate=${group.predicate}):`,
        err?.message || err,
      );
    }
  }

  try {
    out.beliefsDecayed = await decayStaleBeliefs(userId);
  } catch (err: any) {
    console.warn(
      `[belief-consolidator] decayStaleBeliefs failed for ${userId}:`,
      err?.message || err,
    );
  }

  return out;
}

/**
 * Find users who have written embeddings in the last `lookbackDays` days.
 * Used by the cron to skip silent accounts so we don't burn LLM calls on
 * dormant users.
 */
export async function findActiveUsers(lookbackDays = 7): Promise<string[]> {
  try {
    const since = new Date(
      Date.now() - lookbackDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const result: any = await db.execute(sql`
      SELECT DISTINCT metadata->>'userId' AS user_id
        FROM embeddings
       WHERE created_at >= ${since}::timestamp
         AND metadata->>'userId' IS NOT NULL
       LIMIT 500
    `);
    return ((result.rows || result) as any[])
      .map((r) => String(r.user_id || ""))
      .filter((s) => s.length > 0);
  } catch (err: any) {
    console.warn(
      "[belief-consolidator] findActiveUsers failed:",
      err?.message || err,
    );
    return [];
  }
}

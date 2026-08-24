// Task #98 — Entity + edge extractor.
//
// Given one embedded chunk of text, call gpt-4o-mini in JSON mode and return
// a tiny typed graph: `{entities: [...], edges: [...]}`. The result is cached
// content-addressably by sha256(chunkText) in `entity_extraction_cache` so
// re-embeds (and identical text across users) don't re-spend tokens.
//
// Design notes:
//   • Fail open. Any error — bad JSON, schema mismatch, OpenAI outage —
//     returns `{entities:[], edges:[]}` so the embedding worker never blocks
//     on entity extraction.
//   • Cheap by default. We cap the prompt at 4000 chars (extraction targets
//     proper nouns + relations, not summarisation) and ask for at most 8
//     entities / 12 edges per chunk to keep cost predictable.
//   • Per-user privacy. The cache key is sha256(text) — the cache row carries
//     NO userId. The userId-scoped fan-out into `entities` / `entity_edges`
//     happens in `embeddings.ts` after this returns.
//   • Strict slug. We normalise slugs ourselves so "Naveen" / "naveen " /
//     "NAVEEN" collapse to one entity per user, even if the model varies its
//     casing chunk-to-chunk.

import { sql } from "drizzle-orm";
import crypto from "crypto";
import OpenAI from "openai";
import { z } from "zod";
import { db } from "../db";
import { trackTokenUsage } from "./token-tracker";

const MODEL = "gpt-4o-mini";
const MAX_INPUT_CHARS = 4000;
const MAX_ENTITIES = 8;
const MAX_EDGES = 12;

export const ENTITY_KINDS = [
  "person",
  "company",
  "project",
  "feature",
  "risk",
  "decision",
  "tool",
  "topic",
] as const;

export const EDGE_PREDICATES = [
  "mentions",
  "works_at",
  "blocks",
  "owns",
  "attended",
  "decided",
  "assigned_to",
  "said",
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];
export type EdgePredicate = (typeof EDGE_PREDICATES)[number];

const RawEntitySchema = z.object({
  kind: z.enum(ENTITY_KINDS),
  name: z.string().min(1).max(120),
});

const RawEdgeSchema = z.object({
  src: z.string().min(1).max(120),
  src_kind: z.enum(ENTITY_KINDS),
  dst: z.string().min(1).max(120),
  dst_kind: z.enum(ENTITY_KINDS),
  predicate: z.enum(EDGE_PREDICATES),
  confidence: z.number().min(0).max(1).optional(),
});

const RawResultSchema = z.object({
  entities: z.array(RawEntitySchema).max(MAX_ENTITIES * 2).default([]),
  edges: z.array(RawEdgeSchema).max(MAX_EDGES * 2).default([]),
});

export interface ExtractedEntity {
  kind: EntityKind;
  slug: string;
  displayName: string;
}

export interface ExtractedEdge {
  srcSlug: string;
  srcKind: EntityKind;
  dstSlug: string;
  dstKind: EntityKind;
  predicate: EdgePredicate;
  confidence: number; // 0–100
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  edges: ExtractedEdge[];
  cached: boolean;
}

export interface ExtractorContext {
  userId: string;
  sourceType: string;
  sourceId: number;
  speaker?: string | null;
}

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  if (openaiClient) return openaiClient;
  if (!process.env.OPENAI_API_KEY) return null;
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function hashChunk(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function normaliseResult(raw: z.infer<typeof RawResultSchema>): {
  entities: ExtractedEntity[];
  edges: ExtractedEdge[];
} {
  const byKey = new Map<string, ExtractedEntity>();
  const recordEntity = (kind: EntityKind, name: string) => {
    const slug = slugify(name);
    if (!slug) return null;
    const key = `${kind}:${slug}`;
    if (!byKey.has(key)) {
      byKey.set(key, { kind, slug, displayName: name.trim().slice(0, 120) });
    }
    return key;
  };

  for (const e of raw.entities) recordEntity(e.kind, e.name);

  const edges: ExtractedEdge[] = [];
  for (const e of raw.edges) {
    const srcKey = recordEntity(e.src_kind, e.src);
    const dstKey = recordEntity(e.dst_kind, e.dst);
    if (!srcKey || !dstKey || srcKey === dstKey) continue;
    edges.push({
      srcSlug: slugify(e.src),
      srcKind: e.src_kind,
      dstSlug: slugify(e.dst),
      dstKind: e.dst_kind,
      predicate: e.predicate,
      confidence: Math.round((e.confidence ?? 0.7) * 100),
    });
  }

  return {
    entities: Array.from(byKey.values()).slice(0, MAX_ENTITIES),
    edges: edges.slice(0, MAX_EDGES),
  };
}

const SYSTEM_PROMPT = `You extract a tiny entity graph from one chunk of business communication (meeting transcript, email, chat message, or document snippet).

Return STRICT JSON matching this shape:
{
  "entities": [{ "kind": "<kind>", "name": "<proper-noun>" }, ...],
  "edges": [{ "src": "<name>", "src_kind": "<kind>", "dst": "<name>", "dst_kind": "<kind>", "predicate": "<predicate>", "confidence": 0.0-1.0 }, ...]
}

Valid kinds: person, company, project, feature, risk, decision, tool, topic.
Valid predicates: mentions, works_at, blocks, owns, attended, decided, assigned_to, said.

Rules:
- Only extract PROPER nouns or clearly-named concepts. Skip pronouns, generic words ("the project", "our tool").
- Cap output at ${MAX_ENTITIES} entities and ${MAX_EDGES} edges.
- Names should be the surface form the text uses (e.g. "Naveen", "Landing AI Pilot"). Casing will be normalised later.
- Set confidence based on how directly the relation is stated. 0.9 = explicit ("Naveen decided…"). 0.5 = inferred from co-mention.
- If the chunk has no entities, return {"entities":[],"edges":[]}. Do NOT invent.
- The chunk's speaker (if provided) is already a known person; only emit edges involving them when the text genuinely shows a relation.`;

function buildUserPrompt(text: string, ctx: ExtractorContext): string {
  const speakerHint = ctx.speaker
    ? `\n[Chunk speaker: ${ctx.speaker} — treat as a person entity if relevant]`
    : "";
  const trimmed =
    text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
  return `Source type: ${ctx.sourceType}${speakerHint}\n\nChunk text:\n"""\n${trimmed}\n"""`;
}

async function readCache(hash: string): Promise<{
  entities: ExtractedEntity[];
  edges: ExtractedEdge[];
} | null> {
  try {
    const result: any = await db.execute(sql`
      SELECT result FROM entity_extraction_cache WHERE chunk_hash = ${hash} LIMIT 1
    `);
    const rows = (result.rows || result) as any[];
    if (!rows.length) return null;
    const cached = rows[0].result;
    return {
      entities: (cached?.entities || []) as ExtractedEntity[],
      edges: (cached?.edges || []) as ExtractedEdge[],
    };
  } catch {
    return null;
  }
}

async function writeCache(
  hash: string,
  payload: { entities: ExtractedEntity[]; edges: ExtractedEdge[] },
  tokens: { prompt: number; completion: number },
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO entity_extraction_cache
        (chunk_hash, result, model_used, prompt_tokens, completion_tokens)
      VALUES (
        ${hash}, ${JSON.stringify(payload)}::jsonb, ${MODEL},
        ${tokens.prompt}, ${tokens.completion}
      )
      ON CONFLICT (chunk_hash) DO NOTHING
    `);
  } catch (err: any) {
    // Cache write failure is non-fatal; we'll just re-extract next time.
    console.warn(
      "[entity-extractor] cache write failed:",
      err?.message || err,
    );
  }
}

/**
 * Extract entities + edges for one chunk. Returns `{entities:[], edges:[]}`
 * on any error so callers can call this in their happy path without try/catch.
 */
export async function extractEntitiesAndEdges(
  chunkText: string,
  ctx: ExtractorContext,
): Promise<ExtractionResult> {
  const text = (chunkText || "").trim();
  if (text.length < 40) {
    return { entities: [], edges: [], cached: false };
  }

  const hash = hashChunk(text);
  const cached = await readCache(hash);
  if (cached) {
    return { ...cached, cached: true };
  }

  const client = getOpenAI();
  if (!client) {
    return { entities: [], edges: [], cached: false };
  }

  try {
    const resp = await client.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 600,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(text, ctx) },
      ],
    });
    const raw = resp.choices?.[0]?.message?.content || "{}";
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return { entities: [], edges: [], cached: false };
    }
    const validated = RawResultSchema.safeParse(parsedJson);
    if (!validated.success) {
      return { entities: [], edges: [], cached: false };
    }
    const normalised = normaliseResult(validated.data);
    const usage = resp.usage;
    const promptTokens = usage?.prompt_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? 0;
    trackTokenUsage(
      ctx.userId || "system",
      "entity-extraction",
      MODEL,
      {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      { sourceType: ctx.sourceType, sourceId: ctx.sourceId },
    ).catch(() => {});
    await writeCache(hash, normalised, {
      prompt: promptTokens,
      completion: completionTokens,
    });
    return { ...normalised, cached: false };
  } catch (err: any) {
    console.warn(
      "[entity-extractor] OpenAI call failed:",
      err?.message || err,
    );
    return { entities: [], edges: [], cached: false };
  }
}

/**
 * Upsert one chunk's extracted entities + edges into the per-user graph.
 *
 * Atomicity: the entity + edge writes for a single chunk run inside one
 * `db.transaction(...)` so either both sides land or neither does. The
 * embedding row itself is committed before this is called — that's a
 * deliberate split (we never want extraction failure to roll back a
 * successful embed).
 *
 * Idempotency: this is the critical correctness property. The extractor
 * fires every time `persistChunks` runs for a chunk, which can happen on
 * legitimate retries. To prevent `mention_count` inflation:
 *   • Entity upsert uses `ON CONFLICT DO NOTHING RETURNING id`; on
 *     collision we SELECT the existing id. The entity row's own
 *     `mention_count` is NEVER bumped here.
 *   • Edge upsert uses `ON CONFLICT DO NOTHING RETURNING id` against the
 *     5-col natural key (user_id, src, dst, predicate, source_embedding_id).
 *     Re-runs on the same chunk return zero rows → no bump.
 *   • mention_count is incremented by +1 per side ONLY for the entities
 *     that participated in a brand-new edge.
 *
 * Returns counts for per-question telemetry.
 */
export async function persistExtractionForChunk(
  result: ExtractionResult,
  sourceEmbeddingId: number,
  userId: string,
): Promise<{ entitiesUpserted: number; edgesUpserted: number }> {
  if (!result.entities.length) {
    return { entitiesUpserted: 0, edgesUpserted: 0 };
  }

  let entitiesUpserted = 0;
  let edgesUpserted = 0;

  try {
    await db.transaction(async (tx) => {
      const idByKey = new Map<string, number>();

      // Resolve every extracted entity to its row id WITHOUT bumping
      // mention_count. Insert-or-fetch pattern.
      for (const e of result.entities) {
        const ins: any = await tx.execute(sql`
          INSERT INTO entities (user_id, kind, slug, display_name, mention_count)
          VALUES (${userId}, ${e.kind}, ${e.slug}, ${e.displayName}, 0)
          ON CONFLICT (user_id, kind, slug) DO NOTHING
          RETURNING id
        `);
        const insRows = (ins.rows || ins) as any[];
        let id: number | null = insRows?.[0]?.id ?? null;
        if (id == null) {
          const sel: any = await tx.execute(sql`
            SELECT id FROM entities
             WHERE user_id = ${userId}
               AND kind = ${e.kind}
               AND slug = ${e.slug}
             LIMIT 1
          `);
          const selRows = (sel.rows || sel) as any[];
          id = selRows?.[0]?.id ?? null;
        }
        if (id != null) {
          idByKey.set(`${e.kind}:${e.slug}`, Number(id));
          entitiesUpserted += 1;
        }
      }

      // Edges. Only entities that participate in a *newly* inserted edge
      // get their mention_count bumped — so re-runs on the same chunk
      // never inflate counts.
      const bumpIds = new Set<number>();
      for (const edge of result.edges) {
        const srcId = idByKey.get(`${edge.srcKind}:${edge.srcSlug}`);
        const dstId = idByKey.get(`${edge.dstKind}:${edge.dstSlug}`);
        if (srcId == null || dstId == null || srcId === dstId) continue;
        const ins: any = await tx.execute(sql`
          INSERT INTO entity_edges
            (user_id, src_entity_id, dst_entity_id, predicate, source_embedding_id, confidence)
          VALUES (
            ${userId}, ${srcId}, ${dstId}, ${edge.predicate},
            ${sourceEmbeddingId}, ${edge.confidence}
          )
          ON CONFLICT (user_id, src_entity_id, dst_entity_id, predicate, source_embedding_id)
            DO NOTHING
          RETURNING id
        `);
        const insRows = (ins.rows || ins) as any[];
        if (insRows?.[0]?.id != null) {
          edgesUpserted += 1;
          bumpIds.add(srcId);
          bumpIds.add(dstId);
        }
      }

      if (bumpIds.size > 0) {
        const ids = Array.from(bumpIds);
        await tx.execute(sql`
          UPDATE entities
             SET mention_count = mention_count + 1
           WHERE user_id = ${userId}
             AND id = ANY(${ids}::int[])
        `);
      }
    });
  } catch (err: any) {
    // Transaction failure: nothing was committed, so re-running on the
    // next embed pass will retry cleanly. Fail-open at the caller.
    console.warn(
      "[entity-extractor] graph persist transaction failed:",
      err?.message || err,
    );
    return { entitiesUpserted: 0, edgesUpserted: 0 };
  }

  return { entitiesUpserted, edgesUpserted };
}

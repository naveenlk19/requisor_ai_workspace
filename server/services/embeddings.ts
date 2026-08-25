// Task #92: Embedding worker.
//
// Polls each source table for rows that don't yet have any embeddings,
// chunks them through `chunking.ts`, calls Gemini gemini-embedding-001 (same
// provider as `memory-manager.ts` — we deliberately do NOT introduce a
// second embedding model, that triggers a full re-index), L2-normalises the
// vector, and writes into the unified `embeddings` table.
//
// Design notes:
//   • Idempotent. Re-running picks up only sources with zero embedding rows.
//     We never re-embed on edit (flagged as tech debt — see task notes).
//   • Per-row try/catch. One bad source can never poison the whole batch.
//   • Cost-guarded. Chunks <30 chars and >8000 chars are dropped with a
//     `skipped` row so we don't keep retrying them forever, and so admin
//     telemetry can see the skip rate.
//   • Token-tracked. Every embedding call routes through the shared
//     `trackTokenUsage` so embedding spend shows up in the same dashboard
//     as chat spend.

import { GoogleGenAI } from "@google/genai";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  conversationAttachments,
  conversations,
  embeddings as embeddingsTable,
  evidenceItems,
  featureCandidates,
  insights as insightsTable,
} from "@shared/schema";
import {
  chunkConversation,
  chunkConversationAttachment,
  chunkEvidence,
  chunkFeatureCandidate,
  chunkInsight,
  EMBED_MAX_CHARS,
  EMBED_MIN_CHARS,
  type Chunk,
} from "./chunking";
import {
  extractEntitiesAndEdges,
  persistExtractionForChunk,
} from "./entity-extractor";
import { trackTokenUsage } from "./token-tracker";
import { ObjectStorageService } from "../objectStorage";

const MODEL = "gemini-embedding-001";
const EMBEDDING_DIM = 768;
const BATCH_SIZE = 50;

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export type SourceType =
  | "evidence"
  | "conversation"
  | "conversation_attachment"
  | "feature_candidate"
  | "insight";

interface RunSummary {
  scanned: number;
  embedded: number;
  skipped: number;
  failed: number;
  byType: Record<string, { embedded: number; skipped: number; failed: number }>;
}

function emptySummary(): RunSummary {
  return { scanned: 0, embedded: 0, skipped: 0, failed: 0, byType: {} };
}

function bumpSummary(
  s: RunSummary,
  type: string,
  field: "embedded" | "skipped" | "failed",
  n = 1,
) {
  s[field] += n;
  if (!s.byType[type]) {
    s.byType[type] = { embedded: 0, skipped: 0, failed: 0 };
  }
  s.byType[type][field] += n;
}

// L2-normalise so cosine similarity (`<=>`) and dot product agree at query
// time. memory-manager.ts stores raw vectors, but for retrieval (Task #93)
// we want normalised vectors everywhere — start as we mean to go on.
function l2Normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (!norm || !isFinite(norm)) return vec;
  return vec.map((v) => v / norm);
}

// Public wrapper used by the retrieval service (Task #93) to embed an
// incoming user query with the same model + normalisation as stored chunks.
// Returns null on transient failure so the caller can degrade gracefully.
export async function embedQuery(
  text: string,
  userId = "system",
  // Task #105 — read-only callers (e.g. the RAG eval harness) pass `false`
  // so an eval run doesn't write to the user's token-usage/budget ledger.
  trackUsage = true,
): Promise<number[] | null> {
  return embedOne(text, userId, trackUsage);
}

async function embedOne(
  text: string,
  userId: string,
  trackUsage = true,
): Promise<number[] | null> {
  try {
    const result: any = await genAI.models.embedContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text }] }],
      config: { outputDimensionality: EMBEDDING_DIM },
    });
    // SDK v1.52 returns `embeddings: [{values:[…]}]`; older runtime callers
    // (memory-manager.ts) still see `embedding.values`. Accept either shape.
    const values: number[] | undefined =
      result?.embedding?.values ?? result?.embeddings?.[0]?.values;
    if (!values || values.length !== EMBEDDING_DIM) {
      console.warn(
        `[embeddings] unexpected vector length ${values?.length ?? 0} from ${MODEL}`,
      );
      return null;
    }
    // Gemini embedContent doesn't return token counts, so we approximate:
    // ~4 chars/token, billed as input tokens only (embeddings have no output).
    const approxTokens = Math.ceil(text.length / 4);
    if (trackUsage) {
      trackTokenUsage(
        userId || "system",
        "rag-embeddings",
        MODEL,
        {
          prompt_tokens: approxTokens,
          completion_tokens: 0,
          total_tokens: approxTokens,
        },
        { source: "embedding-worker" },
      ).catch(() => {});
    }
    return l2Normalize(values);
  } catch (err: any) {
    console.warn(`[embeddings] embedContent failed: ${err?.message || err}`);
    return null;
  }
}

// Completion sentinel written at chunk_index = -1 AFTER a source has been
// fully processed. The picker uses presence of this sentinel (not "any row
// exists") to decide whether a source is done, so a crash mid-loop leaves
// real chunks present (deduped by ON CONFLICT) AND no completion sentinel
// — which makes the source eligible for re-pick on the next pass.
async function writeCompletionSentinel(
  sourceType: SourceType,
  sourceId: number,
): Promise<void> {
  await db
    .insert(embeddingsTable)
    .values({
      sourceType,
      sourceId,
      chunkIndex: -1,
      content: "",
      embedding: null as any,
      metadata: { completion: true },
      status: "ok",
      errorReason: null,
    })
    .onConflictDoNothing();
}

// Task #98 — entity-graph fan-out. Looks up the just-written embedding row,
// runs the gpt-4o-mini extractor (content-addressable cache shields cost),
// and upserts per-user entities + edges. Fully fail-open.
async function runEntityExtractionForChunk(
  sourceType: SourceType,
  sourceId: number,
  chunkIndex: number,
  content: string,
  userId: string,
  speaker: string | undefined,
): Promise<void> {
  if (!userId || userId === "system") return;
  if (!process.env.OPENAI_API_KEY) return;
  try {
    const lookup: any = await db.execute(sql`
      SELECT id FROM embeddings
       WHERE source_type = ${sourceType}
         AND source_id = ${sourceId}
         AND chunk_index = ${chunkIndex}
       LIMIT 1
    `);
    const rows = (lookup.rows || lookup) as any[];
    const embeddingId = Number(rows?.[0]?.id);
    if (!Number.isFinite(embeddingId)) return;
    const extraction = await extractEntitiesAndEdges(content, {
      userId,
      sourceType,
      sourceId,
      speaker: speaker ?? null,
    });
    if (extraction.entities.length === 0) return;
    await persistExtractionForChunk(extraction, embeddingId, userId);
  } catch (err: any) {
    console.warn(
      "[embeddings] entity extraction inner error:",
      err?.message || err,
    );
  }
}

async function persistChunks(
  sourceType: SourceType,
  sourceId: number,
  chunks: Chunk[],
  summary: RunSummary,
): Promise<void> {
  if (chunks.length === 0) {
    // Empty source — write only the completion sentinel so the picker
    // doesn't keep re-scanning it.
    await writeCompletionSentinel(sourceType, sourceId);
    bumpSummary(summary, sourceType, "skipped");
    return;
  }

  // Track per-source failures. We only write the completion sentinel if
  // every chunk landed as `status='ok'` or as a permanent `skipped`
  // (too-short / too-long). Transient failures (embed API errors,
  // DB insert errors) leave the source unsentinelled so the next pass
  // re-picks it and retries the failed chunks.
  let perSourceFailures = 0;

  for (const chunk of chunks) {
    const userId = (chunk.metadata?.userId as string) || "system";
    const len = chunk.content.length;
    if (len < EMBED_MIN_CHARS || len > EMBED_MAX_CHARS) {
      // Permanent skip — content is structurally unusable. Safe to write a
      // sentinel chunk row that future retries won't try to upgrade.
      await db
        .insert(embeddingsTable)
        .values({
          sourceType,
          sourceId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content.slice(0, 500),
          embedding: null as any,
          metadata: chunk.metadata,
          status: "skipped",
          errorReason: len < EMBED_MIN_CHARS ? "too-short" : "too-long",
        })
        .onConflictDoNothing();
      bumpSummary(summary, sourceType, "skipped");
      continue;
    }

    const vec = await embedOne(chunk.content, userId);
    if (!vec) {
      // Transient — Gemini API blip. Don't overwrite an already-ok row,
      // but DO write a `failed` placeholder if nothing exists so admin
      // telemetry can see it. Crucially we still count this as a failure
      // so the completion sentinel is withheld and the next pass retries.
      await db
        .insert(embeddingsTable)
        .values({
          sourceType,
          sourceId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content.slice(0, 500),
          embedding: null as any,
          metadata: chunk.metadata,
          status: "failed",
          errorReason: "embed-call-failed",
        })
        .onConflictDoNothing();
      bumpSummary(summary, sourceType, "failed");
      perSourceFailures++;
      continue;
    }

    try {
      // Drizzle's `customType` ships the value as a JS array, but pgvector
      // wants the canonical "[v1,v2,...]" literal. Use a raw SQL insert
      // here so we control the cast precisely. ON CONFLICT DO UPDATE lets
      // a successful embedding REPLACE a previously-failed placeholder
      // for the same chunk index — important for crash/retry recovery.
      // We guard with `WHERE embeddings.status <> 'ok'` so a re-run never
      // overwrites a good vector (cheap idempotency + cost protection).
      const vecLiteral = `[${vec.join(",")}]`;
      await db.execute(sql`
        INSERT INTO embeddings (
          source_type, source_id, chunk_index, content, embedding, metadata, status, error_reason
        ) VALUES (
          ${sourceType}, ${sourceId}, ${chunk.chunkIndex}, ${chunk.content},
          ${vecLiteral}::vector, ${JSON.stringify(chunk.metadata)}::jsonb, 'ok', NULL
        )
        ON CONFLICT (source_type, source_id, chunk_index) DO UPDATE
          SET embedding = EXCLUDED.embedding,
              content = EXCLUDED.content,
              metadata = EXCLUDED.metadata,
              status = 'ok',
              error_reason = NULL
          WHERE embeddings.status <> 'ok'
      `);
      bumpSummary(summary, sourceType, "embedded");
      // Task #98 — entity-graph fan-out. Fire AFTER the embedding row is
      // committed so the FK target exists. Fail-open: extraction errors
      // never bubble up and never withhold the completion sentinel.
      void runEntityExtractionForChunk(
        sourceType,
        sourceId,
        chunk.chunkIndex,
        chunk.content,
        userId,
        chunk.metadata?.speaker as string | undefined,
      ).catch((err) =>
        console.warn(
          `[embeddings] entity extraction fan-out failed for ${sourceType}#${sourceId}@${chunk.chunkIndex}:`,
          err?.message || err,
        ),
      );
    } catch (err: any) {
      console.warn(
        `[embeddings] insert failed for ${sourceType}#${sourceId}@${chunk.chunkIndex}:`,
        err?.message || err,
      );
      bumpSummary(summary, sourceType, "failed");
      perSourceFailures++;
    }
  }

  // Only sentinel the source as "done" when every chunk reached a terminal
  // state (ok or permanently-skipped). Transient failures leave the source
  // unsentinelled so the picker re-selects it and the upsert above replaces
  // the failed placeholders with real vectors on the next pass.
  if (perSourceFailures === 0) {
    await writeCompletionSentinel(sourceType, sourceId);
  }
}

// ---------------------------------------------------------------------------
// Per-source pickers. Each returns up to `limit` source IDs that don't yet
// have a completion sentinel (`chunk_index = -1`) in `embeddings`. Sources
// with partial chunks but no sentinel — i.e. a previous run crashed mid-way
// — are eligible for re-pick. ON CONFLICT DO NOTHING on the unique index
// guarantees we never duplicate already-embedded chunks during recovery.
// ---------------------------------------------------------------------------

async function pickUnembedded(
  sourceType: SourceType,
  tableName: string,
  limit: number,
): Promise<number[]> {
  const result = await db.execute(sql`
    SELECT s.id FROM ${sql.raw(tableName)} s
    WHERE NOT EXISTS (
      SELECT 1 FROM embeddings e
      WHERE e.source_type = ${sourceType}
        AND e.source_id = s.id
        AND e.chunk_index = -1
    )
    ORDER BY s.id DESC
    LIMIT ${limit}
  `);
  const rows = (result as any).rows || result;
  return (rows as any[]).map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
}

async function processEvidence(limit: number, summary: RunSummary) {
  const ids = await pickUnembedded("evidence", "evidence_items", limit);
  summary.scanned += ids.length;
  for (const id of ids) {
    try {
      const [row] = await db
        .select()
        .from(evidenceItems)
        .where(sql`${evidenceItems.id} = ${id}`);
      if (!row) continue;
      await persistChunks("evidence", id, chunkEvidence(row), summary);
    } catch (err: any) {
      console.warn(`[embeddings] evidence#${id} failed:`, err?.message || err);
      bumpSummary(summary, "evidence", "failed");
    }
  }
}

async function processConversations(limit: number, summary: RunSummary) {
  const ids = await pickUnembedded("conversation", "conversations", limit);
  summary.scanned += ids.length;
  for (const id of ids) {
    try {
      const [row] = await db
        .select()
        .from(conversations)
        .where(sql`${conversations.id} = ${id}`);
      if (!row) continue;
      await persistChunks("conversation", id, chunkConversation(row), summary);
    } catch (err: any) {
      console.warn(`[embeddings] conversation#${id} failed:`, err?.message || err);
      bumpSummary(summary, "conversation", "failed");
    }
  }
}

async function processFeatureCandidates(limit: number, summary: RunSummary) {
  const ids = await pickUnembedded(
    "feature_candidate",
    "feature_candidates",
    limit,
  );
  summary.scanned += ids.length;
  for (const id of ids) {
    try {
      const [row] = await db
        .select()
        .from(featureCandidates)
        .where(sql`${featureCandidates.id} = ${id}`);
      if (!row) continue;
      await persistChunks(
        "feature_candidate",
        id,
        chunkFeatureCandidate(row),
        summary,
      );
    } catch (err: any) {
      console.warn(
        `[embeddings] feature_candidate#${id} failed:`,
        err?.message || err,
      );
      bumpSummary(summary, "feature_candidate", "failed");
    }
  }
}

// Best-effort text extractor for Gmail / chat attachments stored in the
// private object-storage bucket. We only attempt text-like and lightweight
// document formats inline; everything else gets a `skipped` sentinel so we
// don't repeatedly try to embed binary blobs. Heavy formats (xlsx, pptx)
// are deferred to a follow-up to keep this change reviewable.
// Returns:
//   { kind: "text", text }       — content successfully extracted
//   { kind: "unsupported" }      — binary type we deliberately skip (permanent)
//   { kind: "empty" }            — extractor ran but produced no text (permanent)
// Throws on transient errors (object-storage outage, parser crash) so the
// caller can withhold the completion sentinel and retry on the next pass.
type AttachmentExtract =
  | { kind: "text"; text: string }
  | { kind: "unsupported" }
  | { kind: "empty" };

async function extractAttachmentText(
  objectPath: string,
  mimeType: string,
  filename: string,
): Promise<AttachmentExtract> {
  const lower = filename.toLowerCase();
  const isText =
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    /\.(txt|md|markdown|csv|tsv|log|json|xml|yaml|yml|html?|rtf|srt|vtt)$/.test(lower);
  const isPdf = mimeType === "application/pdf" || lower.endsWith(".pdf");
  const isDocx =
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx");
  const isXlsx =
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls");
  const isPptx =
    mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    lower.endsWith(".pptx");
  if (!isText && !isPdf && !isDocx && !isXlsx && !isPptx) {
    return { kind: "unsupported" };
  }

  // Anything below this point is a transient failure if it throws — the
  // outer pickUnembedded loop will surface that to the caller, which keeps
  // the source unsentinelled so the next pass retries.
  const objectStorage = new ObjectStorageService();
  const file = await objectStorage.getMediaFile(objectPath);
  const [buf] = await file.download();

  let text: string | null = null;
  if (isText) {
    text = buf.toString("utf-8");
    // Strip HTML tags so we embed prose, not markup noise.
    if (/\.(html?)$/.test(lower) || mimeType === "text/html") {
      text = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
  } else if (isPdf) {
    const pdfParse = (await import("pdf-parse-new")).default as any;
    const parsed = await pdfParse(buf);
    text = parsed?.text || null;
  } else if (isDocx) {
    const mammoth = await import("mammoth");
    const parsed = await mammoth.extractRawText({ buffer: buf });
    text = parsed?.value || null;
  } else if (isXlsx) {
    const XLSX = (await import("xlsx")).default as any;
    const wb = XLSX.read(buf, { type: "buffer" });
    const parts: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
      if (csv?.trim()) parts.push(`# Sheet: ${sheetName}\n${csv}`);
    }
    text = parts.join("\n\n") || null;
  } else if (isPptx) {
    try {
      // @ts-expect-error — pptx2json ships no type declarations
      const pptx2json = (await import("pptx2json")).default as any;
      const parsed = await pptx2json(buf);
      const slides = Array.isArray(parsed?.slides) ? parsed.slides : [];
      const parts: string[] = [];
      for (let i = 0; i < slides.length; i++) {
        const s = slides[i];
        const slideText = (s?.text || s?.content || "").toString().trim();
        if (slideText) parts.push(`# Slide ${i + 1}\n${slideText}`);
      }
      text = parts.join("\n\n") || null;
    } catch {
      // pptx2json is fragile on some decks — treat as empty rather than throw
      // so we don't infinitely retry. Loses these slides; acceptable v1.
      text = null;
    }
  }
  if (!text || !text.trim()) return { kind: "empty" };
  return { kind: "text", text };
}

async function processConversationAttachments(limit: number, summary: RunSummary) {
  const ids = await pickUnembedded(
    "conversation_attachment",
    "conversation_attachments",
    limit,
  );
  summary.scanned += ids.length;
  for (const id of ids) {
    try {
      const [row] = await db
        .select()
        .from(conversationAttachments)
        .where(sql`${conversationAttachments.id} = ${id}`);
      if (!row) continue;
      if (!row.objectPath) {
        // File exceeded the object-storage cap — metadata-only. Permanent
        // skip is fine.
        await persistChunks("conversation_attachment", id, [], summary);
        continue;
      }
      let extracted: AttachmentExtract;
      try {
        extracted = await extractAttachmentText(
          row.objectPath,
          row.mimeType,
          row.filename,
        );
      } catch (extractErr: any) {
        // Transient — object-storage outage or parser crash. Bump failure
        // count WITHOUT writing the completion sentinel so the next pass
        // retries this attachment.
        console.warn(
          `[embeddings] attachment#${id} transient extract error:`,
          extractErr?.message || extractErr,
        );
        bumpSummary(summary, "conversation_attachment", "failed");
        continue;
      }
      if (extracted.kind !== "text") {
        // Unsupported binary OR successfully extracted but empty —
        // permanent skip via empty-chunks sentinel path.
        await persistChunks("conversation_attachment", id, [], summary);
        continue;
      }
      const [parent] = await db
        .select()
        .from(conversations)
        .where(sql`${conversations.id} = ${row.conversationId}`);
      const chunks = chunkConversationAttachment(
        {
          id: row.id,
          conversationId: row.conversationId,
          filename: row.filename,
          mimeType: row.mimeType,
        },
        extracted.text,
        {
          userId: parent?.userId ?? "system",
          projectId: parent?.projectId ?? null,
        },
      );
      await persistChunks("conversation_attachment", id, chunks, summary);
    } catch (err: any) {
      console.warn(
        `[embeddings] conversation_attachment#${id} failed:`,
        err?.message || err,
      );
      bumpSummary(summary, "conversation_attachment", "failed");
    }
  }
}

async function processInsights(limit: number, summary: RunSummary) {
  const ids = await pickUnembedded("insight", "insights", limit);
  summary.scanned += ids.length;
  for (const id of ids) {
    try {
      const [row] = await db
        .select()
        .from(insightsTable)
        .where(sql`${insightsTable.id} = ${id}`);
      if (!row) continue;
      await persistChunks("insight", id, chunkInsight(row as any), summary);
    } catch (err: any) {
      console.warn(`[embeddings] insight#${id} failed:`, err?.message || err);
      bumpSummary(summary, "insight", "failed");
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Task #92: backfill legacy conversations.attachments JSON entries into
// conversation_attachments rows so the embedding pipeline covers files that
// pre-date the dedicated table. Uses INSERT ... SELECT with a NOT EXISTS
// guard so re-running is a no-op once everything is materialized.
async function migrateLegacyJsonAttachments(): Promise<void> {
  try {
    const result: any = await db.execute(sql`
      INSERT INTO conversation_attachments
        (conversation_id, filename, mime_type, size, object_path, created_at)
      SELECT
        c.id,
        COALESCE(att->>'filename', 'attachment'),
        COALESCE(att->>'mimeType', 'application/octet-stream'),
        COALESCE((att->>'size')::int, 0),
        att->>'objectPath',
        NOW()
      FROM conversations c, jsonb_array_elements(COALESCE(c.attachments, '[]'::jsonb)) AS att
      WHERE jsonb_typeof(c.attachments) = 'array'
        AND jsonb_array_length(c.attachments) > 0
        AND NOT EXISTS (
          SELECT 1 FROM conversation_attachments ca
          WHERE ca.conversation_id = c.id
            AND ca.filename = COALESCE(att->>'filename', 'attachment')
            AND COALESCE(ca.object_path, '') = COALESCE(att->>'objectPath', '')
        )
    `);
    const rowCount = result?.rowCount ?? result?.rows?.length ?? 0;
    if (rowCount > 0) {
      console.log(
        `[embeddings] migrated ${rowCount} legacy conversations.attachments JSON entries into conversation_attachments`,
      );
    }
  } catch (err: any) {
    console.warn(
      "[embeddings] legacy attachment migration failed:",
      err?.message || err,
    );
  }
}

let running = false;

/**
 * Run a single embedding pass across all source types. Safe to call
 * concurrently — overlapping calls early-return.
 */
export async function runEmbeddingPass(
  perSourceLimit = BATCH_SIZE,
): Promise<RunSummary> {
  const summary = emptySummary();
  if (running) return summary;
  running = true;
  try {
    if (!process.env.GEMINI_API_KEY) {
      // No key = silent no-op. We don't want to spam logs every 15s on a
      // dev box with no Gemini credentials.
      return summary;
    }
    // Task #92: legacy attachments live as JSON inside conversations.attachments
    // (kept for backwards-compat with older Gmail imports). Materialize any
    // that don't yet exist as conversation_attachments rows so the unified
    // pipeline below picks them up. Deduped on (conversationId, filename,
    // objectPath) so this is safe to run every pass.
    await migrateLegacyJsonAttachments();
    await processEvidence(perSourceLimit, summary);
    await processConversations(perSourceLimit, summary);
    await processConversationAttachments(perSourceLimit, summary);
    await processFeatureCandidates(perSourceLimit, summary);
    await processInsights(perSourceLimit, summary);
    if (summary.scanned > 0) {
      console.log(
        `[embeddings] pass complete — scanned=${summary.scanned} ` +
          `embedded=${summary.embedded} skipped=${summary.skipped} failed=${summary.failed}`,
      );
    }
  } finally {
    running = false;
  }
  return summary;
}

/**
 * Backfill loop. Keeps calling `runEmbeddingPass` until a pass produces no
 * work, so a one-shot `npx tsx scripts/backfill-embeddings.ts` will fully
 * catch up the database before exiting.
 */
export async function backfillAllEmbeddings(): Promise<RunSummary> {
  const total = emptySummary();
  for (let i = 0; i < 200; i++) {
    const pass = await runEmbeddingPass(BATCH_SIZE);
    total.scanned += pass.scanned;
    total.embedded += pass.embedded;
    total.skipped += pass.skipped;
    total.failed += pass.failed;
    for (const [t, counts] of Object.entries(pass.byType)) {
      if (!total.byType[t]) total.byType[t] = { embedded: 0, skipped: 0, failed: 0 };
      total.byType[t].embedded += counts.embedded;
      total.byType[t].skipped += counts.skipped;
      total.byType[t].failed += counts.failed;
    }
    if (pass.scanned === 0) break;
  }
  console.log(
    `[embeddings] backfill complete — embedded=${total.embedded} skipped=${total.skipped} failed=${total.failed} byType=${JSON.stringify(total.byType)}`,
  );
  return total;
}

let pollTimer: NodeJS.Timeout | null = null;
let nudgeTimer: NodeJS.Timeout | null = null;

/**
 * Start the background polling worker. Called once from server bootstrap.
 * Returns the timer handle so tests can stop it.
 */
export function startEmbeddingWorker(intervalMs = 30_000): void {
  if (pollTimer) return;
  // Kick off an immediate pass on boot so existing data starts embedding
  // without waiting for the first interval tick.
  setImmediate(() => {
    runEmbeddingPass().catch((err) =>
      console.warn("[embeddings] initial pass error:", err?.message || err),
    );
  });
  pollTimer = setInterval(() => {
    runEmbeddingPass().catch((err) =>
      console.warn("[embeddings] scheduled pass error:", err?.message || err),
    );
  }, intervalMs);
}

/**
 * Fire-and-forget hook called from insert paths (POST /api/evidence, Gmail
 * import, etc.). Coalesces rapid bursts into a single pass ~2s later so we
 * don't fire one embed run per row in a 50-row Gmail import.
 */
export function triggerEmbeddingRun(): void {
  if (nudgeTimer) return;
  nudgeTimer = setTimeout(() => {
    nudgeTimer = null;
    runEmbeddingPass().catch((err) =>
      console.warn("[embeddings] nudge pass error:", err?.message || err),
    );
  }, 2000);
}

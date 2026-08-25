// Task #98 — backfill entity graph from already-embedded chunks.
//
// Usage: `npx tsx scripts/backfill-entity-graph.ts [--limit N]`
//
// For every existing `embeddings` row with `status='ok'` and `chunk_index>=0`
// that doesn't yet have any rows in `entity_edges`, run the extractor and
// upsert entities + edges. The content-addressable cache means re-runs on
// the same corpus cost ~$0 (cache hits) — only newly-introduced chunks
// actually call OpenAI.
//
// Intended for one-time catch-up of historical data after the entity-graph
// feature lands. The live worker handles all new ingest going forward.

import { sql } from "drizzle-orm";
import { db } from "../server/db";
import {
  extractEntitiesAndEdges,
  persistExtractionForChunk,
} from "../server/services/entity-extractor";

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 5000;

  console.log(`[backfill-entity-graph] starting (limit=${limit})…`);

  const result: any = await db.execute(sql`
    SELECT e.id, e.source_type, e.source_id, e.chunk_index, e.content,
           e.metadata
      FROM embeddings e
     WHERE e.status = 'ok'
       AND e.chunk_index >= 0
       AND e.metadata->>'userId' IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM entity_edges ee WHERE ee.source_embedding_id = e.id
       )
     ORDER BY e.id DESC
     LIMIT ${limit}
  `);
  const rows = (result.rows || result) as any[];
  console.log(`[backfill-entity-graph] ${rows.length} chunks to process`);

  let processed = 0;
  let totalEntities = 0;
  let totalEdges = 0;
  let cached = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const userId = String(row.metadata?.userId || "");
      if (!userId) continue;
      const extraction = await extractEntitiesAndEdges(String(row.content), {
        userId,
        sourceType: String(row.source_type),
        sourceId: Number(row.source_id),
        speaker: row.metadata?.speaker ?? null,
      });
      if (extraction.cached) cached += 1;
      if (extraction.entities.length === 0) {
        processed += 1;
        continue;
      }
      const { entitiesUpserted, edgesUpserted } =
        await persistExtractionForChunk(extraction, Number(row.id), userId);
      totalEntities += entitiesUpserted;
      totalEdges += edgesUpserted;
      processed += 1;
      if (processed % 25 === 0) {
        console.log(
          `[backfill-entity-graph] processed=${processed}/${rows.length} ` +
            `entities=${totalEntities} edges=${totalEdges} cached=${cached}`,
        );
      }
    } catch (err: any) {
      errors += 1;
      console.warn(
        `[backfill-entity-graph] row ${row.id} failed:`,
        err?.message || err,
      );
    }
  }

  console.log(
    `[backfill-entity-graph] DONE — processed=${processed} entities=${totalEntities} ` +
      `edges=${totalEdges} cached=${cached} errors=${errors}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill-entity-graph] fatal:", err);
  process.exit(1);
});

// Task #92: One-shot backfill for the RAG embedding table.
//
// Usage:
//   npx tsx scripts/backfill-embeddings.ts
//
// Walks every source table (evidence_items, conversations, feature_candidates,
// insights), chunks any row that doesn't yet have embeddings, and writes
// vectors via the same worker the server uses. Exits with a summary line.

import { backfillAllEmbeddings } from "../server/services/embeddings";
import { setupDatabase } from "../server/db-setup";

async function main() {
  console.log("[backfill] ensuring schema is up to date…");
  await setupDatabase();
  console.log("[backfill] starting full embedding pass…");
  const summary = await backfillAllEmbeddings();
  console.log("[backfill] DONE", JSON.stringify(summary, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] failed:", err);
  process.exit(1);
});

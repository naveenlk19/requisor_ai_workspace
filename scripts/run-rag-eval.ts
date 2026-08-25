// Task #105 — RAG eval harness CLI.
//
// Runs the curated eval set against the REAL retrieval pipeline for a given
// user, computes recall@K / faithfulness / grounding / fallback metrics,
// writes a run row to `rag_eval_runs`, and prints a one-screen summary.
//
// Read-only with respect to user data — it queries retrieval and (unless
// --no-answers) makes one throwaway answer-generation call per case for the
// faithfulness metric. Safe to re-run.
//
// Usage:
//   tsx scripts/run-rag-eval.ts <userId>
//   tsx scripts/run-rag-eval.ts <userId> --no-answers     # skip faithfulness LLM calls
//   tsx scripts/run-rag-eval.ts <userId> --k 12           # top-K override
//   tsx scripts/run-rag-eval.ts <userId> --json           # also print raw JSON
//   tsx scripts/run-rag-eval.ts <userId> --no-persist     # don't write a run row

import { runRagEval, formatRunSummary } from "../server/services/rag-eval";

async function main() {
  const args = process.argv.slice(2);
  const userId = args.find((a) => !a.startsWith("--"));
  if (!userId) {
    console.error(
      "Usage: tsx scripts/run-rag-eval.ts <userId> [--no-answers] [--k N] [--json] [--no-persist]",
    );
    process.exit(1);
  }

  const kFlag = args.indexOf("--k");
  let k: number | undefined;
  if (kFlag !== -1 && args[kFlag + 1]) {
    const kNum = Number(args[kFlag + 1]);
    if (!Number.isFinite(kNum) || kNum < 1 || kNum > 20) {
      console.error("--k must be an integer between 1 and 20");
      process.exit(1);
    }
    k = Math.trunc(kNum);
  }
  const generateAnswers = !args.includes("--no-answers");
  const persist = !args.includes("--no-persist");
  const asJson = args.includes("--json");

  console.log(
    `[run-rag-eval] user=${userId} answers=${generateAnswers ? "on" : "off"} ` +
      `persist=${persist ? "on" : "off"}${k ? ` k=${k}` : ""}`,
  );

  const summary = await runRagEval(userId, { k, generateAnswers, persist });
  console.log(formatRunSummary(summary));
  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[run-rag-eval] fatal:", err);
  process.exit(1);
});

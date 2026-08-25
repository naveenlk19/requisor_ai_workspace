// Task #105 — RAG eval harness.
//
// A repeatable, READ-ONLY harness that runs a curated eval set of questions
// against the REAL retrieval pipeline (`retrieveContext`) and measures it on
// four metric families so two runs can be compared over time:
//
//   recall@K            — did the expected signal (keyword and/or source type)
//                         make it into the top-K retrieved chunks?
//   faithfulness        — when we generate a grounded answer with citations and
//                         run the real faithfulness verifier, what fraction of
//                         emitted citations survive (aren't stripped)?
//   grounding rate      — did the entity-graph / belief layers contribute
//                         chunks (neighborsAdded / beliefsAdded > 0)?
//   fallback rate       — how often did retrieval fall back (reranker key
//                         missing, embed failure, etc.)?
//
// The harness reuses the exact helpers the chat routes use
// (`retrieveContext`, `formatRetrievedContext`, `buildCitationInstructions`,
// `parseAndValidateCitations`, `verifyCitations`) so it measures the real path,
// not a reimplementation. It NEVER mutates user data — it only reads retrieval
// and (optionally) makes a single throwaway answer-generation call per case.
//
// Fail-open everywhere: a per-case error is recorded on the case and the run
// continues; a missing OPENAI_API_KEY simply disables the faithfulness metric.

import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  retrieveContext,
  formatRetrievedContext,
  type RetrievedChunk,
} from "./retrieval";
import { buildCitationInstructions, parseAndValidateCitations } from "./citations";
import { verifyCitations, getFaithfulnessMode } from "./citation-faithfulness";

// ---------------------------------------------------------------------------
// Eval-case format
// ---------------------------------------------------------------------------

export interface EvalExpect {
  /** ≥1 of these (case-insensitive) must appear in some retrieved chunk text. */
  keywordsAny?: string[];
  /** ≥1 retrieved chunk must carry one of these source types. */
  sourceTypes?: string[];
  /** Case expects entity-graph grounding (neighborsAdded>0 OR entities>0). */
  requireEntityGrounding?: boolean;
  /** Case expects belief grounding (beliefsAdded>0). */
  requireBeliefGrounding?: boolean;
}

export interface EvalCase {
  /** Stable id, e.g. "EG-Q1" / "BC-Q1" / "REL-1". */
  id: string;
  question: string;
  /** Optional retrieval scope narrowing (userId is injected at run time). */
  scope?: { projectId?: number | null; conversationId?: number | null };
  filters?: { sourceTypes?: string[]; speaker?: string | null };
  expect: EvalExpect;
  /** Human note describing why the lexical retriever struggles here. */
  notes?: string;
}

export interface EvalCaseResult {
  id: string;
  question: string;
  chunkCount: number;
  topSourceTypes: string[];
  fallbackUsed: boolean;
  fallbackReason?: string;
  neighborsAdded: number;
  beliefsAdded: number;
  entitiesInContext: number;
  retrievalMs: number;
  // Expectation checks (null = not asserted for this case).
  keywordHit: boolean | null;
  sourceTypeHit: boolean | null;
  entityGroundingMet: boolean | null;
  beliefGroundingMet: boolean | null;
  /** True when every asserted expectation for this case was met. */
  pass: boolean;
  /** True when keyword/source (recall@K) expectations were met. */
  recallPass: boolean;
  // Faithfulness (null when answer generation disabled/skipped).
  citationsEmitted: number | null;
  citationsStripped: number | null;
  faithfulnessPass: boolean | null;
  error?: string;
}

export interface EvalRunSummary {
  runId?: number;
  userId: string;
  caseCount: number;
  passCount: number;
  recallAtK: number;
  faithfulnessPassRate: number | null;
  groundingRate: number;
  fallbackRate: number;
  config: {
    k: number;
    rerankerKeyPresent: boolean;
    faithfulnessMode: string;
    openaiKeyPresent: boolean;
    generateAnswers: boolean;
    answerModel: string;
  };
  results: EvalCaseResult[];
}

// ---------------------------------------------------------------------------
// Seed eval set
// ---------------------------------------------------------------------------
// Seeded from docs/entity-graph-eval-questions.md (5 relational questions the
// lexical retriever cannot answer) and docs/belief-consolidation-eval.md (the
// same 5 questions, re-asserted against belief grounding). These are curated
// from real, known content — not synthetic.

export const EVAL_SET: EvalCase[] = [
  // --- Entity-graph relational questions (Task #98) ---
  {
    id: "EG-Q1",
    question: "Who is working on the Landing AI pilot?",
    expect: {
      keywordsAny: ["landing ai", "pilot"],
      requireEntityGrounding: true,
    },
    notes:
      "People who work on the pilot are rarely co-mentioned with its name; they surface as meeting speakers via entity edges.",
  },
  {
    id: "EG-Q2",
    question: "What is blocking the Discord integration from shipping?",
    expect: {
      keywordsAny: ["discord", "block", "blocker"],
      requireEntityGrounding: true,
    },
    notes: "The blocker rarely co-occurs in the same chunk; the blocks edge is the signal.",
  },
  {
    id: "EG-Q3",
    question: "Who decided we'd use AssemblyAI over Whisper for long files?",
    expect: {
      keywordsAny: ["assemblyai", "whisper"],
      requireEntityGrounding: true,
    },
    notes: "Many chunks mention both tools; the decided edge isolates the deciding moment.",
  },
  {
    id: "EG-Q4",
    question: "What did Naveen say about pricing in the last month?",
    expect: {
      keywordsAny: ["pricing", "price", "naveen"],
    },
    notes: "Cross-meeting rollup of one person's stance on one topic.",
  },
  {
    id: "EG-Q5",
    question: "Which customers keep asking for SSO?",
    expect: {
      keywordsAny: ["sso", "single sign-on", "single sign on"],
      requireEntityGrounding: true,
    },
    notes: "Aggregating which companies across how many threads requires entity rollup.",
  },
  // --- Belief-grounded variants (Task #99) ---
  // Same intents, re-asserted to expect a consolidated belief chunk. The
  // belief layer is gated on ≥3 distinct source chunks per (subject,
  // predicate); on sparse corpora these legitimately fail (documented).
  {
    id: "BC-Q1",
    question: "What does the team keep coming back to about Stripe?",
    expect: {
      keywordsAny: ["stripe", "webhook", "latency", "payment"],
      requireBeliefGrounding: true,
    },
    notes: "Repeated Stripe concern should consolidate into one belief chip.",
  },
  {
    id: "BC-Q2",
    question: "What recurring risks has the team flagged about shipping?",
    expect: {
      keywordsAny: ["risk", "ship", "deadline", "delay"],
      requireBeliefGrounding: true,
    },
    notes: "Recurring risk mentions should roll up into a durable belief.",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chunkTextHaystack(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c) => `${c.text || ""}`)
    .join("\n")
    .toLowerCase();
}

function keywordHit(chunks: RetrievedChunk[], keywords?: string[]): boolean {
  if (!keywords || keywords.length === 0) return false;
  const hay = chunkTextHaystack(chunks);
  return keywords.some((kw) => hay.includes(kw.toLowerCase()));
}

function sourceTypeHit(chunks: RetrievedChunk[], types?: string[]): boolean {
  if (!types || types.length === 0) return false;
  const present = new Set(chunks.map((c) => String(c.sourceType)));
  return types.some((t) => present.has(t));
}

// Single throwaway grounded-answer generation so we can exercise the real
// faithfulness verifier. Fail-open: returns null on any error / missing key.
async function generateGroundedAnswer(
  question: string,
  chunks: RetrievedChunk[],
  model: string,
): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY || chunks.length === 0) return null;
  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const contextBlock = formatRetrievedContext(chunks);
    const citationInstructions = buildCitationInstructions(chunks);
    const system =
      "You answer strictly from the provided [Retrieved Context]. If the context " +
      "does not contain the answer, say so plainly. Keep the answer to a few " +
      "sentences." +
      citationInstructions;
    const resp = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `${contextBlock}\n\nQUESTION: ${question}`,
        },
      ],
      temperature: 0,
      max_tokens: 350,
    });
    return resp.choices[0]?.message?.content || null;
  } catch (e: any) {
    console.warn(
      "[rag-eval] answer generation failed (faithfulness skipped):",
      e?.message || e,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

export interface RunRagEvalOpts {
  k?: number;
  /** Generate answers + run the faithfulness verifier (default true). */
  generateAnswers?: boolean;
  answerModel?: string;
  /** Persist a row to rag_eval_runs (default true). */
  persist?: boolean;
  /** Override the eval set (defaults to EVAL_SET). */
  cases?: EvalCase[];
}

async function runSingleCase(
  c: EvalCase,
  userId: string,
  k: number,
  generateAnswers: boolean,
  answerModel: string,
): Promise<EvalCaseResult> {
  try {
    const r = await retrieveContext({
      query: c.question,
      scope: {
        userId,
        projectId: c.scope?.projectId ?? null,
        conversationId: c.scope?.conversationId ?? null,
      },
      filters: c.filters,
      k,
      // Read-only: never write to the user's token-usage/budget ledger.
      readOnly: true,
    });

    const chunks = r.chunks || [];
    const neighborsAdded = r.neighborsAdded ?? 0;
    const beliefsAdded = r.beliefsAdded ?? 0;
    const entitiesInContext = r.entitiesInContext ?? 0;

    // Expectation checks (null when not asserted).
    const kHit = c.expect.keywordsAny
      ? keywordHit(chunks, c.expect.keywordsAny)
      : null;
    const stHit = c.expect.sourceTypes
      ? sourceTypeHit(chunks, c.expect.sourceTypes)
      : null;
    // Entity grounding must reflect ACTUAL graph contribution: the 1-hop
    // neighbor expansion added retrieval signal. `entitiesInContext > 0` only
    // means entities were present in already-retrieved chunks — it does NOT
    // prove the graph mechanism contributed, so it would let an EG case pass
    // even if neighbor expansion regressed. Gate strictly on neighborsAdded.
    const entityMet = c.expect.requireEntityGrounding
      ? neighborsAdded > 0
      : null;
    const beliefMet = c.expect.requireBeliefGrounding
      ? beliefsAdded > 0
      : null;

    // recall@K = keyword/source expectations met (the "did the expected
    // source make top-K" question). When neither is asserted, default true.
    const recallPass = (kHit ?? true) && (stHit ?? true);
    // Overall case pass = every asserted expectation met.
    const pass =
      (kHit ?? true) &&
      (stHit ?? true) &&
      (entityMet ?? true) &&
      (beliefMet ?? true);

    // Faithfulness: generate a grounded answer, parse citations, verify.
    let citationsEmitted: number | null = null;
    let citationsStripped: number | null = null;
    let faithfulnessPass: boolean | null = null;
    if (generateAnswers) {
      const answer = await generateGroundedAnswer(
        c.question,
        chunks,
        answerModel,
      );
      if (answer != null) {
        const parsed = parseAndValidateCitations(answer, chunks);
        const v = await verifyCitations(parsed, chunks);
        citationsEmitted = parsed.emittedCount;
        citationsStripped = v.stripNs.size;
        // Pass when there are citations and none were stripped. A bare answer
        // (no citations) is recorded as null (not measurable), not a fail.
        faithfulnessPass =
          parsed.emittedCount > 0 ? v.stripNs.size === 0 : null;
      }
    }

    return {
      id: c.id,
      question: c.question,
      chunkCount: chunks.length,
      topSourceTypes: Array.from(
        new Set(chunks.slice(0, 5).map((x) => String(x.sourceType))),
      ),
      fallbackUsed: r.fallbackUsed,
      fallbackReason: r.fallbackReason,
      neighborsAdded,
      beliefsAdded,
      entitiesInContext,
      retrievalMs: r.retrievalMs,
      keywordHit: kHit,
      sourceTypeHit: stHit,
      entityGroundingMet: entityMet,
      beliefGroundingMet: beliefMet,
      pass,
      recallPass,
      citationsEmitted,
      citationsStripped,
      faithfulnessPass,
    };
  } catch (err: any) {
    return {
      id: c.id,
      question: c.question,
      chunkCount: 0,
      topSourceTypes: [],
      fallbackUsed: true,
      neighborsAdded: 0,
      beliefsAdded: 0,
      entitiesInContext: 0,
      retrievalMs: 0,
      keywordHit: c.expect.keywordsAny ? false : null,
      sourceTypeHit: c.expect.sourceTypes ? false : null,
      entityGroundingMet: c.expect.requireEntityGrounding ? false : null,
      beliefGroundingMet: c.expect.requireBeliefGrounding ? false : null,
      pass: false,
      recallPass: false,
      citationsEmitted: null,
      citationsStripped: null,
      faithfulnessPass: null,
      error: err?.message || String(err),
    };
  }
}

export async function runRagEval(
  userId: string,
  opts: RunRagEvalOpts = {},
): Promise<EvalRunSummary> {
  const kRaw = opts.k ?? 8;
  const k = Number.isFinite(kRaw)
    ? Math.max(1, Math.min(20, Math.trunc(kRaw)))
    : 8;
  const generateAnswers = opts.generateAnswers !== false;
  const answerModel =
    opts.answerModel || process.env.RAG_EVAL_ANSWER_MODEL || "gpt-4o-mini";
  const persist = opts.persist !== false;
  const cases = opts.cases ?? EVAL_SET;

  const results: EvalCaseResult[] = [];
  for (const c of cases) {
    // Sequential on purpose: keeps reranker/LLM rate-limits sane and makes
    // the per-case log readable.
    results.push(
      await runSingleCase(c, userId, k, generateAnswers, answerModel),
    );
  }

  const caseCount = results.length;
  const passCount = results.filter((r) => r.pass).length;
  const recallAtK =
    caseCount > 0
      ? results.filter((r) => r.recallPass).length / caseCount
      : 0;
  const groundingRate =
    caseCount > 0
      ? results.filter((r) => r.neighborsAdded > 0 || r.beliefsAdded > 0)
          .length / caseCount
      : 0;
  const fallbackRate =
    caseCount > 0
      ? results.filter((r) => r.fallbackUsed).length / caseCount
      : 0;

  // Faithfulness pass rate = measurable cases that passed / measurable cases.
  const measurable = results.filter((r) => r.faithfulnessPass !== null);
  const faithfulnessPassRate =
    measurable.length > 0
      ? measurable.filter((r) => r.faithfulnessPass).length / measurable.length
      : null;

  const config = {
    k,
    rerankerKeyPresent: !!process.env.COHERE_API_KEY,
    faithfulnessMode: getFaithfulnessMode(),
    openaiKeyPresent: !!process.env.OPENAI_API_KEY,
    generateAnswers,
    answerModel,
  };

  const summary: EvalRunSummary = {
    userId,
    caseCount,
    passCount,
    recallAtK,
    faithfulnessPassRate,
    groundingRate,
    fallbackRate,
    config,
    results,
  };

  if (persist) {
    try {
      const inserted: any = await db.execute(sql`
        INSERT INTO rag_eval_runs
          (user_id, config, case_count, pass_count, recall_at_k,
           faithfulness_pass_rate, grounding_rate, fallback_rate, results)
        VALUES
          (${userId}, ${JSON.stringify(config)}::jsonb, ${caseCount},
           ${passCount}, ${recallAtK},
           ${faithfulnessPassRate}, ${groundingRate}, ${fallbackRate},
           ${JSON.stringify(results)}::jsonb)
        RETURNING id
      `);
      summary.runId = (inserted.rows || inserted)?.[0]?.id;
    } catch (err: any) {
      console.warn(
        "[rag-eval] failed to persist run (continuing):",
        err?.message || err,
      );
    }
  }

  return summary;
}

// Pretty one-screen summary for CLI / logs.
export function formatRunSummary(s: EvalRunSummary): string {
  const pct = (n: number | null) =>
    n == null ? "n/a" : `${(n * 100).toFixed(0)}%`;
  const lines: string[] = [];
  lines.push("");
  lines.push("================ RAG EVAL RUN ================");
  if (s.runId != null) lines.push(`run id:        ${s.runId}`);
  lines.push(`user:          ${s.userId}`);
  lines.push(
    `config:        k=${s.config.k} reranker=${s.config.rerankerKeyPresent ? "on" : "off"} ` +
      `faithfulness=${s.config.faithfulnessMode} answers=${s.config.generateAnswers ? "on" : "off"}`,
  );
  lines.push("---------------------------------------------");
  for (const r of s.results) {
    const flags: string[] = [];
    if (r.keywordHit != null) flags.push(`kw=${r.keywordHit ? "✓" : "✗"}`);
    if (r.entityGroundingMet != null)
      flags.push(`ent=${r.entityGroundingMet ? "✓" : "✗"}`);
    if (r.beliefGroundingMet != null)
      flags.push(`bel=${r.beliefGroundingMet ? "✓" : "✗"}`);
    if (r.faithfulnessPass != null)
      flags.push(`faith=${r.faithfulnessPass ? "✓" : "✗"}`);
    const status = r.pass ? "PASS" : "FAIL";
    lines.push(
      `${status}  ${r.id.padEnd(6)} chunks=${String(r.chunkCount).padStart(2)} ` +
        `nbr=${r.neighborsAdded} bel=${r.beliefsAdded} ` +
        `${r.fallbackUsed ? "[fallback]" : ""} ${flags.join(" ")}` +
        (r.error ? ` ERR:${r.error}` : ""),
    );
  }
  lines.push("---------------------------------------------");
  lines.push(
    `PASS ${s.passCount}/${s.caseCount}   ` +
      `recall@K=${pct(s.recallAtK)}  faithfulness=${pct(s.faithfulnessPassRate)}  ` +
      `grounding=${pct(s.groundingRate)}  fallback=${pct(s.fallbackRate)}`,
  );
  lines.push("=============================================");
  lines.push("");
  return lines.join("\n");
}

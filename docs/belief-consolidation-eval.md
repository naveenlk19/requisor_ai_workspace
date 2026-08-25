# Task #99 — Belief Consolidation Eval

The 5 acceptance questions are inherited from Task #98's entity-graph eval
(`docs/entity-graph-eval-questions.md`). Task #99's bar is the *qualitative
shape* of the answer, not "is it more accurate":

> **Acceptance**: at least 2 of the 5 answers cite a `belief:<id>` source
> (the single-claim chip that fans out to N underlying chunks) rather than
> a raw `embedding:<id>` chunk.

This matters because before this task the retriever could only quote
individual mentions. A user asking "what does the team keep coming back to
about Stripe?" got 4 separate Stripe-latency chunks. After this task they
get one chip that says "team is worried about Stripe webhook latency >2s
(mentioned 7×)" with the 7 underlying chunks behind it.

## Procedure

1. Run the backfill script for a populated test user:
   ```
   tsx scripts/backfill-beliefs.ts <userId>
   ```
2. Verify rows landed:
   ```sql
   SELECT id, predicate, object, holder, mention_count, status
     FROM beliefs WHERE user_id = '<userId>'
     ORDER BY mention_count DESC LIMIT 20;
   ```
3. In Brain Hub, ask each of the 5 eval questions from Task #98 and record:
   - whether the response contains any `belief:<id>` citation
   - whether the response contains any `embedding:<id>` citation
   - subjective answer quality vs the Task #98 baseline (better / same /
     worse).
4. Pass = ≥2 / 5 answers carry a `belief:<id>` citation. Fail otherwise.
5. Regression bar — none of the Task #98 questions should produce a
   strictly worse answer than before #99 merged.

## Harness (Task #105 — source of truth)

The belief-grounding bar is now codified as the `BC-Q1`/`BC-Q2` cases in the RAG
eval harness (`server/services/rag-eval.ts`, `EVAL_SET`), which assert
`requireBeliefGrounding` (the retriever must fold in a consolidated `belief`
chunk, i.e. `beliefsAdded > 0`). Run it after backfilling beliefs:

```
tsx scripts/backfill-beliefs.ts <userId>   # populate beliefs first
tsx scripts/run-rag-eval.ts <userId>       # then measure (writes a rag_eval_runs row)
```

The harness reports a `groundingRate` aggregate (fraction of cases where the
entity-neighbor or belief layer contributed chunks) plus per-case `bel=✓/✗`
flags, and each run is appended to `rag_eval_runs` with its config snapshot so
two runs can be diffed. The harness is read-only — it never runs the
consolidator or mutates beliefs. The manual procedure below remains valid for
spot-checking the citation-chip UX end-to-end.

### Baseline run (Task #105 harness, first recorded run)
- Run id `2`, user `ef55d603-…` (YC demo), config `k=8, reranker=off,
  faithfulness=loose, answers=off`. Aggregate: `PASS 0/7 · grounding=0% ·
  fallback=100%`. The belief cases `BC-Q1`/`BC-Q2` show `bel=✗` because this dev
  environment has no `GEMINI_API_KEY` (query embedding returns null → BM25-only
  → no belief candidates), so the belief layer can't contribute. This is the
  fail-open path working as designed. On an environment with `GEMINI_API_KEY`
  set and beliefs backfilled (`tsx scripts/backfill-beliefs.ts <userId>`), re-run
  the harness to capture real `beliefsAdded` / `bel=✓` results.

## Eval status

This procedure is the acceptance definition; the recorded run is intentionally
deferred to the first nightly tick on a populated production user. Belief
consolidation is gated on ≥3 distinct source chunks per `(subject, predicate)`
group, and seeded/demo users do not meet that threshold (the entity graph is
sparse). Running the procedure on `partner@yc.com` today would produce zero
beliefs and therefore zero meaningful pass/fail signal.

Trigger conditions for filling in the table below:
- Backfill (`tsx scripts/backfill-beliefs.ts <userId>`) writes ≥5 rows for at
  least one real user.
- `ai_response_feedback.metadata->>'kind' = 'citation_click'` shows belief
  clicks (proves the UI loop is exercised end-to-end).

Once those land, record per-question rows here:

| # | Question | Belief-grounded? | Quality vs #98 | Notes |
| - | - | - | - | - |
| 1 | (from #98 §1) | _pending_ | _pending_ | _pending_ |
| 2 | (from #98 §2) | _pending_ | _pending_ | _pending_ |
| 3 | (from #98 §3) | _pending_ | _pending_ | _pending_ |
| 4 | (from #98 §4) | _pending_ | _pending_ | _pending_ |
| 5 | (from #98 §5) | _pending_ | _pending_ | _pending_ |

Pass criteria remain ≥2/5 belief-grounded with zero regressions.

## Cost guard verification

Confirm `BELIEF_CONSOLIDATION_MAX_TOKENS_PER_USER` short-circuits:

```bash
BELIEF_CONSOLIDATION_MAX_TOKENS_PER_USER=200 \
  tsx scripts/backfill-beliefs.ts <userId>
```

Expect a `hit token budget` warning in stdout and `budgetExceeded: true` in
the returned `ConsolidationResult`.

## Decay verification

```sql
-- Force one belief to look 31 days old then re-run consolidation:
UPDATE beliefs SET last_seen_at = NOW() - INTERVAL '31 days'
 WHERE id = <some_id> AND user_id = '<userId>';
```

Re-running `consolidateForUser` should flip that row to `status='stale'`
with a non-null `decayed_at`.

# Entity Graph — Eval Questions (Task #98)

The 5 questions below are the acceptance bar for the entity graph layer. Each
one is a question Requisor's hybrid retriever (Task #93) **cannot** answer
today because the answer requires walking typed edges between entities, not
just finding chunks that lexically match the question text.

A successful answer must (a) be grounded — every claim cites a source chunk
from `embeddings`, and (b) use at least one neighbor that the lexical / vector
retriever wouldn't have surfaced on its own (verifiable via the `related`
label on the citation chip).

---

## Q1 — "Who is working on the Landing AI pilot?"
- **Expected entities**: `project: landing-ai-pilot`, `person: <names mentioned in pilot meetings/emails>`
- **Expected edges**: `person —assigned_to→ project`, `person —attended→ meeting —mentions→ project`
- **Grounding chunks**: meeting transcripts and Gmail threads where the pilot is named alongside team members.
- **Why hybrid retrieval misses today**: the question lexically matches the project name, but the people who work on it are rarely co-mentioned in the same chunk as the words "landing ai pilot". They surface as utterance speakers in meetings *about* the pilot.

## Q2 — "What is blocking the Discord integration shipping?"
- **Expected entities**: `feature: discord-integration`, `risk|decision|person: <blockers>`
- **Expected edges**: `risk —blocks→ feature`, `decision —blocks→ feature`
- **Grounding chunks**: meeting utterances and conversations where someone says "we can't ship Discord until X" or marks a dependency.
- **Why hybrid retrieval misses today**: lexical retrieval surfaces the feature name; the blocker rarely co-occurs in the same chunk. The `blocks` edge is the only signal.

## Q3 — "Who decided we'd use AssemblyAI over Whisper for long files?"
- **Expected entities**: `decision: use-assemblyai-for-long-audio`, `person: <decider>`, `tool: assemblyai`, `tool: whisper`
- **Expected edges**: `person —decided→ decision`, `decision —mentions→ tool`
- **Grounding chunks**: the meeting utterance where the decision was made.
- **Why hybrid retrieval misses today**: there are many chunks mentioning both tools; without the `decided` edge we can't isolate the deciding moment from general discussion.

## Q4 — "What did Naveen say about pricing in the last month?"
- **Expected entities**: `person: naveen`, `topic: pricing`
- **Expected edges**: `person —said→ utterance —mentions→ topic`
- **Grounding chunks**: utterances where speaker = Naveen and the utterance mentions pricing.
- **Why hybrid retrieval misses today**: speaker filtering is partial (`filters.speaker` exists) but cross-meeting aggregation of one person's stance on one topic requires entity rollup, not a single retrieval.

## Q5 — "Which customers keep asking for SSO?"
- **Expected entities**: `feature: sso`, `company: <customer companies>`
- **Expected edges**: `company —mentions→ feature`, weighted by frequency.
- **Grounding chunks**: Gmail threads and meeting transcripts from each customer where SSO comes up.
- **Why hybrid retrieval misses today**: top-K returns the loudest individual chunks. Aggregating *which companies* across *how many threads* requires entity-level rollup.

---

## Acceptance
- ≥4 of 5 questions produce a grounded, cited answer in Brain Hub that wasn't possible before this task.
- Each answer's citation chips include at least one chunk surfaced via the new `related` (1-hop neighbor) label, not just direct top-K.
- Misses are documented inline below with the actual answer Requisor produced and the gap (extraction recall, edge precision, or 1-hop reach).

## Harness (Task #105 — source of truth)
These 5 questions are now codified as the `EG-Q1`…`EG-Q5` cases in the RAG eval
harness (`server/services/rag-eval.ts`, `EVAL_SET`). Instead of running them by
hand, run:

```
tsx scripts/run-rag-eval.ts <userId>          # full run (recall@K, faithfulness, grounding, fallback)
tsx scripts/run-rag-eval.ts <userId> --no-answers   # retrieval-only (skips faithfulness LLM calls)
```

or hit the admin endpoint (ADMIN_TOKEN-gated):

```
curl -X POST https://<host>/api/admin/rag-eval/run \
  -H 'Content-Type: application/json' -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"userId":"<userId>"}'
curl https://<host>/api/admin/rag-eval/runs?userId=<userId> -H "x-admin-token: $ADMIN_TOKEN"
```

Each run is appended to the `rag_eval_runs` table with the config snapshot in
effect (k, whether the Cohere reranker key was present, faithfulness mode,
whether answers were generated) so two runs are directly comparable over time.
The harness is read-only with respect to user data — it never mutates
entities/beliefs/embeddings.

The per-case acceptance signals (the entity-grounding requirement that makes
each of these "impossible without the graph") live alongside the case in
`EVAL_SET.expect.requireEntityGrounding`.

## Eval results (filled in after build)
Baseline runs are recorded in `rag_eval_runs`; query the latest with the
`GET /api/admin/rag-eval/runs` endpoint above (or `--json` on the CLI).

### Baseline run (Task #105 harness, first recorded run)
- Run id `2`, user `ef55d603-…` (YC demo), config `k=8, reranker=off,
  faithfulness=loose, answers=off`.
- Aggregate: `PASS 0/7 · recall@K=0% · grounding=0% · fallback=100%`
  (faithfulness `n/a` — answers disabled).
- **Why everything fell back:** this dev environment has no `GEMINI_API_KEY`, so
  query embedding returns null and retrieval degrades to BM25-only with empty
  results. This is the harness's fail-open path working as designed, not a
  retrieval regression. On an environment with `GEMINI_API_KEY` set and a user
  whose evidence has been embedded + graph-extracted, EG-Q1…Q5 will produce
  non-zero recall and `ent=✓` (neighbor-grounded) results. Re-run the harness
  there to capture the real per-question pass/fail.
- Q1: _baseline fell back (no embeddings in env); re-run with GEMINI_API_KEY_
- Q2: _baseline fell back (no embeddings in env); re-run with GEMINI_API_KEY_
- Q3: _baseline fell back (no embeddings in env); re-run with GEMINI_API_KEY_
- Q4: _baseline fell back (no embeddings in env); re-run with GEMINI_API_KEY_
- Q5: _baseline fell back (no embeddings in env); re-run with GEMINI_API_KEY_

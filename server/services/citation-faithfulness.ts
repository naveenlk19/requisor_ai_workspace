// Task #94 — Faithfulness verifier.
//
// After the model emits `[chunk_id:N]` markers, we ask GPT-4o-mini whether
// each cited chunk actually entails the sentence that cites it. Citations
// that don't entail are stripped according to RAG_CITATION_FAITHFULNESS_MODE:
//
//   strict  — strip on "no" OR "partial".
//   loose   — strip on "no" only.            (default)
//   off     — log only, never strip.
//
// The verifier batches all (sentence, chunk) pairs into ONE chat completion
// (JSON-mode) so the latency cost is a single round-trip even for long
// answers. If the verifier itself fails (network, JSON parse, missing key)
// we degrade gracefully: log a warning, strip nothing.

import type { RetrievedChunk } from "./retrieval";
import type { ParsedCitations } from "./citations";

export type FaithfulnessMode = "strict" | "loose" | "off";
export type FaithfulnessVerdict = "yes" | "no" | "partial";

export interface FaithfulnessResult {
  mode: FaithfulnessMode;
  /** Per (sentenceIdx, citationNumber) verdicts. */
  verdicts: Array<{
    sentenceIdx: number;
    n: number;
    verdict: FaithfulnessVerdict;
  }>;
  /** N values the caller should strip. */
  stripNs: Set<number>;
  /** Free-form note (skipped / failed / mode-off). */
  note?: string;
  latencyMs: number;
}

export function getFaithfulnessMode(): FaithfulnessMode {
  const raw = String(process.env.RAG_CITATION_FAITHFULNESS_MODE || "loose")
    .trim()
    .toLowerCase();
  if (raw === "strict" || raw === "off") return raw;
  return "loose";
}

const SYSTEM_PROMPT = `You are a strict factual-entailment judge. For each pair you receive (a SENTENCE from an AI answer + a SOURCE chunk that the answer cited), decide whether the SOURCE supports the SENTENCE. Answer with exactly one of:
- "yes"     — the source clearly supports the claim in the sentence.
- "partial" — the source touches the topic but does not fully support the claim, OR supports only part of it.
- "no"      — the source is unrelated, contradicts, or contains nothing substantive about the claim.

Reply with JSON only: {"verdicts":[{"id":"<pair id>","v":"yes|no|partial"}]}.
Be conservative. When unsure, answer "partial". Never explain.`;

interface Pair {
  id: string;
  sentenceIdx: number;
  n: number;
  sentence: string;
  source: string;
}

export async function verifyCitations(
  parsed: ParsedCitations,
  chunks: RetrievedChunk[],
  opts: { model?: string } = {},
): Promise<FaithfulnessResult> {
  const started = Date.now();
  const mode = getFaithfulnessMode();
  if (mode === "off" || parsed.citations.length === 0) {
    return {
      mode,
      verdicts: [],
      stripNs: new Set(),
      note: mode === "off" ? "mode=off" : "no citations to verify",
      latencyMs: 0,
    };
  }
  if (!process.env.OPENAI_API_KEY) {
    return {
      mode,
      verdicts: [],
      stripNs: new Set(),
      note: "OPENAI_API_KEY missing — verifier skipped",
      latencyMs: 0,
    };
  }

  // Build pairs (cap per-sentence at 5 cites and total at 30 to keep the
  // verifier prompt bounded for very long answers).
  const pairs: Pair[] = [];
  parsed.sentences.forEach((s, sentenceIdx) => {
    const dedup = Array.from(new Set(s.citationNumbers)).slice(0, 5);
    for (const n of dedup) {
      const chunk = chunks[n - 1];
      if (!chunk) continue;
      const source = (chunk.text || "").slice(0, 1500);
      pairs.push({
        id: `${sentenceIdx}:${n}`,
        sentenceIdx,
        n,
        sentence: s.sentence.replace(/\[chunk_id:\d+\]/g, "").trim().slice(0, 600),
        source,
      });
      if (pairs.length >= 30) break;
    }
    if (pairs.length >= 30) return;
  });

  if (pairs.length === 0) {
    return {
      mode,
      verdicts: [],
      stripNs: new Set(),
      note: "no pairs",
      latencyMs: Date.now() - started,
    };
  }

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = opts.model || "gpt-4o-mini";

    const userPayload =
      "PAIRS:\n" +
      pairs
        .map(
          (p) =>
            `--- id=${p.id} ---\nSENTENCE: ${p.sentence}\nSOURCE: ${p.source}`,
        )
        .join("\n\n");

    const resp = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPayload },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 400,
    });

    const txt = resp.choices[0]?.message?.content || "{}";
    const parsedJson = JSON.parse(txt);
    const list: any[] = Array.isArray(parsedJson?.verdicts)
      ? parsedJson.verdicts
      : [];

    // Map id -> verdict, then aggregate per N (a citation is stripped only
    // if EVERY sentence that cites it gets rejected — so we don't yank a
    // good citation just because one usage was iffy).
    const verdictById = new Map<string, FaithfulnessVerdict>();
    for (const row of list) {
      const id = String(row?.id || "");
      const v = String(row?.v || "").toLowerCase();
      if (v === "yes" || v === "no" || v === "partial") {
        verdictById.set(id, v as FaithfulnessVerdict);
      }
    }

    const verdicts = pairs.map((p) => ({
      sentenceIdx: p.sentenceIdx,
      n: p.n,
      verdict: (verdictById.get(p.id) ?? "partial") as FaithfulnessVerdict,
    }));

    // Per-N best verdict. Strip only if ALL verdicts for that N are bad.
    const perN = new Map<number, FaithfulnessVerdict[]>();
    for (const v of verdicts) {
      const arr = perN.get(v.n) ?? [];
      arr.push(v.verdict);
      perN.set(v.n, arr);
    }
    const stripNs = new Set<number>();
    Array.from(perN.entries()).forEach(
      ([n, vs]: [number, FaithfulnessVerdict[]]) => {
        const allBad = vs.every((v: FaithfulnessVerdict) =>
          mode === "strict" ? v !== "yes" : v === "no",
        );
        if (allBad) stripNs.add(n);
      },
    );

    return {
      mode,
      verdicts,
      stripNs,
      latencyMs: Date.now() - started,
    };
  } catch (e: any) {
    console.warn(
      "[citation-faithfulness] verifier failed:",
      e?.message || String(e),
    );
    return {
      mode,
      verdicts: [],
      stripNs: new Set(),
      note: `verifier error: ${e?.message || "unknown"}`,
      latencyMs: Date.now() - started,
    };
  }
}

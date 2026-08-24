// Task #104 — Response quality checker (FP5/FP6/FP7).
//
// A lightweight, fail-open post-response pass that scores a finished AI chat
// reply on three axes (each 0..1 with a short reason):
//
//   format       — does the answer match the format/shape the question asked
//                  for? (e.g. a list when a list was requested, a yes/no when
//                  a yes/no was asked, code in a code block, etc.)
//   specificity  — is the answer concrete and grounded (names, numbers, exact
//                  steps) rather than vague boilerplate?
//   completeness — does it actually address everything the question asked, or
//                  leave parts unanswered?
//
// Mirrors the citation-faithfulness verifier: ONE gpt-4o-mini JSON-mode
// round-trip, env-flagged, and fully fail-open. If the checker is disabled,
// the key is missing, the answer is trivially short, or anything throws, we
// return `scores: null` and the reply is shown normally with no hint.
//
// Behavior is controlled by env vars so it can be tuned/disabled without code:
//   RAG_QUALITY_CHECK_MODE       — "on" | "off"          (default "on")
//   RAG_QUALITY_CHECK_THRESHOLD  — float 0..1            (default 0.6)
//   RAG_QUALITY_CHECK_MODEL      — model id              (default gpt-4o-mini)
//   RAG_QUALITY_MIN_ANSWER_CHARS — skip below this len   (default 80)

export type QualityMode = "on" | "off";

export interface QualityScores {
  format: number; // 0..1
  specificity: number; // 0..1
  completeness: number; // 0..1
  formatReason: string;
  specificityReason: string;
  completenessReason: string;
}

export interface QualityCheckResult {
  enabled: boolean;
  /** Null when disabled / skipped / errored. Always fail-open. */
  scores: QualityScores | null;
  /** True when any scored axis is below the threshold. */
  belowThreshold: boolean;
  /** Axis names below threshold, e.g. ["specificity", "completeness"]. */
  lowAxes: Array<"format" | "specificity" | "completeness">;
  threshold: number;
  /** Free-form note (off / skipped / failed). */
  note?: string;
  latencyMs: number;
}

export function getQualityMode(): QualityMode {
  const raw = String(process.env.RAG_QUALITY_CHECK_MODE || "on")
    .trim()
    .toLowerCase();
  return raw === "off" ? "off" : "on";
}

export function getQualityThreshold(): number {
  const raw = Number(process.env.RAG_QUALITY_CHECK_THRESHOLD);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 1) return raw;
  return 0.6;
}

function getMinAnswerChars(): number {
  const raw = Number(process.env.RAG_QUALITY_MIN_ANSWER_CHARS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 80;
}

function getTimeoutMs(): number {
  const raw = Number(process.env.RAG_QUALITY_CHECK_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 8000;
}

function disabledResult(note: string, threshold: number): QualityCheckResult {
  return {
    enabled: false,
    scores: null,
    belowThreshold: false,
    lowAxes: [],
    threshold,
    note,
    latencyMs: 0,
  };
}

function clamp01(n: any): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

const SYSTEM_PROMPT = `You are a terse answer-quality grader. You receive a USER QUESTION and the ASSISTANT ANSWER that was produced for it (optionally with the CONTEXT the assistant was given). Grade the ANSWER on three independent axes, each a float from 0 to 1:

- "format": Does the answer match the shape/format the question implies or explicitly asks for? (a list when a list is requested, a direct yes/no when asked yes/no, code in a code block, a table when tabular data is asked, the requested length, etc.) 1 = matches well, 0 = wrong shape entirely.
- "specificity": Is the answer concrete and grounded — real names, numbers, exact steps, specifics from the context — rather than vague filler or generic boilerplate? 1 = highly specific, 0 = vague/generic.
- "completeness": Does the answer address everything the question asked, including all sub-parts? 1 = fully addresses it, 0 = ignores most of it.

For each axis also give a "reason": at most 12 words, plain, actionable.

Be fair but discerning. A solid, direct answer should score high (>=0.8). Reserve low scores for genuine problems. If the question is trivial chit-chat, score generously.

Reply with JSON only, exactly this shape:
{"format":{"score":0.0,"reason":"..."},"specificity":{"score":0.0,"reason":"..."},"completeness":{"score":0.0,"reason":"..."}}`;

export interface QualityCheckParams {
  question: string;
  answer: string;
  /** Optional retrieved context block the answer was grounded on. */
  context?: string;
  model?: string;
}

export async function checkResponseQuality(
  params: QualityCheckParams,
): Promise<QualityCheckResult> {
  const started = Date.now();
  const threshold = getQualityThreshold();
  const mode = getQualityMode();

  if (mode === "off") return disabledResult("mode=off", threshold);
  if (!process.env.OPENAI_API_KEY)
    return disabledResult("OPENAI_API_KEY missing — quality check skipped", threshold);

  const question = String(params.question || "").trim();
  const answer = String(params.answer || "").trim();
  if (answer.length < getMinAnswerChars())
    return disabledResult("answer too short — skipped", threshold);
  if (!question) return disabledResult("no question — skipped", threshold);

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model =
      params.model || process.env.RAG_QUALITY_CHECK_MODEL || "gpt-4o-mini";

    // Bound the payload so a huge answer/context doesn't blow the prompt.
    const ctx = String(params.context || "").slice(0, 2500);
    const userPayload =
      `USER QUESTION:\n${question.slice(0, 1500)}\n\n` +
      (ctx ? `CONTEXT (what the assistant was given):\n${ctx}\n\n` : "") +
      `ASSISTANT ANSWER:\n${answer.slice(0, 4000)}`;

    // Bound the grading round-trip: if the model hangs we must NOT delay the
    // already-shipped reply (or the SSE `done` event). On timeout we abort the
    // request and fail open with scores: null.
    const controller = new AbortController();
    const timeoutMs = getTimeoutMs();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let resp: any;
    try {
      resp = await openai.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPayload },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: 250,
        },
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timer);
    }

    const txt = resp.choices[0]?.message?.content || "{}";
    const j = JSON.parse(txt);

    const pick = (axis: string) => {
      const node = j?.[axis] || {};
      return {
        score: clamp01(node?.score),
        reason: String(node?.reason || "").slice(0, 160),
      };
    };
    const f = pick("format");
    const s = pick("specificity");
    const c = pick("completeness");

    const scores: QualityScores = {
      format: f.score,
      specificity: s.score,
      completeness: c.score,
      formatReason: f.reason,
      specificityReason: s.reason,
      completenessReason: c.reason,
    };

    const lowAxes: Array<"format" | "specificity" | "completeness"> = [];
    if (scores.format < threshold) lowAxes.push("format");
    if (scores.specificity < threshold) lowAxes.push("specificity");
    if (scores.completeness < threshold) lowAxes.push("completeness");

    return {
      enabled: true,
      scores,
      belowThreshold: lowAxes.length > 0,
      lowAxes,
      threshold,
      latencyMs: Date.now() - started,
    };
  } catch (e: any) {
    console.warn(
      "[response-quality] check failed:",
      e?.message || String(e),
    );
    return {
      enabled: true,
      scores: null,
      belowThreshold: false,
      lowAxes: [],
      threshold,
      note: `quality check error: ${e?.message || "unknown"}`,
      latencyMs: Date.now() - started,
    };
  }
}

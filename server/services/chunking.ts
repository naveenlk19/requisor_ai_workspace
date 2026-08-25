// Task #92: Centralised chunking helper for the RAG embedding pipeline.
//
// One path for every source type so we don't end up with five subtly
// different sliding-window implementations scattered across the codebase.
// Heuristic only for v1 — semantic / sentence-aware chunking is flagged as
// a follow-up. The output of every chunker is { content, chunkIndex,
// metadata } so the embedding worker can write rows uniformly.

import type {
  Conversation,
  DiarizedUtterance,
  EvidenceItem,
  FeatureCandidate,
} from "@shared/schema";

export interface Chunk {
  chunkIndex: number;
  content: string;
  metadata: Record<string, any>;
}

// Roughly 800 tokens ≈ 3200 chars (4 chars/token avg in English).
// Overlap ≈ 100 tokens ≈ 400 chars keeps facts from being split mid-sentence.
const DEFAULT_CHUNK_CHARS = 3200;
const DEFAULT_OVERLAP_CHARS = 400;
// Soft safety ceiling — at 3.2k chars/chunk this allows ~6.4 MB of source
// text per row before we start dropping. The earlier 60-chunk cap was
// silently truncating long meeting transcripts and PDFs, which violated the
// "every chunk has an embedding" coverage guarantee. We keep a high ceiling
// purely as a runaway-cost circuit-breaker for pathological inputs.
const MAX_CHUNKS_PER_SOURCE = 2000;

// Hard limits enforced for every chunk before it reaches the embedding API.
// `MIN_CHARS` skips trivially-short content (single emoji, "ok", etc.) that
// produces a near-zero vector. `MAX_CHARS` keeps us under Gemini's
// text-embedding-004 input limit (~2048 tokens ≈ 8k chars).
export const EMBED_MIN_CHARS = 30;
export const EMBED_MAX_CHARS = 8000;

function slidingWindow(
  text: string,
  chunkChars = DEFAULT_CHUNK_CHARS,
  overlap = DEFAULT_OVERLAP_CHARS,
): string[] {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= chunkChars) return [clean];

  const out: string[] = [];
  let cursor = 0;
  while (cursor < clean.length && out.length < MAX_CHUNKS_PER_SOURCE) {
    const end = Math.min(cursor + chunkChars, clean.length);
    out.push(clean.slice(cursor, end));
    if (end >= clean.length) break;
    cursor = end - overlap;
  }
  return out;
}

export function chunkEvidence(item: EvidenceItem): Chunk[] {
  // Evidence items range from a 1-line note to a fully-parsed PDF dropped
  // into the library. We always prepend the title so a 1-line evidence row
  // still has retrievable context, then sliding-window the body.
  const base = `${item.title}\n\n${item.content || ""}`.trim();
  const windows = slidingWindow(base);
  return windows.map((content, i) => ({
    chunkIndex: i,
    content,
    metadata: {
      sourceType: "evidence",
      sourceId: item.id,
      userId: item.userId,
      title: item.title,
      evidenceSource: item.source, // 'note'|'file'|'slack'|...
      insightType: item.insightType ?? null,
      fileName: (item.metadata as any)?.fileName ?? null,
      chunkType: item.source === "file" ? "file_chunk" : "text_chunk",
    },
  }));
}

export function chunkConversation(conv: Conversation): Chunk[] {
  const chunks: Chunk[] = [];
  // 1) Title + summary as a "headline" chunk so retrieval can hit a
  //    conversation by name even if the body is too long for one window.
  const headlineParts = [conv.title, conv.summary || ""]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (headlineParts) {
    chunks.push({
      chunkIndex: 0,
      content: headlineParts,
      metadata: {
        sourceType: "conversation",
        sourceId: conv.id,
        userId: conv.userId,
        projectId: conv.projectId ?? null,
        conversationSource: conv.source,
        chunkType: "headline",
        gmailFrom: (conv.metadata as any)?.gmail?.from ?? null,
        meetingDate: conv.meetingDate ?? null,
      },
    });
  }

  // 2) Body — sliding window over conv.content (Gmail body, pasted chat,
  //    pasted transcript). The headline chunk above means we already have
  //    title coverage so we don't need to re-prepend it here.
  const bodyWindows = slidingWindow(conv.content || "");
  for (let i = 0; i < bodyWindows.length; i++) {
    const content = bodyWindows[i];
    chunks.push({
      chunkIndex: chunks.length,
      content,
      metadata: {
        sourceType: "conversation",
        sourceId: conv.id,
        userId: conv.userId,
        projectId: conv.projectId ?? null,
        conversationSource: conv.source,
        chunkType: conv.source === "email" ? "email_body" : "body",
        bodyChunkIndex: i,
      },
    });
  }

  // 3) Diarized utterances — one chunk per utterance (with speaker prefix
  //    so retrieval surfaces "what did Naveen say about pricing"). We don't
  //    slide a window over utterances; they're already naturally segmented.
  const utterances = (conv.diarizedTranscript as DiarizedUtterance[] | null) || [];
  const speakerMap = (conv.speakerMap as Record<string, { name: string }> | null) || {};
  for (let i = 0; i < utterances.length; i++) {
    const u = utterances[i];
    const speakerName = speakerMap[u.speaker]?.name || u.speaker;
    const text = (u.text || "").trim();
    if (!text) continue;
    chunks.push({
      chunkIndex: chunks.length,
      content: `${speakerName}: ${text}`,
      metadata: {
        sourceType: "conversation",
        sourceId: conv.id,
        userId: conv.userId,
        projectId: conv.projectId ?? null,
        conversationSource: conv.source,
        chunkType: "utterance",
        speaker: speakerName,
        rawSpeaker: u.speaker,
        startMs: u.start,
        endMs: u.end,
        utteranceIndex: i,
      },
    });
    if (chunks.length >= MAX_CHUNKS_PER_SOURCE) break;
  }

  return chunks;
}

export function chunkFeatureCandidate(fc: FeatureCandidate): Chunk[] {
  // A feature candidate is short structured prose. One chunk captures the
  // whole story (title + why-now + reasoning); we only window if the
  // reasoning chain is genuinely long.
  const composed = [
    fc.featureTitle,
    fc.whyNow || "",
    fc.reasoningChain || "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const windows = slidingWindow(composed);
  return windows.map((content, i) => ({
    chunkIndex: i,
    content,
    metadata: {
      sourceType: "feature_candidate",
      sourceId: fc.id,
      userId: fc.userId,
      projectId: fc.projectId ?? null,
      title: fc.featureTitle,
      status: fc.status,
      chunkType: "feature_candidate",
    },
  }));
}

export function chunkConversationAttachment(
  att: {
    id: number;
    conversationId: number;
    filename: string;
    mimeType: string;
  },
  extractedText: string,
  parent: { userId: string; projectId: number | null },
): Chunk[] {
  const base = `${att.filename}\n\n${extractedText || ""}`.trim();
  const windows = slidingWindow(base);
  return windows.map((content, i) => ({
    chunkIndex: i,
    content,
    metadata: {
      sourceType: "conversation_attachment",
      sourceId: att.id,
      conversationId: att.conversationId,
      userId: parent.userId,
      projectId: parent.projectId,
      filename: att.filename,
      mimeType: att.mimeType,
      chunkType: "attachment_chunk",
    },
  }));
}

export function chunkInsight(ins: {
  id: number;
  title: string;
  description: string;
  type: string;
  projectId: number | null;
  severity?: string | null;
}): Chunk[] {
  const composed = `${ins.title}\n\n${ins.description}`;
  // Insights are short — one chunk is the right shape.
  return [
    {
      chunkIndex: 0,
      content: composed.slice(0, EMBED_MAX_CHARS),
      metadata: {
        sourceType: "insight",
        sourceId: ins.id,
        projectId: ins.projectId,
        title: ins.title,
        insightCategory: ins.type, // bottleneck/timeline-risk/etc.
        severity: ins.severity ?? null,
        chunkType: "insight",
      },
    },
  ];
}

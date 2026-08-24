// Task #92: Thumbs-up / thumbs-down widget rendered under every assistant
// message in the Brain Hub chat and the Project Planner chat. Optimistic —
// the icon flips state immediately on click, and we POST the rating in the
// background. We keep the widget tiny on purpose: telemetry only, no comment
// box in v1 (flagged as a follow-up).

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type FeedbackSurface = "brain" | "planner" | "build" | "other";

interface MessageFeedbackProps {
  surface: FeedbackSurface;
  responseText: string;
  query?: string;
  sessionId?: string | null;
  modelUsed?: string;
  /**
   * IDs of retrieved chunks used to compose this answer. Task #92 always
   * passes `[]` (no retrieval yet); Task #93 will populate it.
   */
  retrievedChunkIds?: number[];
  /** Task #94 — citation telemetry passthrough from the parent message. */
  citationsEmitted?: number;
  citationsStripped?: number;
  citationsClicked?: number;
  /**
   * Task #104 — response quality scores (0..1) + per-axis reasons. Persisted
   * alongside the rating so we can correlate user sentiment with the
   * automated quality pass. All optional / fail-open.
   */
  qualityFormat?: number | null;
  qualitySpecificity?: number | null;
  qualityCompleteness?: number | null;
  qualityReasons?: Record<string, string> | null;
  className?: string;
}

export function MessageFeedback({
  surface,
  responseText,
  query,
  sessionId,
  modelUsed,
  retrievedChunkIds = [],
  citationsEmitted = 0,
  citationsStripped = 0,
  citationsClicked = 0,
  qualityFormat = null,
  qualitySpecificity = null,
  qualityCompleteness = null,
  qualityReasons = null,
  className,
}: MessageFeedbackProps) {
  const [rating, setRating] = useState<1 | -1 | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (value: 1 | -1) => {
    if (sending || rating === value) return;
    setRating(value);
    setSending(true);
    try {
      const res = await fetch("/api/ai/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          surface,
          rating: value,
          query: query?.slice(0, 4000),
          responseText: responseText?.slice(0, 12000),
          sessionId: sessionId ?? null,
          modelUsed: modelUsed ?? null,
          retrievedChunkIds,
          citationsEmitted,
          citationsStripped,
          citationsClicked,
          qualityFormat,
          qualitySpecificity,
          qualityCompleteness,
          qualityReasons,
        }),
      });
      if (!res.ok) {
        // Server rejected the rating (auth, schema, etc.) — revert so the UI
        // accurately reflects persistence outcome.
        setRating(null);
      }
    } catch {
      // Telemetry only — never disrupt the chat UX. Revert the optimistic
      // state so the user sees the click didn't land.
      setRating(null);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={cn("mt-2 flex items-center gap-1", className)}>
      <button
        type="button"
        aria-label="Helpful"
        title="Helpful"
        onClick={() => submit(1)}
        disabled={sending}
        data-testid={`button-feedback-up-${surface}`}
        className={cn(
          "h-6 w-6 inline-flex items-center justify-center rounded-md transition-colors",
          "text-gray-400 hover:text-emerald-600 hover:bg-emerald-50",
          rating === 1 && "text-emerald-600 bg-emerald-50",
        )}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Not helpful"
        title="Not helpful"
        onClick={() => submit(-1)}
        disabled={sending}
        data-testid={`button-feedback-down-${surface}`}
        className={cn(
          "h-6 w-6 inline-flex items-center justify-center rounded-md transition-colors",
          "text-gray-400 hover:text-rose-600 hover:bg-rose-50",
          rating === -1 && "text-rose-600 bg-rose-50",
        )}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

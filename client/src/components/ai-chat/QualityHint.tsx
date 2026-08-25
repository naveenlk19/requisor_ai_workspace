// Task #104 — Response quality hint (FP5/FP6/FP7).
//
// A subtle, non-blocking inline hint rendered under an assistant message when
// the fail-open quality checker scored any axis (format / specificity /
// completeness) below the configured threshold. It never hides or alters the
// answer — it only offers a one-click "Improve this answer" re-ask plus a
// dismiss. When the checker is disabled, errored, or every axis passed, this
// renders nothing.

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResponseQuality } from "@shared/ai-types";

const AXIS_LABEL: Record<string, string> = {
  format: "format",
  specificity: "specificity",
  completeness: "completeness",
};

interface QualityHintProps {
  quality?: ResponseQuality | null;
  /** Called when the user clicks "Improve this answer". */
  onImprove: () => void;
  disabled?: boolean;
  className?: string;
}

export function QualityHint({
  quality,
  onImprove,
  disabled = false,
  className,
}: QualityHintProps) {
  const [dismissed, setDismissed] = useState(false);

  // Fail-open: render nothing unless we have real scores below threshold.
  if (
    dismissed ||
    !quality ||
    !quality.scores ||
    !quality.belowThreshold ||
    quality.lowAxes.length === 0
  ) {
    return null;
  }

  const axes = quality.lowAxes.map((a) => AXIS_LABEL[a] || a).join(", ");
  const reasonByAxis: Record<string, string> = {
    format: quality.scores.formatReason,
    specificity: quality.scores.specificityReason,
    completeness: quality.scores.completenessReason,
  };
  // Show the first low axis's reason as a brief tooltip-style detail.
  const firstReason = reasonByAxis[quality.lowAxes[0]] || "";

  return (
    <div
      data-testid="quality-hint"
      className={cn(
        "mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800",
        className,
      )}
    >
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      <div className="flex-1 leading-relaxed">
        <span>
          This answer could be stronger on{" "}
          <span className="font-medium">{axes}</span>.
        </span>
        {firstReason ? (
          <span className="ml-1 text-amber-700/80">{firstReason}</span>
        ) : null}
        <button
          type="button"
          onClick={onImprove}
          disabled={disabled}
          data-testid="button-quality-improve"
          className={cn(
            "ml-2 inline-flex items-center font-medium text-amber-900 underline-offset-2 hover:underline",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          Improve this answer
        </button>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={() => setDismissed(true)}
        data-testid="button-quality-dismiss"
        className="shrink-0 rounded p-0.5 text-amber-500 hover:bg-amber-100 hover:text-amber-700"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Shared helper so both chat surfaces send the same refinement re-ask.
export function buildImprovePrompt(
  originalQuery: string | undefined,
  quality?: ResponseQuality | null,
): string {
  const axes =
    quality?.lowAxes?.map((a) => AXIS_LABEL[a] || a).join(", ") ||
    "format, specificity, and completeness";
  const base = originalQuery?.trim()
    ? `Please improve your previous answer to: "${originalQuery.trim().slice(0, 500)}".`
    : "Please improve your previous answer.";
  return `${base} Make it stronger on ${axes}: match the requested format, be more specific and concrete (names, numbers, exact steps), and fully address every part of the question.`;
}

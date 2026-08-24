import { useEffect, useMemo, useState } from "react";
import { Sparkles, Loader2, RotateCcw, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";

type DiffPart = { type: "equal" | "added" | "removed"; text: string };

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

const DIFF_CELL_LIMIT = 1_500_000;

function diffWords(a: string, b: string): DiffPart[] {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  const n = aTokens.length;
  const m = bTokens.length;
  if ((n + 1) * (m + 1) > DIFF_CELL_LIMIT) {
    const parts: DiffPart[] = [];
    if (a) parts.push({ type: "removed", text: a });
    if (b) parts.push({ type: "added", text: b });
    return parts;
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (aTokens[i] === bTokens[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }
  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aTokens[i] === bTokens[j]) {
      parts.push({ type: "equal", text: aTokens[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      parts.push({ type: "removed", text: aTokens[i] });
      i++;
    } else {
      parts.push({ type: "added", text: bTokens[j] });
      j++;
    }
  }
  while (i < n) {
    parts.push({ type: "removed", text: aTokens[i++] });
  }
  while (j < m) {
    parts.push({ type: "added", text: bTokens[j++] });
  }
  const merged: DiffPart[] = [];
  for (const p of parts) {
    const last = merged[merged.length - 1];
    if (last && last.type === p.type) {
      last.text += p.text;
    } else {
      merged.push({ ...p });
    }
  }
  return merged;
}

interface PromptRefinerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDraft: string;
  mode?: "plan" | "build" | "general";
  onUsePrompt: (text: string) => void;
}

export function PromptRefinerDialog({
  open,
  onOpenChange,
  initialDraft,
  mode = "general",
  onUsePrompt,
}: PromptRefinerDialogProps) {
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState(initialDraft);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [isImproving, setIsImproving] = useState(false);
  const [viewMode, setViewMode] = useState<"diff" | "split" | "plain">("diff");

  useEffect(() => {
    if (open) {
      setDraft(initialDraft);
      setSuggestion(null);
      setIsImproving(false);
      setViewMode("diff");
    }
  }, [open, initialDraft]);

  const diffParts = useMemo(
    () => (suggestion ? diffWords(draft, suggestion) : []),
    [draft, suggestion],
  );

  const renderDiffSide = (side: "draft" | "suggestion") =>
    diffParts.length === 0 ? (
      <span className="text-gray-400 italic">No changes suggested.</span>
    ) : (
      diffParts.map((part, idx) => {
        if (part.type === "equal") {
          return <span key={idx}>{part.text}</span>;
        }
        if (part.type === "added" && side === "suggestion") {
          return (
            <span
              key={idx}
              className="bg-emerald-200/70 text-emerald-900 rounded px-0.5"
            >
              {part.text}
            </span>
          );
        }
        if (part.type === "removed" && side === "draft") {
          return (
            <span
              key={idx}
              className="bg-red-100 text-red-700 line-through decoration-red-500/70 rounded px-0.5"
            >
              {part.text}
            </span>
          );
        }
        return null;
      })
    );

  const handleImprove = async () => {
    if (!draft.trim()) {
      toast({
        title: "Add some text first",
        description: "Type a draft prompt before asking AI to improve it.",
      });
      return;
    }
    setIsImproving(true);
    try {
      const res = await fetch("/api/ai/refine-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ draft, mode }),
      });
      if (!res.ok) {
        let message = "Couldn't improve the prompt. Please try again.";
        try {
          const data = await res.json();
          if (data?.message) message = data.message;
          else if (data?.error) message = data.error;
        } catch {}
        toast({
          title: "Refine failed",
          description: message,
          variant: "destructive",
        });
        return;
      }
      const data = await res.json();
      if (data?.refined && typeof data.refined === "string") {
        setSuggestion(data.refined);
      } else {
        toast({
          title: "No suggestion",
          description: "AI did not return a refined prompt.",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "Refine failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsImproving(false);
    }
  };

  const handleAcceptSuggestion = () => {
    if (suggestion) setDraft(suggestion);
    setSuggestion(null);
  };

  const handleDiscardSuggestion = () => {
    setSuggestion(null);
  };

  const handleUsePrompt = () => {
    const text = draft.trim();
    if (!text) return;
    onUsePrompt(text);
    onOpenChange(false);
  };

  const body = (
    <div className="flex flex-col gap-4 min-h-0 flex-1">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-gray-700">Your draft</label>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type or paste a longer draft of what you want to ask…"
          className="min-h-[140px] sm:min-h-[180px] text-sm resize-y"
          autoFocus
        />
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>{draft.length} characters</span>
          <button
            type="button"
            onClick={() => setDraft("")}
            className="hover:text-gray-600"
            disabled={!draft}
          >
            Clear
          </button>
        </div>
      </div>

      {suggestion && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
              <Sparkles className="h-3.5 w-3.5" />
              AI suggestion
            </div>
            <div className="flex items-center gap-1">
              <div className="flex items-center rounded-md border border-emerald-200 bg-white text-xs overflow-hidden mr-1">
                <button
                  type="button"
                  onClick={() => setViewMode("diff")}
                  className={`px-2 py-1 ${
                    viewMode === "diff"
                      ? "bg-emerald-600 text-white"
                      : "text-gray-600 hover:bg-emerald-50"
                  }`}
                  data-testid="button-view-diff"
                >
                  Diff
                </button>
                {!isMobile && (
                  <button
                    type="button"
                    onClick={() => setViewMode("split")}
                    className={`px-2 py-1 border-l border-emerald-200 ${
                      viewMode === "split"
                        ? "bg-emerald-600 text-white"
                        : "text-gray-600 hover:bg-emerald-50"
                    }`}
                    data-testid="button-view-split"
                  >
                    Side-by-side
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewMode("plain")}
                  className={`px-2 py-1 border-l border-emerald-200 ${
                    viewMode === "plain"
                      ? "bg-emerald-600 text-white"
                      : "text-gray-600 hover:bg-emerald-50"
                  }`}
                  data-testid="button-view-plain"
                >
                  Plain
                </button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-gray-600"
                onClick={handleDiscardSuggestion}
              >
                <X className="h-3 w-3 mr-1" />
                Discard
              </Button>
              <Button
                size="sm"
                className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700"
                onClick={handleAcceptSuggestion}
              >
                <Check className="h-3 w-3 mr-1" />
                Accept
              </Button>
            </div>
          </div>
          {viewMode === "diff" && (
            <>
              <div
                className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed rounded-md bg-white border border-emerald-100 p-2"
                data-testid="text-prompt-diff"
              >
                {diffParts.length === 0 ? (
                  <span className="text-gray-400 italic">
                    No changes suggested.
                  </span>
                ) : (
                  diffParts.map((part, idx) => {
                    if (part.type === "equal") {
                      return <span key={idx}>{part.text}</span>;
                    }
                    if (part.type === "added") {
                      return (
                        <span
                          key={idx}
                          className="bg-emerald-200/70 text-emerald-900 rounded px-0.5"
                        >
                          {part.text}
                        </span>
                      );
                    }
                    return (
                      <span
                        key={idx}
                        className="bg-red-100 text-red-700 line-through decoration-red-500/70 rounded px-0.5"
                      >
                        {part.text}
                      </span>
                    );
                  })
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-3 rounded-sm bg-emerald-200/70 border border-emerald-300" />
                  Added
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-3 rounded-sm bg-red-100 border border-red-200" />
                  Removed
                </span>
              </div>
            </>
          )}
          {viewMode === "split" && (
            <div
              className="grid grid-cols-2 gap-2"
              data-testid="text-prompt-split"
            >
              <div className="rounded-md bg-white border border-emerald-100 p-2 min-w-0">
                <div className="text-[11px] font-medium text-gray-500 mb-1">
                  Your draft
                </div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed break-words">
                  {renderDiffSide("draft")}
                </div>
              </div>
              <div className="rounded-md bg-white border border-emerald-100 p-2 min-w-0">
                <div className="text-[11px] font-medium text-emerald-700 mb-1">
                  AI suggestion
                </div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed break-words">
                  {renderDiffSide("suggestion")}
                </div>
              </div>
            </div>
          )}
          {viewMode === "plain" && (
            <div
              className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed rounded-md bg-white border border-emerald-100 p-2"
              data-testid="text-prompt-plain"
            >
              {suggestion}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={handleImprove}
          disabled={isImproving || !draft.trim()}
          className="gap-1.5"
        >
          {isImproving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : suggestion ? (
            <RotateCcw className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {isImproving
            ? "Improving…"
            : suggestion
              ? "Try again"
              : "Improve with AI"}
        </Button>
      </div>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-end gap-2 w-full">
      <Button variant="ghost" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button
        onClick={handleUsePrompt}
        disabled={!draft.trim()}
        className="bg-emerald-600 hover:bg-emerald-700"
      >
        Use this prompt
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[92vh] flex flex-col p-0"
        >
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              Refine prompt
            </SheetTitle>
            <SheetDescription>
              Edit a longer draft and let AI suggest a clearer rewrite.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">{body}</div>
          <SheetFooter className="p-4 border-t">{footer}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            Refine prompt
          </DialogTitle>
          <DialogDescription>
            Edit a longer draft and let AI suggest a clearer rewrite before sending.
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

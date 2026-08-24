import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowUpDown,
  Zap,
  TrendingUp,
  Info,
  Loader2,
  BarChart3,
  Table2,
  Grid3X3,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

interface FeatureCandidate {
  id: number;
  featureTitle: string;
  whyNow: string | null;
  evidence: string[] | null;
  uiChanges: string | null;
  dataModelChanges: string | null;
  workflowChanges: string | null;
  tasks: any;
  status: string | null;
  impactScore: number | null;
  effortScore: number | null;
  confidenceScore: number | null;
  riceScore: number | null;
  priorityRank: number | null;
  scoreReasoning: any;
}

interface PriorityMatrixProps {
  candidates: FeatureCandidate[];
}

type SortField = "riceScore" | "impactScore" | "effortScore" | "confidenceScore" | "featureTitle";
type SortDirection = "asc" | "desc";
type ViewMode = "table" | "matrix";

function getQuadrant(impact: number, effort: number): string {
  if (impact >= 50 && effort < 50) return "quick-win";
  if (impact >= 50 && effort >= 50) return "major-project";
  if (impact < 50 && effort < 50) return "fill-in";
  return "thankless";
}

function getQuadrantLabel(quadrant: string): string {
  switch (quadrant) {
    case "quick-win": return "Quick Win";
    case "major-project": return "Major Project";
    case "fill-in": return "Fill-In";
    case "thankless": return "Thankless Task";
    default: return "";
  }
}

function getQuadrantColor(quadrant: string): string {
  switch (quadrant) {
    case "quick-win": return "bg-emerald-500";
    case "major-project": return "bg-blue-500";
    case "fill-in": return "bg-amber-400";
    case "thankless": return "bg-red-400";
    default: return "bg-gray-400";
  }
}

function getScoreColor(score: number | null): string {
  if (!score) return "text-slate-400";
  if (score >= 70) return "text-emerald-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-500";
}

export function PriorityMatrix({ candidates }: PriorityMatrixProps) {
  const [sortField, setSortField] = useState<SortField>("riceScore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [editingScores, setEditingScores] = useState<Record<number, Partial<{ impact: string; effort: string; confidence: string }>>>({});
  const queryClient = useQueryClient();

  const prioritizeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/feature-candidates/prioritize", {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feature-candidates"] });
      toast({ title: "Features prioritized!", description: "AI has scored and ranked all pending candidates." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to prioritize features", variant: "destructive" });
    },
  });

  const updateScoreMutation = useMutation({
    mutationFn: async ({ id, scores }: { id: number; scores: { impactScore?: number; effortScore?: number; confidenceScore?: number } }) => {
      return await apiRequest(`/api/feature-candidates/${id}/scores`, {
        method: "PATCH",
        body: JSON.stringify(scores),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feature-candidates"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update score", variant: "destructive" });
    },
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const handleScoreBlur = (candidateId: number, field: "impact" | "effort" | "confidence") => {
    const editing = editingScores[candidateId];
    if (!editing || editing[field] === undefined) return;

    const value = parseInt(editing[field]!, 10);
    if (isNaN(value) || value < 1 || value > 100) {
      setEditingScores((prev) => {
        const next = { ...prev };
        if (next[candidateId]) {
          delete next[candidateId][field];
          if (Object.keys(next[candidateId]).length === 0) delete next[candidateId];
        }
        return next;
      });
      return;
    }

    const scoreKey = field === "impact" ? "impactScore" : field === "effort" ? "effortScore" : "confidenceScore";
    updateScoreMutation.mutate({ id: candidateId, scores: { [scoreKey]: value } });

    setEditingScores((prev) => {
      const next = { ...prev };
      if (next[candidateId]) {
        delete next[candidateId][field];
        if (Object.keys(next[candidateId]).length === 0) delete next[candidateId];
      }
      return next;
    });
  };

  const handleScoreChange = (candidateId: number, field: "impact" | "effort" | "confidence", value: string) => {
    setEditingScores((prev) => ({
      ...prev,
      [candidateId]: { ...prev[candidateId], [field]: value },
    }));
  };

  const getEditingValue = (candidateId: number, field: "impact" | "effort" | "confidence", original: number | null) => {
    const editing = editingScores[candidateId];
    if (editing && editing[field] !== undefined) return editing[field]!;
    return original?.toString() || "";
  };

  const scoredCandidates = candidates.filter((c) => c.riceScore !== null && c.riceScore !== undefined);
  const unscoredCandidates = candidates.filter((c) => c.riceScore === null || c.riceScore === undefined);
  const hasScores = scoredCandidates.length > 0;

  const sortedCandidates = [...scoredCandidates].sort((a, b) => {
    const aVal = a[sortField] ?? 0;
    const bVal = b[sortField] ?? 0;
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDirection === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  const allSorted = [...sortedCandidates, ...unscoredCandidates];

  const quickWins = scoredCandidates.filter((c) => {
    const impact = c.impactScore ?? 0;
    const effort = c.effortScore ?? 100;
    return impact >= 60 && effort <= 40;
  });

  const renderReasoningTooltip = (candidate: FeatureCandidate, field: "impact" | "effort" | "confidence") => {
    const reasoning = candidate.scoreReasoning as any;
    if (!reasoning) return null;
    const key = field === "impact" ? "impactReason" : field === "effort" ? "effortReason" : "confidenceReason";
    const text = reasoning[key];
    if (!text) return null;

    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3 w-3 text-slate-300 hover:text-slate-500 cursor-help inline-block ml-1" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[250px] text-xs">
            <p>{text}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-xs font-medium text-slate-500 uppercase tracking-wider hover:text-slate-700 transition-colors"
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortField === field ? "text-slate-700" : "text-slate-300"}`} />
    </button>
  );

  const renderMatrix = () => {
    if (!hasScores) return null;

    const matrixCandidates = scoredCandidates.filter((c) => c.impactScore && c.effortScore);

    return (
      <div className="p-4">
        <div className="relative w-full aspect-square max-w-[400px] mx-auto border border-slate-200 rounded-lg bg-white">
          <div className="absolute inset-0">
            <div className="absolute top-0 left-0 w-1/2 h-1/2 bg-amber-50/50 rounded-tl-lg border-r border-b border-slate-100" />
            <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-blue-50/50 rounded-tr-lg border-b border-slate-100" />
            <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-emerald-50/50 rounded-bl-lg border-r border-slate-100" />
            <div className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-red-50/50 rounded-br-lg" />
          </div>

          <div className="absolute top-2 left-3 text-[10px] font-medium text-amber-600/70">Thankless</div>
          <div className="absolute top-2 right-3 text-[10px] font-medium text-blue-600/70">Major Project</div>
          <div className="absolute bottom-2 left-3 text-[10px] font-medium text-emerald-600/70">Quick Win ⚡</div>
          <div className="absolute bottom-2 right-3 text-[10px] font-medium text-red-500/70">Fill-In</div>

          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 font-medium">
            Effort →
          </div>
          <div className="absolute -left-6 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] text-slate-400 font-medium">
            Impact →
          </div>

          {matrixCandidates.map((c) => {
            const x = ((c.effortScore ?? 50) / 100) * 100;
            const y = 100 - ((c.impactScore ?? 50) / 100) * 100;
            const quadrant = getQuadrant(c.impactScore ?? 50, c.effortScore ?? 50);
            const dotColor = getQuadrantColor(quadrant);

            return (
              <TooltipProvider key={c.id} delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={`absolute w-4 h-4 rounded-full ${dotColor} border-2 border-white shadow-md cursor-pointer hover:scale-125 transition-transform z-10`}
                      style={{
                        left: `calc(${x}% - 8px)`,
                        top: `calc(${y}% - 8px)`,
                      }}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    <p className="font-medium text-xs">{c.featureTitle}</p>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Impact: {c.impactScore} · Effort: {c.effortScore} · RICE: {c.riceScore}
                    </div>
                    <Badge variant="outline" className="text-[9px] mt-1 h-4 px-1">
                      {getQuadrantLabel(quadrant)}
                    </Badge>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-4 mt-8 text-[10px]">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-500">Quick Win</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="text-slate-500">Major Project</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="text-slate-500">Fill-In</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <span className="text-slate-500">Thankless</span>
          </div>
        </div>
      </div>
    );
  };

  const renderTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left py-2 px-3 w-8">
              <span className="text-xs font-medium text-slate-400">#</span>
            </th>
            <th className="text-left py-2 px-3">
              <SortHeader field="featureTitle" label="Feature" />
            </th>
            <th className="text-center py-2 px-2">
              <SortHeader field="impactScore" label="Impact" />
            </th>
            <th className="text-center py-2 px-2">
              <SortHeader field="effortScore" label="Effort" />
            </th>
            <th className="text-center py-2 px-2">
              <SortHeader field="confidenceScore" label="Conf." />
            </th>
            <th className="text-center py-2 px-2">
              <SortHeader field="riceScore" label="RICE" />
            </th>
          </tr>
        </thead>
        <tbody>
          {allSorted.map((c, idx) => {
            const isQuickWin = quickWins.some((q) => q.id === c.id);
            return (
              <tr
                key={c.id}
                className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${isQuickWin ? "bg-emerald-50/30" : ""}`}
              >
                <td className="py-2 px-3 text-xs text-slate-400">{c.priorityRank ?? idx + 1}</td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-slate-700 truncate max-w-[140px]">
                      {c.featureTitle}
                    </span>
                    {isQuickWin && (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px] h-4 px-1 shrink-0">
                        <Zap className="h-2.5 w-2.5 mr-0.5" />
                        Quick Win
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="py-2 px-2 text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={getEditingValue(c.id, "impact", c.impactScore)}
                      onChange={(e) => handleScoreChange(c.id, "impact", e.target.value)}
                      onBlur={() => handleScoreBlur(c.id, "impact")}
                      onKeyDown={(e) => { if (e.key === "Enter") handleScoreBlur(c.id, "impact"); }}
                      className={`w-12 h-6 text-xs text-center p-0.5 border-slate-200 ${getScoreColor(c.impactScore)}`}
                      placeholder="—"
                    />
                    {renderReasoningTooltip(c, "impact")}
                  </div>
                </td>
                <td className="py-2 px-2 text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={getEditingValue(c.id, "effort", c.effortScore)}
                      onChange={(e) => handleScoreChange(c.id, "effort", e.target.value)}
                      onBlur={() => handleScoreBlur(c.id, "effort")}
                      onKeyDown={(e) => { if (e.key === "Enter") handleScoreBlur(c.id, "effort"); }}
                      className={`w-12 h-6 text-xs text-center p-0.5 border-slate-200 ${getScoreColor(c.effortScore)}`}
                      placeholder="—"
                    />
                    {renderReasoningTooltip(c, "effort")}
                  </div>
                </td>
                <td className="py-2 px-2 text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={getEditingValue(c.id, "confidence", c.confidenceScore)}
                      onChange={(e) => handleScoreChange(c.id, "confidence", e.target.value)}
                      onBlur={() => handleScoreBlur(c.id, "confidence")}
                      onKeyDown={(e) => { if (e.key === "Enter") handleScoreBlur(c.id, "confidence"); }}
                      className={`w-12 h-6 text-xs text-center p-0.5 border-slate-200 ${getScoreColor(c.confidenceScore)}`}
                      placeholder="—"
                    />
                    {renderReasoningTooltip(c, "confidence")}
                  </div>
                </td>
                <td className="py-2 px-2 text-center">
                  <span className={`text-xs font-bold ${getScoreColor(c.riceScore)}`}>
                    {c.riceScore ?? "—"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            <CardTitle className="text-sm font-semibold">Priority Matrix</CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center bg-slate-100 rounded-md p-0.5">
              <button
                onClick={() => setViewMode("table")}
                className={`p-1 rounded ${viewMode === "table" ? "bg-white shadow-sm" : "hover:bg-slate-200"} transition-colors`}
                title="Table view"
              >
                <Table2 className="h-3.5 w-3.5 text-slate-600" />
              </button>
              <button
                onClick={() => setViewMode("matrix")}
                className={`p-1 rounded ${viewMode === "matrix" ? "bg-white shadow-sm" : "hover:bg-slate-200"} transition-colors`}
                title="Matrix view"
              >
                <Grid3X3 className="h-3.5 w-3.5 text-slate-600" />
              </button>
            </div>
            <Button
              size="sm"
              onClick={() => prioritizeMutation.mutate()}
              disabled={prioritizeMutation.isPending || candidates.filter((c) => c.status === "candidate").length === 0}
              className="h-7 text-xs bg-indigo-500 hover:bg-indigo-600 text-white"
            >
              {prioritizeMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <BarChart3 className="h-3 w-3 mr-1" />
              )}
              Prioritize All
            </Button>
          </div>
        </div>
        {quickWins.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 px-2 py-1.5 bg-emerald-50 border border-emerald-100 rounded-md">
            <Zap className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-xs text-emerald-700 font-medium">
              {quickWins.length} Quick Win{quickWins.length !== 1 ? "s" : ""} identified
            </span>
            <span className="text-[10px] text-emerald-500 ml-1">
              — high impact, low effort
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0 flex-1">
        {candidates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <BarChart3 className="h-8 w-8 text-slate-200 mb-2" />
            <p className="text-xs text-slate-400">No feature candidates to prioritize yet</p>
          </div>
        ) : viewMode === "matrix" ? (
          hasScores ? renderMatrix() : (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <Grid3X3 className="h-8 w-8 text-slate-200 mb-2" />
              <p className="text-xs text-slate-400 mb-3">Click "Prioritize All" to score features and see the matrix</p>
            </div>
          )
        ) : (
          renderTable()
        )}
      </CardContent>
    </Card>
  );
}

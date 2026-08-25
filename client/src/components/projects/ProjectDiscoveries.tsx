import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Lightbulb,
  Plus,
  PencilLine,
  Trash2,
  Sparkles,
  UserPen,
  Loader2,
  Save,
  X,
  ArrowRight,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { usePastDiscoveriesFilter } from "@/hooks/usePastDiscoveriesFilter";
import { FeatureCandidateCard } from "@/components/modes/build/FeatureCandidateCard";

type FeatureCandidate = {
  id: number;
  userId: string;
  featureTitle: string;
  whyNow: string | null;
  evidence: string[] | null;
  uiChanges: string | null;
  dataModelChanges: string | null;
  workflowChanges: string | null;
  tasks: any;
  status: string | null;
  sourceContext: string | null;
  projectId: number | null;
  source: string | null;
  createdBy: string | null;
  mentionCount?: number | null;
  lastSentToAgent?: string | null;
  lastSentAt?: string | null;
};

type ManualForm = {
  featureTitle: string;
  whyNow: string;
  sourceContext: string;
};

const EMPTY_FORM: ManualForm = {
  featureTitle: "",
  whyNow: "",
  sourceContext: "",
};

interface ProjectDiscoveriesProps {
  projectId: number;
  projectName?: string;
}

// Sleek skeleton replacement for layout shifts
function DiscoverySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse space-y-3 rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)] p-5"
        >
          <div className="flex justify-between items-center">
            <div className="h-5 w-24 rounded-full bg-slate-200/80" />
            <div className="h-4 w-12 rounded bg-slate-200/80" />
          </div>
          <div className="h-6 w-2/3 rounded-lg bg-slate-200" />
          <div className="h-4 w-full rounded bg-slate-200/60" />
          <div className="h-4 w-4/5 rounded bg-slate-200/60" />
        </div>
      ))}
    </div>
  );
}

export function ProjectDiscoveries({
  projectId,
  projectName,
}: ProjectDiscoveriesProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [, setProjectFilter] = usePastDiscoveriesFilter();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCandidate, setEditingCandidate] =
    useState<FeatureCandidate | null>(null);
  const [form, setForm] = useState<ManualForm>(EMPTY_FORM);

  const { data: candidates = [], isLoading } = useQuery<FeatureCandidate[]>({
    queryKey: ["/api/feature-candidates", { projectId }],
    queryFn: async () =>
      await apiRequest(
        `/api/feature-candidates?projectId=${encodeURIComponent(String(projectId))}`,
      ),
    enabled: !!projectId,
  });

  const counts = useMemo(() => {
    const manual = candidates.filter((c) => c.source === "manual").length;
    const ai = candidates.length - manual;
    return { total: candidates.length, manual, ai };
  }, [candidates]);

  const invalidateCandidates = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/feature-candidates"] });
  };

  const createManualMutation = useMutation({
    mutationFn: async (input: ManualForm) =>
      await apiRequest("/api/feature-candidates", {
        method: "POST",
        body: JSON.stringify({
          source: "manual",
          featureTitle: input.featureTitle.trim(),
          whyNow: input.whyNow.trim() || null,
          sourceContext: input.sourceContext.trim() || null,
          projectId,
        }),
      }),
    onSuccess: () => {
      invalidateCandidates();
      toast({
        title: "Discovery added",
        description: "Your discovery is now in the list.",
      });
      setShowAddDialog(false);
      setForm(EMPTY_FORM);
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't add discovery",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateManualMutation = useMutation({
    mutationFn: async ({ id, input }: { id: number; input: ManualForm }) =>
      await apiRequest(`/api/feature-candidates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          featureTitle: input.featureTitle.trim(),
          whyNow: input.whyNow.trim() || null,
          sourceContext: input.sourceContext.trim() || null,
          projectId,
        }),
      }),
    onSuccess: () => {
      invalidateCandidates();
      toast({ title: "Discovery updated" });
      setEditingCandidate(null);
      setForm(EMPTY_FORM);
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't save changes",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) =>
      await apiRequest(`/api/feature-candidates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateCandidates();
      toast({ title: "Discovery deleted" });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't delete",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) =>
      await apiRequest(`/api/feature-candidates/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      invalidateCandidates();
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Approved", description: "Added to your projects." });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't approve",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const openAddDialog = () => {
    setEditingCandidate(null);
    setForm(EMPTY_FORM);
    setShowAddDialog(true);
  };

  const openEditDialog = (candidate: FeatureCandidate) => {
    setEditingCandidate(candidate);
    setForm({
      featureTitle: candidate.featureTitle || "",
      whyNow: candidate.whyNow || "",
      sourceContext: candidate.sourceContext || "",
    });
  };

  const handleSubmit = () => {
    if (!form.featureTitle.trim()) {
      toast({
        title: "Title required",
        description: "Please give your discovery a title.",
        variant: "destructive",
      });
      return;
    }
    if (editingCandidate) {
      updateManualMutation.mutate({ id: editingCandidate.id, input: form });
    } else {
      createManualMutation.mutate(form);
    }
  };

  const handleViewAll = () => {
    setProjectFilter(projectId);
    setLocation("/past-discoveries");
  };

  const dialogOpen = showAddDialog || editingCandidate !== null;
  const isSubmitting =
    createManualMutation.isPending || updateManualMutation.isPending;

  const countPill =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 shadow-sm";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 h-10 w-10 shrink-0 rounded-xl bg-amber-50/60 text-amber-600 flex items-center justify-center shadow-sm">
            <Lightbulb className="h-5 w-5 stroke-[2]" />
          </span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              Discoveries
            </h2>
            <p className="text-sm text-slate-500 mt-0.5 max-w-md leading-relaxed">
              Feature candidates attached to this project — both AI-extracted
              and manually added.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleViewAll}
            className="rounded-full border-0 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-sm font-medium transition-all"
            data-testid="link-view-all-discoveries"
          >
            View all in Past Discoveries
            <ArrowRight className="h-3.5 w-3.5 ml-1.5 opacity-70" />
          </Button>
          <Button
            size="sm"
            onClick={openAddDialog}
            className="rounded-full bg-slate-900 hover:bg-slate-800 text-white font-medium transition-all shadow-[0_1px_2px_rgba(0,0,0,0.05),0_4px_12px_-2px_rgba(15,23,42,0.15)]"
            data-testid="button-add-discovery-project"
          >
            <Plus className="h-4 w-4 mr-1.5 stroke-[2.5]" />
            Add discovery
          </Button>
        </div>
      </div>

      {/* Modern Dashboard Micro-metrics */}
      {!isLoading && candidates.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(countPill, "bg-white text-slate-700")}>
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            <strong className="font-semibold">{counts.total}</strong> total
          </span>
          <span className={cn(countPill, "bg-blue-50 text-blue-700")}>
            <Sparkles className="h-3 w-3 text-blue-500" />
            <strong className="font-semibold">{counts.ai}</strong> AI-extracted
          </span>
          <span className={cn(countPill, "bg-violet-50 text-violet-700")}>
            <UserPen className="h-3 w-3 text-violet-500" />
            <strong className="font-semibold">{counts.manual}</strong> Manual
          </span>
        </div>
      )}

      {/* Main Container Content */}
      {isLoading ? (
        <DiscoverySkeleton />
      ) : candidates.length === 0 ? (
        /* Empty state card */
        <div className="rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)] text-center py-14 px-6 relative overflow-hidden">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center shadow-sm relative z-10">
            <Lightbulb className="h-6 w-6 animate-pulse" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 mb-1 relative z-10">
            No discoveries captured yet
          </h3>
          <p className="text-sm text-slate-500 max-w-xs mx-auto mb-5 leading-relaxed relative z-10">
            Keep customer requests, feature insights, or product updates synced
            directly to this dashboard.
          </p>
          <Button
            onClick={openAddDialog}
            className="rounded-full bg-slate-900 hover:bg-slate-800 text-white font-medium shadow-sm transition-all relative z-10"
            data-testid="button-empty-add-discovery"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add your first discovery
          </Button>
        </div>
      ) : (
        /* Card grid */
        <div className="grid gap-4 sm:grid-cols-2">
          {candidates.map((candidate) => {
            const isManual = candidate.source === "manual";
            return (
              <div
                key={candidate.id}
                className="group relative rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_8px_rgba(15,23,42,0.06),0_16px_32px_-12px_rgba(15,23,42,0.18)]"
              >
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  {isManual ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 px-2.5 py-1 text-[11px] font-medium tracking-tight"
                      data-testid={`badge-manual-${candidate.id}`}
                    >
                      <UserPen className="h-2.5 w-2.5 text-slate-500" />
                      Manually added
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2.5 py-1 text-[11px] font-medium tracking-tight">
                      <Sparkles className="h-2.5 w-2.5 text-blue-500" />
                      AI Agent Insight
                    </span>
                  )}
                  {isManual && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2.5 rounded-full text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                        onClick={() => openEditDialog(candidate)}
                        data-testid={`button-edit-${candidate.id}`}
                      >
                        <PencilLine className="h-3.5 w-3.5 mr-1 text-slate-400" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        onClick={() => {
                          if (confirm(`Delete "${candidate.featureTitle}"?`)) {
                            deleteMutation.mutate(candidate.id);
                          }
                        }}
                        data-testid={`button-delete-${candidate.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                <FeatureCandidateCard
                  candidate={candidate}
                  onApprove={(id) => approveMutation.mutate(id)}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  isApproving={approveMutation.isPending}
                  projectName={projectName}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* High-End Clean Configuration Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddDialog(false);
            setEditingCandidate(null);
            setForm(EMPTY_FORM);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg rounded-2xl border-slate-200/80 shadow-2xl backdrop-blur-md">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
              {editingCandidate ? "Edit discovery" : "Add a new discovery"}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              {editingCandidate
                ? "Update the details for this manually added discovery."
                : projectName
                  ? `This discovery will be pinned contextually to "${projectName}".`
                  : "This will be attached directly to the active operational project."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label
                htmlFor="discovery-title"
                className="text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Title
              </Label>
              <Input
                id="discovery-title"
                value={form.featureTitle}
                onChange={(e) =>
                  setForm((f) => ({ ...f, featureTitle: e.target.value }))
                }
                placeholder="e.g. Add weekly metric digest email"
                className="rounded-xl border-slate-200/80 bg-slate-50/50 focus:bg-white shadow-sm focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:ring-offset-0 transition-colors"
                data-testid="input-discovery-title"
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="discovery-why"
                className="text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Description
              </Label>
              <Textarea
                id="discovery-why"
                rows={3}
                value={form.whyNow}
                onChange={(e) =>
                  setForm((f) => ({ ...f, whyNow: e.target.value }))
                }
                placeholder="What user pain point or tactical opportunity does this candidate address?"
                className="rounded-xl border-slate-200/80 bg-slate-50/50 focus:bg-white shadow-sm focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:ring-offset-0 transition-colors resize-none"
                data-testid="input-discovery-why"
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="discovery-source"
                className="text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Source Context / Reference{" "}
                <span className="text-slate-400 font-normal">(optional)</span>
              </Label>
              <Textarea
                id="discovery-source"
                rows={2}
                value={form.sourceContext}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sourceContext: e.target.value }))
                }
                placeholder="Intercom links, customer email excerpts, or internal notes..."
                className="rounded-xl border-slate-200/80 bg-slate-50/50 focus:bg-white shadow-sm focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:ring-offset-0 transition-colors resize-none"
                data-testid="input-discovery-source"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 pt-4 mt-2">
            <Button
              variant="ghost"
              className="rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
              onClick={() => {
                setShowAddDialog(false);
                setEditingCandidate(null);
                setForm(EMPTY_FORM);
              }}
              disabled={isSubmitting}
            >
              <X className="h-4 w-4 mr-1.5 opacity-60" />
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !form.featureTitle.trim()}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium transition-all shadow-sm"
              data-testid="button-save-discovery"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Save className="h-4 w-4 mr-1.5 stroke-[2.5]" />
              )}
              {editingCandidate ? "Save updates" : "Add discovery"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

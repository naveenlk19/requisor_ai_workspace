import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Lightbulb,
  Plus,
  PencilLine,
  Trash2,
  FolderOpen,
  Sparkles,
  UserPen,
  Loader2,
  Save,
  X,
  Search,
  FileText,
  MessageSquare,
  StickyNote,
  Database as DatabaseIcon,
  Link2,
  Tag as TagIcon,
  Filter,
  GitMerge,
  Send,
  Bot,
  User as UserIcon,
  Settings2,
  RefreshCw,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/hooks/useProjects";
import {
  usePastDiscoveriesFilter,
  usePastDiscoveriesFilters,
} from "@/hooks/usePastDiscoveriesFilter";
import { PriorityMatrix } from "@/components/modes/build/PriorityMatrix";
import { FeatureCandidateCard } from "@/components/modes/build/FeatureCandidateCard";
import type { Project, EvidenceItem } from "@shared/schema";
import { findMatchingEvidence } from "@shared/evidenceMatching";

type FeatureCandidate = {
  id: number;
  userId: string;
  featureTitle: string;
  whyNow: string | null;
  evidence: string[] | null;
  evidenceItemIds: number[] | null;
  uiChanges: string | null;
  dataModelChanges: string | null;
  workflowChanges: string | null;
  tasks: any;
  status: string | null;
  sourceContext: string | null;
  projectId: number | null;
  source: string | null;
  createdBy: string | null;
  impactScore: number | null;
  effortScore: number | null;
  confidenceScore: number | null;
  riceScore: number | null;
  priorityRank: number | null;
  scoreReasoning: any;
  mentionCount?: number | null;
  tags?: string[] | null;
  lastSentToAgent?: string | null;
  lastSentAt?: string | null;
  createdAt?: string | null;
};

type ManualForm = {
  featureTitle: string;
  whyNow: string;
  sourceContext: string;
  projectId: "none" | string;
  evidenceItemIds: number[];
  tags: string[];
};

const EMPTY_FORM: ManualForm = {
  featureTitle: "",
  whyNow: "",
  sourceContext: "",
  projectId: "none",
  evidenceItemIds: [],
  tags: [],
};

const EVIDENCE_SOURCE_ICONS: Record<string, typeof FileText> = {
  note: StickyNote,
  transcript: MessageSquare,
  file: FileText,
  "usage-data": DatabaseIcon,
};

function getEvidenceIcon(source: string | null | undefined) {
  return EVIDENCE_SOURCE_ICONS[source || "note"] || FileText;
}

function normalizeTag(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, "-");
}

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const CHAT_STORAGE_KEY_PREFIX = "pastDiscoveriesChat";
const LEGACY_CHAT_STORAGE_KEY = "pastDiscoveriesChat";

function chatStorageKey(userId: string | null | undefined): string {
  return userId
    ? `${CHAT_STORAGE_KEY_PREFIX}:${userId}`
    : CHAT_STORAGE_KEY_PREFIX;
}

function loadChat(userId: string | null | undefined): ChatMessage[] {
  try {
    const key = chatStorageKey(userId);
    let raw = localStorage.getItem(key);
    // One-time migration of the legacy un-namespaced cache so signed-in users
    // don't see an empty panel right after this change ships.
    if (!raw && userId) {
      const legacy = localStorage.getItem(LEGACY_CHAT_STORAGE_KEY);
      if (legacy) {
        raw = legacy;
        try {
          localStorage.setItem(key, legacy);
          localStorage.removeItem(LEGACY_CHAT_STORAGE_KEY);
        } catch {}
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is ChatMessage =>
        m &&
        typeof m.id === "string" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
      )
      .slice(-40);
  } catch {
    return [];
  }
}

function saveChat(userId: string | null | undefined, messages: ChatMessage[]) {
  try {
    localStorage.setItem(
      chatStorageKey(userId),
      JSON.stringify(messages.slice(-40)),
    );
  } catch {}
}

export default function PastDiscoveriesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [projectFilter, setProjectFilter] = usePastDiscoveriesFilter();
  const [filters, updateFilters, resetFilters] = usePastDiscoveriesFilters();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<FeatureCandidate | null>(null);
  const [form, setForm] = useState<ManualForm>(EMPTY_FORM);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [mergeNewTitle, setMergeNewTitle] = useState("");
  // Per-field merge strategy. "combine" lets the backend union/append values
  // (preferred default — preserves provenance like "Merged in: …" references).
  // A numeric id forces the field to use that source's exact value instead.
  type MergeFieldChoice = "combine" | number;
  const [mergeWhyNowChoice, setMergeWhyNowChoice] = useState<MergeFieldChoice>("combine");
  const [mergeSourceContextChoice, setMergeSourceContextChoice] = useState<MergeFieldChoice>("combine");

  const { user: authUser } = useAuth();
  const userId = authUser?.id ?? null;

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => loadChat(userId));

  // When the auth user resolves (or changes — e.g. account switch in the same
  // browser tab), always replace the in-memory thread with that user's
  // cache. Resetting unconditionally — including to an empty array — prevents
  // a previous user's messages from leaking into the new user's session and
  // then being persisted back under their key.
  useEffect(() => {
    setChatMessages(loadChat(userId));
  }, [userId]);

  // Hydrate from server-persisted chat history (chatSessions plumbing).
  // The localStorage cache from loadChat() shows instantly; this overrides
  // once the authoritative copy is fetched.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await apiRequest("/api/feature-candidates/chat-history");
        if (cancelled) return;
        if (Array.isArray(remote) && remote.length > 0) {
          setChatMessages(
            remote
              .filter(
                (m: any) =>
                  m && typeof m.id === "string" && typeof m.content === "string" &&
                  (m.role === "user" || m.role === "assistant"),
              )
              .map((m: any) => ({ id: m.id, role: m.role, content: m.content })),
          );
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [manageTagsOpen, setManageTagsOpen] = useState(false);

  useEffect(() => {
    saveChat(userId, chatMessages);
  }, [userId, chatMessages]);

  const scrollToDiscovery = (id: number) => {
    const el = document.querySelector(`[data-discovery-id="${id}"]`);
    if (el && el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-indigo-400");
      window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-indigo-400");
      }, 2000);
    }
  };

  const filterParam = projectFilter === "all" ? "all" : String(projectFilter);

  const { data: projects = [] } = useProjects() as { data: Project[] };

  const { data: candidates = [], isLoading } = useQuery<FeatureCandidate[]>({
    queryKey: ["/api/feature-candidates", { projectId: filterParam }],
    queryFn: async () => {
      const url =
        filterParam === "all"
          ? "/api/feature-candidates"
          : `/api/feature-candidates?projectId=${encodeURIComponent(filterParam)}`;
      return await apiRequest(url);
    },
  });

  const { data: evidenceLibrary = [] } = useQuery<EvidenceItem[]>({
    queryKey: ["/api/evidence"],
    queryFn: async () => {
      const res = await fetch("/api/evidence", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch evidence");
      return res.json();
    },
  });

  const { data: tagsData = [] } = useQuery<{ tag: string; count: number }[]>({
    queryKey: ["/api/feature-candidates/tags"],
    queryFn: async () => await apiRequest("/api/feature-candidates/tags"),
  });

  const evidenceById = useMemo(() => {
    const m = new Map<number, EvidenceItem>();
    for (const e of evidenceLibrary) m.set(e.id, e);
    return m;
  }, [evidenceLibrary]);

  const projectsById = useMemo(() => {
    const m = new Map<number, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const invalidateCandidates = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/feature-candidates"] });
    queryClient.invalidateQueries({ queryKey: ["/api/feature-candidates/tags"] });
  };

  const createManualMutation = useMutation({
    mutationFn: async (input: ManualForm) => {
      const projectId =
        input.projectId === "none" ? null : parseInt(input.projectId, 10);
      return await apiRequest("/api/feature-candidates", {
        method: "POST",
        body: JSON.stringify({
          source: "manual",
          featureTitle: input.featureTitle.trim(),
          whyNow: input.whyNow.trim() || null,
          sourceContext: input.sourceContext.trim() || null,
          projectId,
          evidenceItemIds: input.evidenceItemIds,
          tags: input.tags,
        }),
      });
    },
    onSuccess: () => {
      invalidateCandidates();
      toast({ title: "Discovery added", description: "Your discovery is now in the list." });
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
    mutationFn: async ({ id, input }: { id: number; input: ManualForm }) => {
      const projectId =
        input.projectId === "none" ? null : parseInt(input.projectId, 10);
      return await apiRequest(`/api/feature-candidates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          featureTitle: input.featureTitle.trim(),
          whyNow: input.whyNow.trim() || null,
          sourceContext: input.sourceContext.trim() || null,
          projectId,
          evidenceItemIds: input.evidenceItemIds,
          tags: input.tags,
        }),
      });
    },
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

  // Tag-only update — works for both manual and AI-extracted discoveries
  const updateTagsMutation = useMutation({
    mutationFn: async ({ id, tags }: { id: number; tags: string[] }) => {
      return await apiRequest(`/api/feature-candidates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ tags }),
      });
    },
    onSuccess: () => invalidateCandidates(),
    onError: (error: any) => {
      toast({
        title: "Couldn't update tags",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Per-item project assignment — used by the inline dropdown on each
  // discovery card so users can move a discovery to a different project (or
  // to "No project") without opening the edit dialog.
  const assignProjectMutation = useMutation({
    mutationFn: async ({ id, projectId }: { id: number; projectId: number | null }) => {
      return await apiRequest(`/api/feature-candidates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ projectId }),
      });
    },
    onSuccess: (_data, vars) => {
      invalidateCandidates();
      const name =
        vars.projectId == null
          ? "No project"
          : projectsById.get(vars.projectId)?.name || `Project #${vars.projectId}`;
      toast({ title: "Moved", description: `Assigned to ${name}.` });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't move discovery",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/feature-candidates/${id}`, { method: "DELETE" });
    },
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
    mutationFn: async (input: number | { id: number; existingProjectId?: number | null }) => {
      const id = typeof input === "number" ? input : input.id;
      const existingProjectId = typeof input === "number" ? null : (input.existingProjectId ?? null);
      return await apiRequest(`/api/feature-candidates/${id}/approve`, {
        method: "POST",
        body: JSON.stringify(existingProjectId ? { existingProjectId } : {}),
      });
    },
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

  const renameTagMutation = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      return await apiRequest("/api/feature-candidates/tags/rename", {
        method: "POST",
        body: JSON.stringify({ from, to }),
      });
    },
    onSuccess: () => {
      invalidateCandidates();
      toast({ title: "Tag renamed" });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't rename tag",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (tag: string) => {
      return await apiRequest(`/api/feature-candidates/tags/${encodeURIComponent(tag)}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      invalidateCandidates();
      // Drop the deleted tag from the active filter if present.
      toast({ title: "Tag removed everywhere" });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't delete tag",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  type MergeCanonicalPayload = {
    ids: number[];
    canonical: {
      primaryId: number;
      featureTitle?: string;
      whyNow?: string | null;
      sourceContext?: string | null;
    };
  };
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      return await apiRequest("/api/feature-candidates/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: (data: any) => {
      invalidateCandidates();
      toast({
        title: "Deleted",
        description: `Removed ${data?.deleted ?? 0} discoveries.`,
      });
      setSelectedIds(new Set());
      setSelectionMode(false);
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't delete",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const bulkTagMutation = useMutation({
    mutationFn: async (vars: { ids: number[]; tag: string; action: "add" | "remove" }) => {
      return await apiRequest("/api/feature-candidates/bulk-tag", {
        method: "POST",
        body: JSON.stringify(vars),
      });
    },
    onSuccess: (data: any) => {
      invalidateCandidates();
      toast({
        title: data?.action === "remove" ? "Tag removed" : "Tag added",
        description: `Updated ${data?.touched ?? 0} discoveries.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't update tag",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });
  const [bulkTagInput, setBulkTagInput] = useState("");

  const mergeMutation = useMutation({
    mutationFn: async (vars: MergeCanonicalPayload) => {
      return await apiRequest("/api/feature-candidates/merge", {
        method: "POST",
        body: JSON.stringify(vars),
      });
    },
    onSuccess: (data: any) => {
      invalidateCandidates();
      toast({
        title: "Merged",
        description: `Combined ${data?.mergedCount ?? 0} discoveries into one.`,
      });
      setMergeDialogOpen(false);
      setMergeTargetId(null);
      setMergeNewTitle("");
      setSelectedIds(new Set());
      setSelectionMode(false);
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't merge",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const openEditDialog = (candidate: FeatureCandidate) => {
    setEditingCandidate(candidate);
    setForm({
      featureTitle: candidate.featureTitle || "",
      whyNow: candidate.whyNow || "",
      sourceContext: candidate.sourceContext || "",
      projectId:
        candidate.projectId == null ? "none" : String(candidate.projectId),
      evidenceItemIds: Array.isArray(candidate.evidenceItemIds)
        ? candidate.evidenceItemIds
        : [],
      tags: Array.isArray(candidate.tags) ? candidate.tags : [],
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

  // Apply local filters (search / tags / source) on top of the project-scoped query result.
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (filters.source === "ai" && c.source === "manual") return false;
      if (filters.source === "manual" && c.source !== "manual") return false;
      if (filters.tags.length > 0) {
        const ct = (c.tags || []).map((t) => t.toLowerCase());
        if (!filters.tags.every((t) => ct.includes(t))) return false;
      }
      if (q) {
        const hay = [
          c.featureTitle,
          c.whyNow,
          c.sourceContext,
          ...(c.evidence || []),
          ...(c.tags || []),
        ]
          .filter(Boolean)
          .join(" \u0001 ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [candidates, filters]);

  const grouped = useMemo(() => {
    // Group by project; "No project" goes last
    const buckets = new Map<string, { name: string; items: FeatureCandidate[] }>();
    for (const c of filtered) {
      const key = c.projectId == null ? "__none" : String(c.projectId);
      const name =
        c.projectId == null
          ? "No project"
          : projectsById.get(c.projectId)?.name || `Project #${c.projectId}`;
      if (!buckets.has(key)) buckets.set(key, { name, items: [] });
      buckets.get(key)!.items.push(c);
    }
    const arr = Array.from(buckets.entries()).map(([key, v]) => ({ key, ...v }));
    arr.sort((a, b) => {
      if (a.key === "__none") return 1;
      if (b.key === "__none") return -1;
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [filtered, projectsById]);

  const manualCount = filtered.filter((c) => c.source === "manual").length;
  const aiCount = filtered.length - manualCount;

  const dialogOpen = showAddDialog || editingCandidate !== null;
  const isSubmitting =
    createManualMutation.isPending || updateManualMutation.isPending;

  const filterLabel =
    projectFilter === "all"
      ? "All projects"
      : projectsById.get(projectFilter as number)?.name || `Project #${projectFilter}`;

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startMerge = () => {
    if (selectedIds.size < 2) {
      toast({
        title: "Pick at least 2",
        description: "Select two or more discoveries to merge.",
        variant: "destructive",
      });
      return;
    }
    const ids = Array.from(selectedIds);
    setMergeTargetId(ids[0]);
    const target = candidates.find((c) => c.id === ids[0]);
    setMergeNewTitle(target?.featureTitle || "");
    // Default to "combine" so the backend unions descriptions and appends
    // provenance ("Merged in: …") into sourceContext.
    setMergeWhyNowChoice("combine");
    setMergeSourceContextChoice("combine");
    setMergeDialogOpen(true);
  };

  const confirmMerge = () => {
    if (mergeTargetId == null) return;
    const ids = Array.from(selectedIds);
    if (ids.length < 2) return;
    // Only send field overrides when the user explicitly picked a single
    // source. When the choice is "combine" we omit the field so the backend
    // performs its union/append behavior.
    const canonical: {
      primaryId: number;
      featureTitle?: string;
      whyNow?: string | null;
      sourceContext?: string | null;
    } = {
      primaryId: mergeTargetId,
      featureTitle: mergeNewTitle.trim() || undefined,
    };
    if (typeof mergeWhyNowChoice === "number") {
      const src = candidates.find((c) => c.id === mergeWhyNowChoice);
      canonical.whyNow = src?.whyNow ?? null;
    }
    if (typeof mergeSourceContextChoice === "number") {
      const src = candidates.find((c) => c.id === mergeSourceContextChoice);
      canonical.sourceContext = src?.sourceContext ?? null;
    }
    mergeMutation.mutate({ ids, canonical });
  };

  // Heuristic "likely duplicates" finder — same logic family as the server-side fuzzy match.
  const likelyDuplicates = useMemo(() => {
    const groups: FeatureCandidate[][] = [];
    const used = new Set<number>();
    const list = filtered;
    for (let i = 0; i < list.length; i++) {
      if (used.has(list[i].id)) continue;
      const a = list[i];
      const aTitle = (a.featureTitle || "").toLowerCase().trim();
      if (!aTitle) continue;
      const aWords = new Set(aTitle.split(/\s+/));
      const group: FeatureCandidate[] = [a];
      for (let j = i + 1; j < list.length; j++) {
        if (used.has(list[j].id)) continue;
        const b = list[j];
        const bTitle = (b.featureTitle || "").toLowerCase().trim();
        if (!bTitle) continue;
        if (aTitle === bTitle) {
          group.push(b);
          continue;
        }
        const shorter = aTitle.length < bTitle.length ? aTitle : bTitle;
        const longer = aTitle.length < bTitle.length ? bTitle : aTitle;
        if (shorter.length > 5 && longer.includes(shorter)) {
          group.push(b);
          continue;
        }
        const bWords = new Set(bTitle.split(/\s+/));
        const inter = Array.from(aWords).filter((w) => bWords.has(w));
        const uni = new Set([...Array.from(aWords), ...Array.from(bWords)]);
        if (uni.size > 0 && inter.length / uni.size >= 0.6) {
          group.push(b);
        }
      }
      if (group.length > 1) {
        group.forEach((g) => used.add(g.id));
        groups.push(group);
      }
    }
    return groups;
  }, [filtered]);

  const selectGroupForMerge = (group: FeatureCandidate[]) => {
    setSelectionMode(true);
    setSelectedIds(new Set(group.map((g) => g.id)));
    toast({
      title: `Selected ${group.length} likely duplicates`,
      description: "Review the selection and click Merge to combine them.",
    });
  };

  // Chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatStreaming]);

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatStreaming) return;
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const assistantId = `a-${Date.now()}`;
    setChatMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setChatInput("");
    setChatStreaming(true);

    try {
      const response = await fetch("/api/feature-candidates/chat-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: text,
          chatHistory: chatMessages.slice(-10),
          scope: {
            projectId: projectFilter,
            tags: filters.tags,
            source: filters.source,
            q: filters.search,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Failed to start chat");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "text") {
              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + (event.content || "") }
                    : m,
                ),
              );
            } else if (event.type === "error") {
              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: event.content || "Something went wrong." }
                    : m,
                ),
              );
            } else if (event.type === "context_trimmed") {
              // Soft note appended once at end of message
              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId && !m.content.includes("(some sources were trimmed)")
                    ? { ...m, content: m.content + "\n\n_(some sources were trimmed to fit the model)_" }
                    : m,
                ),
              );
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: err?.message || "Couldn't reach the assistant." }
            : m,
        ),
      );
    } finally {
      setChatStreaming(false);
    }
  };

  return (
    <div className="container mx-auto p-4 lg:p-6 max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Lightbulb className="h-6 w-6 text-orange-500" />
            Past Discoveries
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Browse, score, group, and chat with the feature candidates across your projects.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setChatOpen(true)}
            data-testid="button-open-discoveries-chat"
          >
            <Bot className="h-4 w-4 mr-1.5 text-indigo-500" />
            Ask about discoveries
          </Button>
          <Button
            onClick={() => {
              setForm({
                ...EMPTY_FORM,
                projectId:
                  projectFilter === "all" ? "none" : String(projectFilter),
              });
              setShowAddDialog(true);
            }}
            className="bg-indigo-500 hover:bg-indigo-600 text-white"
            data-testid="button-add-discovery"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add discovery
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="mb-4">
        <CardContent className="p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <div className="flex items-center gap-1.5">
              <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
              <Select
                value={projectFilter === "all" ? "all" : String(projectFilter)}
                onValueChange={(value) => {
                  if (value === "all") setProjectFilter("all");
                  else setProjectFilter(parseInt(value, 10));
                }}
              >
                <SelectTrigger className="w-[180px] h-8 text-sm" data-testid="select-project-filter">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Select
              value={filters.source}
              onValueChange={(v) => {
                if (v === "all" || v === "ai" || v === "manual") {
                  updateFilters({ source: v });
                }
              }}
            >
              <SelectTrigger className="w-[140px] h-8 text-sm" data-testid="select-source-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="ai">AI-extracted</SelectItem>
                <SelectItem value="manual">Manually added</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={filters.search}
                onChange={(e) => updateFilters({ search: e.target.value })}
                placeholder="Search title, why-now, evidence…"
                className="h-8 pl-7 text-sm"
                data-testid="input-search-discoveries"
              />
            </div>
            <Button
              variant={selectionMode ? "default" : "outline"}
              size="sm"
              className={selectionMode ? "bg-indigo-500 hover:bg-indigo-600 text-white h-8" : "h-8"}
              onClick={() => {
                setSelectionMode((v) => {
                  if (v) setSelectedIds(new Set());
                  return !v;
                });
              }}
              data-testid="button-toggle-merge"
            >
              <GitMerge className="h-3.5 w-3.5 mr-1" />
              {selectionMode ? "Done" : "Merge"}
            </Button>
            {(filters.tags.length > 0 || filters.search || filters.source !== "all") && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-500" onClick={resetFilters}>
                Clear
              </Button>
            )}
          </div>

          {/* Tag chips */}
          {tagsData.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pt-1">
              <TagIcon className="h-3 w-3 text-slate-400" />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] text-slate-500 hover:text-indigo-600"
                onClick={() => setManageTagsOpen(true)}
                data-testid="button-manage-tags"
              >
                <Settings2 className="h-3 w-3 mr-1" />
                Manage
              </Button>
              {tagsData.map(({ tag, count }) => {
                const active = filters.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? filters.tags.filter((t) => t !== tag)
                        : [...filters.tags, tag];
                      updateFilters({ tags: next });
                    }}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      active
                        ? "bg-indigo-500 border-indigo-500 text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                    }`}
                    data-testid={`button-filter-tag-${tag}`}
                  >
                    {tag}
                    <span className={active ? "text-indigo-100" : "text-slate-400"}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mb-3 flex items-center gap-2 text-xs text-slate-500 flex-wrap">
        <Badge variant="outline" className="gap-1">
          {filtered.length} of {candidates.length} discoveries
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Sparkles className="h-3 w-3" /> {aiCount} AI
        </Badge>
        <Badge variant="outline" className="gap-1">
          <UserPen className="h-3 w-3" /> {manualCount} Manual
        </Badge>
        <span className="text-slate-400">in {filterLabel}</span>
      </div>

      {/* Likely duplicates banner */}
      {likelyDuplicates.length > 0 && !selectionMode && (
        <Card className="mb-4 border-amber-200 bg-amber-50/50">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-800">
              <GitMerge className="h-3.5 w-3.5" />
              {likelyDuplicates.length} likely duplicate group{likelyDuplicates.length > 1 ? "s" : ""} found
            </div>
            <div className="space-y-1">
              {likelyDuplicates.slice(0, 3).map((group, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex-1 text-slate-700 truncate">
                    <span className="text-slate-500">{group.length}× </span>
                    {group.map((g) => g.featureTitle).join(" · ")}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px] border-amber-300 text-amber-800 hover:bg-amber-100"
                    onClick={() => selectGroupForMerge(group)}
                  >
                    Select to merge
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="py-16 flex items-center justify-center text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading discoveries…
          </CardContent>
        </Card>
      ) : candidates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-center py-14">
            <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center mx-auto mb-4">
              <Lightbulb className="h-7 w-7 text-orange-300" />
            </div>
            <h3 className="text-base font-medium text-slate-700 mb-1">
              No discoveries yet
            </h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mb-5">
              {projectFilter === "all"
                ? "Discoveries will appear here as you analyze transcripts and feedback, or add your own ideas."
                : "Nothing for this project yet. Add your first discovery to get started."}
            </p>
            <Button
              onClick={() => {
                setForm({
                  ...EMPTY_FORM,
                  projectId:
                    projectFilter === "all" ? "none" : String(projectFilter),
                });
                setShowAddDialog(true);
              }}
              className="bg-indigo-500 hover:bg-indigo-600 text-white"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add discovery
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-center py-10">
            <p className="text-sm text-slate-500">
              No discoveries match the current filters.
            </p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={resetFilters}>
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <PriorityMatrix candidates={filtered as any} />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-orange-500" />
                Discoveries
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea
                className={
                  filtered.length > 12
                    ? "h-[70vh] max-h-[900px]"
                    : ""
                }
              >
              <div className="p-4 space-y-6">
                {grouped.map((group) => (
                  <div key={group.key} className="space-y-3">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                      <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
                      {group.name}
                      <span className="text-slate-400 normal-case font-normal">
                        ({group.items.length})
                      </span>
                    </div>
                    {group.items.map((candidate) => {
                      const isManual = candidate.source === "manual";
                      const projectName = candidate.projectId
                        ? projectsById.get(candidate.projectId)?.name
                        : null;
                      return (
                        <div
                          key={candidate.id}
                          data-discovery-id={candidate.id}
                          className="space-y-1 rounded-lg transition-shadow"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              {isManual ? (
                                <Badge
                                  variant="outline"
                                  className="bg-violet-50 text-violet-700 border-violet-200 gap-1 text-[10px]"
                                  data-testid={`badge-manual-${candidate.id}`}
                                >
                                  <UserPen className="h-2.5 w-2.5" />
                                  Manually added
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-blue-50 text-blue-700 border-blue-200 gap-1 text-[10px]"
                                >
                                  <Sparkles className="h-2.5 w-2.5" />
                                  AI
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-wrap">
                              <InlineTagEditor
                                tags={candidate.tags || []}
                                allTags={tagsData.map((t) => t.tag)}
                                onChange={(tags) =>
                                  updateTagsMutation.mutate({ id: candidate.id, tags })
                                }
                              />
                              {/* Inline project assignment — works for both
                                  manual and AI-extracted discoveries. */}
                              <Select
                                value={
                                  candidate.projectId == null
                                    ? "none"
                                    : String(candidate.projectId)
                                }
                                onValueChange={(value) => {
                                  const next =
                                    value === "none" ? null : parseInt(value, 10);
                                  if (next === (candidate.projectId ?? null)) return;
                                  assignProjectMutation.mutate({
                                    id: candidate.id,
                                    projectId: next,
                                  });
                                }}
                              >
                                <SelectTrigger
                                  className="h-7 w-[150px] text-xs"
                                  data-testid={`select-assign-project-${candidate.id}`}
                                  aria-label="Assign to project"
                                >
                                  <FolderOpen className="h-3 w-3 mr-1 text-slate-400" />
                                  <SelectValue placeholder="No project" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No project</SelectItem>
                                  {projects.map((p) => (
                                    <SelectItem key={p.id} value={String(p.id)}>
                                      {p.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-slate-500 hover:text-slate-700"
                                onClick={() => openEditDialog(candidate)}
                                data-testid={`button-edit-${candidate.id}`}
                              >
                                <PencilLine className="h-3.5 w-3.5 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-red-500 hover:text-red-700"
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
                          </div>
                          <FeatureCandidateCard
                            candidate={candidate as any}
                            onApprove={(id, existingProjectId) =>
                              approveMutation.mutate({ id, existingProjectId })
                            }
                            onDelete={(id) => deleteMutation.mutate(id)}
                            isApproving={approveMutation.isPending}
                            projectName={projectName || undefined}
                            selectable={selectionMode}
                            selected={selectedIds.has(candidate.id)}
                            onSelectionChange={(id, sel) => {
                              if (sel) {
                                setSelectedIds((prev) => new Set(prev).add(id));
                              } else {
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  next.delete(id);
                                  return next;
                                });
                              }
                            }}
                            onTagClick={(tag) => {
                              if (!filters.tags.includes(tag)) {
                                updateFilters({ tags: [...filters.tags, tag] });
                              }
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sticky bulk action bar — Merge / Tag / Delete */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-white rounded-full shadow-lg border border-indigo-200 px-4 py-2 flex items-center gap-2 flex-wrap max-w-[calc(100vw-2rem)]">
          <span className="text-sm font-medium text-slate-700">
            {selectedIds.size} selected
          </span>
          <Button
            size="sm"
            className="bg-indigo-500 hover:bg-indigo-600 text-white h-7 text-xs"
            onClick={startMerge}
            disabled={selectedIds.size < 2 || mergeMutation.isPending}
            data-testid="button-start-merge"
          >
            <GitMerge className="h-3.5 w-3.5 mr-1" />
            Merge
          </Button>
          {/* Bulk tag controls */}
          <div className="flex items-center gap-1">
            <Input
              value={bulkTagInput}
              onChange={(e) => setBulkTagInput(e.target.value)}
              placeholder="tag"
              className="h-7 w-24 text-xs"
              data-testid="input-bulk-tag"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={!bulkTagInput.trim() || bulkTagMutation.isPending}
              onClick={() => {
                const tag = bulkTagInput.trim().toLowerCase();
                if (!tag) return;
                bulkTagMutation.mutate({
                  ids: Array.from(selectedIds),
                  tag,
                  action: "add",
                });
                setBulkTagInput("");
              }}
              data-testid="button-bulk-tag-add"
            >
              <TagIcon className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-slate-600"
              disabled={!bulkTagInput.trim() || bulkTagMutation.isPending}
              onClick={() => {
                const tag = bulkTagInput.trim().toLowerCase();
                if (!tag) return;
                bulkTagMutation.mutate({
                  ids: Array.from(selectedIds),
                  tag,
                  action: "remove",
                });
                setBulkTagInput("");
              }}
              data-testid="button-bulk-tag-remove"
            >
              Remove
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
            disabled={bulkDeleteMutation.isPending}
            onClick={() => {
              if (
                confirm(`Delete ${selectedIds.size} discoveries? This cannot be undone.`)
              ) {
                bulkDeleteMutation.mutate(Array.from(selectedIds));
              }
            }}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => {
              setSelectedIds(new Set());
              setSelectionMode(false);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Add / Edit dialog */}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCandidate ? "Edit discovery" : "Add a new discovery"}
            </DialogTitle>
            <DialogDescription>
              {editingCandidate
                ? "Update the details for this manually added discovery."
                : "Capture an idea or insight that should be considered alongside AI-extracted ones."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="discovery-title">Title</Label>
              <Input
                id="discovery-title"
                value={form.featureTitle}
                onChange={(e) =>
                  setForm((f) => ({ ...f, featureTitle: e.target.value }))
                }
                placeholder="e.g. Add weekly digest email"
                data-testid="input-discovery-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="discovery-why">Description</Label>
              <Textarea
                id="discovery-why"
                rows={3}
                value={form.whyNow}
                onChange={(e) =>
                  setForm((f) => ({ ...f, whyNow: e.target.value }))
                }
                placeholder="What's the opportunity or problem this addresses?"
                data-testid="input-discovery-why"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="discovery-source">Source / notes (optional)</Label>
              <Textarea
                id="discovery-source"
                rows={2}
                value={form.sourceContext}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sourceContext: e.target.value }))
                }
                placeholder="Where did this come from? Any links or context?"
                data-testid="input-discovery-source"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="discovery-project">Project</Label>
              <Select
                value={form.projectId}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, projectId: value as ManualForm["projectId"] }))
                }
              >
                <SelectTrigger id="discovery-project" data-testid="select-discovery-project">
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <TagComposer
                value={form.tags}
                allTags={tagsData.map((t) => t.tag)}
                onChange={(tags) => setForm((f) => ({ ...f, tags }))}
              />
            </div>
            <EvidencePicker
              evidenceLibrary={evidenceLibrary}
              selectedIds={form.evidenceItemIds}
              onChange={(ids) =>
                setForm((f) => ({ ...f, evidenceItemIds: ids }))
              }
              query={`${form.featureTitle} ${form.whyNow}`}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowAddDialog(false);
                setEditingCandidate(null);
                setForm(EMPTY_FORM);
              }}
              disabled={isSubmitting}
            >
              <X className="h-4 w-4 mr-1.5" />
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !form.featureTitle.trim()}
              className="bg-indigo-500 hover:bg-indigo-600 text-white"
              data-testid="button-save-discovery"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              {editingCandidate ? "Save changes" : "Add discovery"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-indigo-500" />
              Merge {selectedIds.size} discoveries
            </DialogTitle>
            <DialogDescription>
              Choose which discovery to keep. Evidence, tags, and tasks from the others will be combined into it; the others will be archived.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Keep this one as the primary</Label>
              <Select
                value={mergeTargetId == null ? "" : String(mergeTargetId)}
                onValueChange={(v) => {
                  const id = parseInt(v, 10);
                  setMergeTargetId(id);
                  const t = candidates.find((c) => c.id === id);
                  if (t) setMergeNewTitle(t.featureTitle);
                  // Changing primary keeps "combine" as the per-field default
                  // — the user can still pick a specific source below.
                  setMergeWhyNowChoice("combine");
                  setMergeSourceContextChoice("combine");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select primary" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(selectedIds).map((id) => {
                    const c = candidates.find((x) => x.id === id);
                    if (!c) return null;
                    return (
                      <SelectItem key={id} value={String(id)}>
                        {c.featureTitle}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="merge-title">Merged title</Label>
              <Input
                id="merge-title"
                value={mergeNewTitle}
                onChange={(e) => setMergeNewTitle(e.target.value)}
                placeholder="Title for the merged discovery"
              />
            </div>
            {/* Per-field conflict resolution: pick which discovery's text to keep */}
            {(() => {
              const idsArr = Array.from(selectedIds);
              const whyNowChoices = idsArr
                .map((id) => candidates.find((c) => c.id === id))
                .filter((c): c is FeatureCandidate => !!c && !!c.whyNow && c.whyNow.trim().length > 0);
              const sourceCtxChoices = idsArr
                .map((id) => candidates.find((c) => c.id === id))
                .filter(
                  (c): c is FeatureCandidate =>
                    !!c && !!c.sourceContext && c.sourceContext.trim().length > 0,
                );
              if (whyNowChoices.length < 2 && sourceCtxChoices.length < 2) return null;
              return (
                <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2 space-y-2">
                  <p className="text-[11px] uppercase tracking-wider text-amber-700">
                    Resolve conflicts
                  </p>
                  {whyNowChoices.length >= 2 && (
                    <div className="space-y-1">
                      <Label className="text-xs">"Why now"</Label>
                      <Select
                        value={
                          mergeWhyNowChoice === "combine"
                            ? "combine"
                            : String(mergeWhyNowChoice)
                        }
                        onValueChange={(v) =>
                          setMergeWhyNowChoice(
                            v === "combine" ? "combine" : parseInt(v, 10),
                          )
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="combine">
                            Combine all (default)
                          </SelectItem>
                          {whyNowChoices.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              Use only #{c.id} — {(c.whyNow || "").slice(0, 50)}
                              {(c.whyNow || "").length > 50 ? "…" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {sourceCtxChoices.length >= 2 && (
                    <div className="space-y-1">
                      <Label className="text-xs">"Source context"</Label>
                      <Select
                        value={
                          mergeSourceContextChoice === "combine"
                            ? "combine"
                            : String(mergeSourceContextChoice)
                        }
                        onValueChange={(v) =>
                          setMergeSourceContextChoice(
                            v === "combine" ? "combine" : parseInt(v, 10),
                          )
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="combine">
                            Combine + add "Merged in" references (default)
                          </SelectItem>
                          {sourceCtxChoices.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              Use only #{c.id} — {(c.sourceContext || "").slice(0, 50)}
                              {(c.sourceContext || "").length > 50 ? "…" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Side-by-side preview */}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2 max-h-72 overflow-auto">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">
                Side-by-side preview
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Array.from(selectedIds).map((id) => {
                  const c = candidates.find((x) => x.id === id);
                  if (!c) return null;
                  const isPrimary = id === mergeTargetId;
                  return (
                    <div
                      key={id}
                      className={`rounded border p-2 text-[11px] ${
                        isPrimary
                          ? "border-indigo-400 bg-indigo-50/60"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wider ${
                            isPrimary ? "text-indigo-600" : "text-slate-500"
                          }`}
                        >
                          {isPrimary ? "Primary (kept)" : "Will be merged in"}
                        </span>
                        {!isPrimary && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-5 px-1.5 text-[10px] text-indigo-600"
                            onClick={() => {
                              setMergeTargetId(id);
                              setMergeNewTitle(c.featureTitle);
                            }}
                          >
                            Make primary
                          </Button>
                        )}
                      </div>
                      <div className="font-medium text-slate-800 truncate" title={c.featureTitle}>
                        {c.featureTitle}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-500">
                        {c.riceScore != null && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5">
                            RICE {c.riceScore}
                          </span>
                        )}
                        {c.impactScore != null && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5">
                            I{c.impactScore}
                          </span>
                        )}
                        {c.effortScore != null && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5">
                            E{c.effortScore}
                          </span>
                        )}
                        {c.confidenceScore != null && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5">
                            C{c.confidenceScore}
                          </span>
                        )}
                        {Array.isArray(c.tags) &&
                          c.tags.map((t: string) => (
                            <span
                              key={t}
                              className="rounded bg-sky-50 text-sky-700 px-1.5 py-0.5"
                            >
                              #{t}
                            </span>
                          ))}
                      </div>
                      {c.whyNow && (
                        <p className="mt-1 text-slate-600 line-clamp-3">{c.whyNow}</p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-slate-500 leading-snug">
                On merge: scores take the max across the set, RICE is recomputed, the earliest
                creation date is preserved, and the source titles are appended to the primary's
                source context.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMergeDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmMerge}
              disabled={mergeMutation.isPending || mergeTargetId == null}
              className="bg-indigo-500 hover:bg-indigo-600 text-white"
              data-testid="button-confirm-merge"
            >
              {mergeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <GitMerge className="h-4 w-4 mr-1.5" />
              )}
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chat slide-over */}
      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <SheetHeader className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-start justify-between gap-2">
              <div>
                <SheetTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-5 w-5 text-indigo-500" />
                  Chat with your discoveries
                </SheetTitle>
                <SheetDescription className="text-xs">
                  Ask about themes, find duplicates, suggest tags, or summarize what users keep
                  asking for. Filters above scope the context.
                </SheetDescription>
              </div>
              {chatMessages.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-slate-500 hover:text-indigo-600 shrink-0"
                  onClick={async () => {
                    if (chatStreaming) return;
                    setChatMessages([]);
                    try {
                      localStorage.removeItem(chatStorageKey(userId));
                    } catch {}
                    try {
                      await apiRequest("/api/feature-candidates/chat-history", {
                        method: "DELETE",
                      });
                    } catch {}
                  }}
                  data-testid="button-new-chat"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  New chat
                </Button>
              )}
            </div>
          </SheetHeader>
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {chatMessages.length === 0 ? (
              <div className="text-xs text-slate-500 space-y-3">
                <p>Try one of these:</p>
                {[
                  "What are the top 3 themes across my discoveries?",
                  "Which ones look like duplicates I should merge?",
                  "Suggest tags I could add to organize these.",
                  "What's the highest-impact quick win right now?",
                ].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setChatInput(s)}
                    className="w-full text-left rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              chatMessages.map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-3.5 w-3.5 text-indigo-600" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-indigo-500 text-white"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {m.content ? (
                      m.role === "assistant" ? (
                        <CitedMessage
                          content={m.content}
                          onCiteClick={(id) => scrollToDiscovery(id)}
                        />
                      ) : (
                        m.content
                      )
                    ) : (
                      <span className="inline-flex items-center text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        thinking…
                      </span>
                    )}
                  </div>
                  {m.role === "user" && (
                    <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                      <UserIcon className="h-3.5 w-3.5 text-slate-600" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="border-t border-slate-100 p-3">
            <div className="flex gap-2">
              <Textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendChat();
                  }
                }}
                placeholder="Ask a question…"
                rows={2}
                className="resize-none text-sm"
                data-testid="input-discoveries-chat"
              />
              <Button
                onClick={sendChat}
                disabled={chatStreaming || !chatInput.trim()}
                className="bg-indigo-500 hover:bg-indigo-600 text-white self-end"
                data-testid="button-send-discoveries-chat"
              >
                {chatStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Scoped to: {filterLabel}
              {filters.tags.length > 0 ? ` · tags: ${filters.tags.join(", ")}` : ""}
              {filters.source !== "all" ? ` · ${filters.source}` : ""}
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Manage tags dialog */}
      <Dialog open={manageTagsOpen} onOpenChange={setManageTagsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-indigo-500" />
              Manage tags
            </DialogTitle>
            <DialogDescription>
              Rename or remove tags across all discoveries at once.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-1 py-2">
            {tagsData.length === 0 && (
              <p className="text-sm text-slate-500 px-1">No tags yet.</p>
            )}
            {tagsData.map(({ tag, count }) => (
              <ManageTagRow
                key={tag}
                tag={tag}
                count={count}
                disabled={renameTagMutation.isPending || deleteTagMutation.isPending}
                onRename={(next) => {
                  const target = normalizeTag(next);
                  if (!target || target === tag) return;
                  renameTagMutation.mutate({ from: tag, to: target });
                }}
                onDelete={() => {
                  if (
                    confirm(`Remove "${tag}" from all ${count} discoveries? This can't be undone.`)
                  ) {
                    deleteTagMutation.mutate(tag);
                    if (filters.tags.includes(tag)) {
                      updateFilters({ tags: filters.tags.filter((t) => t !== tag) });
                    }
                  }
                }}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setManageTagsOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ManageTagRowProps {
  tag: string;
  count: number;
  disabled: boolean;
  onRename: (next: string) => void;
  onDelete: () => void;
}

function ManageTagRow({ tag, count, disabled, onRename, onDelete }: ManageTagRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tag);
  if (editing) {
    return (
      <div className="flex items-center gap-1 px-1 py-1">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onRename(draft);
              setEditing(false);
            } else if (e.key === "Escape") {
              setEditing(false);
              setDraft(tag);
            }
          }}
          className="h-7 text-xs"
        />
        <Button
          size="sm"
          className="h-7 text-xs bg-indigo-500 hover:bg-indigo-600 text-white"
          onClick={() => {
            onRename(draft);
            setEditing(false);
          }}
          disabled={disabled}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => {
            setEditing(false);
            setDraft(tag);
          }}
        >
          Cancel
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-slate-50">
      <div className="flex items-center gap-2 min-w-0">
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 text-[11px] font-medium">
          #{tag}
        </span>
        <span className="text-[11px] text-slate-500">{count} use{count === 1 ? "" : "s"}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => setEditing(true)}
          disabled={disabled}
          data-testid={`button-rename-tag-${tag}`}
        >
          <PencilLine className="h-3 w-3 mr-1" />
          Rename
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-red-500 hover:text-red-700"
          onClick={onDelete}
          disabled={disabled}
          data-testid={`button-delete-tag-${tag}`}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

interface CitedMessageProps {
  content: string;
  onCiteClick: (id: number) => void;
}

function CitedMessage({ content, onCiteClick }: CitedMessageProps) {
  // Split on [#<id>] and [E#<id>] tokens, render the discovery ones as
  // clickable buttons that scroll to the matching card in the list.
  const parts = content.split(/(\[#\d+\]|\[E#\d+\])/g);
  return (
    <span>
      {parts.map((part, i) => {
        const discoveryMatch = /^\[#(\d+)\]$/.exec(part);
        if (discoveryMatch) {
          const id = parseInt(discoveryMatch[1], 10);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onCiteClick(id)}
              className="inline-flex items-center rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-1 py-0 mx-0.5 text-[11px] font-medium align-baseline"
              data-testid={`citation-${id}`}
              title={`Jump to discovery #${id}`}
            >
              #{id}
            </button>
          );
        }
        const evidenceMatch = /^\[E#(\d+)\]$/.exec(part);
        if (evidenceMatch) {
          return (
            <span
              key={i}
              className="inline-flex items-center rounded bg-amber-50 text-amber-700 px-1 py-0 mx-0.5 text-[11px] font-medium align-baseline"
              title="Grounded in evidence"
            >
              E{evidenceMatch[1]}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

interface InlineTagEditorProps {
  tags: string[];
  allTags: string[];
  onChange: (tags: string[]) => void;
}

function InlineTagEditor({ tags, allTags, onChange }: InlineTagEditorProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs text-slate-500 hover:text-indigo-600"
        onClick={() => setOpen((v) => !v)}
      >
        <TagIcon className="h-3.5 w-3.5 mr-1" />
        {tags.length > 0 ? `${tags.length} tag${tags.length === 1 ? "" : "s"}` : "Tag"}
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 z-30 rounded-md border border-slate-200 bg-white shadow-lg p-2">
          <TagComposer value={tags} allTags={allTags} onChange={onChange} />
          <div className="flex justify-end mt-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface TagComposerProps {
  value: string[];
  allTags: string[];
  onChange: (tags: string[]) => void;
}

function TagComposer({ value, allTags, onChange }: TagComposerProps) {
  const [draft, setDraft] = useState("");

  const addTag = (raw: string) => {
    const t = normalizeTag(raw);
    if (!t) return;
    if (value.includes(t)) return;
    onChange([...value, t]);
    setDraft("");
  };

  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    return allTags
      .filter((t) => !value.includes(t))
      .filter((t) => (q ? t.includes(q) : true))
      .slice(0, 6);
  }, [allTags, value, draft]);

  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((t) => (
            <Badge
              key={t}
              variant="outline"
              className="bg-sky-50 text-sky-700 border-sky-200 gap-1 pr-1"
            >
              <TagIcon className="h-2.5 w-2.5" />
              {t}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== t))}
                className="rounded-full hover:bg-sky-100 p-0.5"
                aria-label={`Remove ${t}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag(draft);
          } else if (e.key === "Backspace" && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        placeholder="Add a tag (Enter to add)"
        className="h-7 text-xs"
        data-testid="input-tag-composer"
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addTag(t)}
              className="text-[10px] rounded-full border border-slate-200 px-2 py-0.5 text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors"
            >
              + {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface EvidencePickerProps {
  evidenceLibrary: EvidenceItem[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  query?: string;
}

function EvidencePicker({
  evidenceLibrary,
  selectedIds,
  onChange,
  query = "",
}: EvidencePickerProps) {
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const suggestions = useMemo(() => {
    return findMatchingEvidence(query, evidenceLibrary, 8).filter(
      (ev) => !selectedSet.has(ev.id),
    ).slice(0, 5);
  }, [query, evidenceLibrary, selectedSet]);

  const selectedItems = useMemo(() => {
    const byId = new Map(evidenceLibrary.map((e) => [e.id, e]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((e): e is EvidenceItem => Boolean(e));
  }, [evidenceLibrary, selectedIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return evidenceLibrary
      .filter((ev) => {
        if (!q) return true;
        return (
          ev.title.toLowerCase().includes(q) ||
          ev.content.toLowerCase().includes(q) ||
          (ev.tags || []).some((t) => t.toLowerCase().includes(q))
        );
      })
      .slice(0, 50);
  }, [evidenceLibrary, search]);

  const toggle = (id: number) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5 text-slate-500" />
          Linked evidence (optional)
        </Label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-indigo-600 hover:text-indigo-700"
          onClick={() => setPickerOpen((v) => !v)}
          data-testid="button-toggle-evidence-picker"
        >
          {pickerOpen ? "Done" : "Attach evidence"}
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div
          className="rounded-md border border-amber-200 bg-amber-50/60 p-2 space-y-1.5"
          data-testid="section-suggested-evidence"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-800">
            <Sparkles className="h-3 w-3" />
            Suggested evidence based on what you've typed
          </div>
          <div className="space-y-1">
            {suggestions.map((ev) => {
              const Icon = getEvidenceIcon(ev.source);
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onChange([...selectedIds, ev.id])}
                  className="w-full text-left px-2 py-1.5 rounded-md flex items-start gap-2 bg-white hover:bg-amber-100/60 border border-transparent hover:border-amber-200 transition-colors"
                  data-testid={`button-suggested-evidence-${ev.id}`}
                >
                  <Plus className="h-3.5 w-3.5 mt-0.5 text-amber-600 flex-shrink-0" />
                  <Icon className="h-3.5 w-3.5 mt-0.5 text-slate-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700 truncate">
                      {ev.title}
                    </p>
                    <p className="text-[11px] text-slate-500 line-clamp-1">
                      {ev.content}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedItems.map((ev) => {
            const Icon = getEvidenceIcon(ev.source);
            return (
              <Badge
                key={ev.id}
                variant="outline"
                className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 pr-1"
                data-testid={`badge-attached-evidence-${ev.id}`}
              >
                <Icon className="h-3 w-3" />
                <span className="max-w-[180px] truncate">{ev.title}</span>
                <button
                  type="button"
                  onClick={() => toggle(ev.id)}
                  className="rounded-full hover:bg-emerald-100 p-0.5"
                  aria-label={`Detach ${ev.title}`}
                  data-testid={`button-detach-evidence-${ev.id}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      {pickerOpen && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 space-y-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your evidence library…"
              className="h-8 pl-7 text-sm"
              data-testid="input-evidence-search"
            />
          </div>
          <ScrollArea className="h-48">
            <div className="space-y-1">
              {filtered.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">
                  {evidenceLibrary.length === 0
                    ? "No evidence in your library yet. Add notes, transcripts, or files in the Evidence Library to link them here."
                    : "No matches. Try a different search."}
                </p>
              ) : (
                filtered.map((ev) => {
                  const Icon = getEvidenceIcon(ev.source);
                  const isSelected = selectedSet.has(ev.id);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => toggle(ev.id)}
                      className={`w-full text-left px-2 py-1.5 rounded-md flex items-start gap-2 transition-colors ${
                        isSelected
                          ? "bg-indigo-100 hover:bg-indigo-200"
                          : "bg-white hover:bg-slate-100"
                      }`}
                      data-testid={`button-evidence-option-${ev.id}`}
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          isSelected
                            ? "bg-indigo-500 border-indigo-500 text-white"
                            : "border-slate-300"
                        }`}
                      >
                        {isSelected && (
                          <svg
                            viewBox="0 0 12 12"
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
                          </svg>
                        )}
                      </div>
                      <Icon className="h-3.5 w-3.5 mt-0.5 text-slate-500 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-700 truncate">
                          {ev.title}
                        </p>
                        <p className="text-[11px] text-slate-500 line-clamp-1">
                          {ev.content}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

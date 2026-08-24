import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Lightbulb,
  CheckCircle,
  Check,
  Trash2,
  ArrowRight,
  FileText,
  Database,
  ListTodo,
  Code2,
  Sparkles,
  Terminal,
  Cpu,
  Heart,
  Clock,
  Flame,
  Tag as TagIcon,
  ChevronDown,
  ChevronUp,
  Link2,
  FolderPlus,
  Folder,
  Search,
  MessageSquare,
  MessagesSquare,
  StickyNote,
  ExternalLink,
  Send,
  Loader2,
} from "lucide-react";
import { SiJira, SiTrello, SiAsana } from "react-icons/si";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { SendToAgentDialog } from "./SendToAgentDialog";
import { FeatureRefinementDialog } from "./FeatureRefinementDialog";
import { CODING_AGENTS } from "@/lib/agentPrompt";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FeatureCandidateCardProps {
  candidate: {
    id: number;
    featureTitle: string;
    whyNow: string | null;
    evidence: string[] | null;
    evidenceItemIds?: number[] | null;
    evidenceQuotes?: string[] | null;
    sourceConversationIds?: number[] | null;
    sourceConversationQuotes?: string[] | null;
    sourceContext?: string | null;
    projectId?: number | null;
    uiChanges: string | null;
    dataModelChanges: string | null;
    workflowChanges: string | null;
    tasks: any;
    status: string | null;
    lastSentToAgent?: string | null;
    lastSentAt?: string | null;
    mentionCount?: number | null;
    tags?: string[] | null;
  };
  onApprove: (id: number, existingProjectId?: number | null) => void;
  onDelete: (id: number) => void;
  isApproving?: boolean;
  projectName?: string;
  projectDescription?: string;
  selectable?: boolean;
  selected?: boolean;
  onSelectionChange?: (id: number, selected: boolean) => void;
  onTagClick?: (tag: string) => void;
}

const agentIcons: Record<string, typeof Code2> = {
  replit: Terminal,
  "claude-code": Code2,
  cursor: Cpu,
  lovable: Heart,
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

interface EvidenceItem {
  id: number;
  title: string;
  content?: string | null;
  source?: string | null;
  sourceId?: number | null;
  sourceConversationId?: number | null;
}

interface JiraIntegrationLite {
  id: number;
  isActive?: boolean | null;
  jiraUrl?: string | null;
}

interface JiraProjectLite {
  key: string;
  name: string;
}

const SOURCE_KIND_TO_TAB: Record<string, "meetings" | "conversations" | "notes"> = {
  meeting: "meetings",
  zoom: "meetings",
  "google-meet": "meetings",
  teams: "meetings",
  recording: "meetings",
  conversation: "conversations",
  chat: "conversations",
  slack: "conversations",
  discord: "conversations",
  email: "conversations",
  manual: "conversations",
  note: "notes",
  file: "notes",
  evidence: "notes",
  "usage-data": "notes",
};

function tabForSource(source: string | null | undefined) {
  return SOURCE_KIND_TO_TAB[(source || "").toLowerCase()] || "notes";
}

function iconForSource(source: string | null | undefined) {
  const tab = tabForSource(source);
  if (tab === "meetings") return MessagesSquare;
  if (tab === "conversations") return MessageSquare;
  const s = (source || "").toLowerCase();
  if (s === "usage-data") return Database;
  if (s === "file") return FileText;
  return StickyNote;
}

function deepLinkForEvidence(item: EvidenceItem): string {
  const tab = tabForSource(item.source);
  const targetId =
    tab === "meetings" || tab === "conversations"
      ? item.sourceId ?? item.sourceConversationId ?? item.id
      : item.id;
  return `/brain?tab=${tab}&id=${targetId}`;
}

function highlightQuote(content: string, quote: string) {
  if (!quote || !content) {
    return <p className="whitespace-pre-wrap text-sm text-slate-700">{content}</p>;
  }
  const lowerContent = content.toLowerCase();
  const lowerQuote = quote.trim().toLowerCase();
  if (!lowerQuote) {
    return <p className="whitespace-pre-wrap text-sm text-slate-700">{content}</p>;
  }
  const idx = lowerContent.indexOf(lowerQuote);
  if (idx < 0) {
    return (
      <>
        <div
          className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
          data-testid="quote-not-found"
        >
          <strong>Quoted in this discovery:</strong> "{quote}"
          <div className="mt-1 text-[11px] text-amber-600">
            (Exact text not found in source — model may have paraphrased.)
          </div>
        </div>
        <p className="whitespace-pre-wrap text-sm text-slate-700">{content}</p>
      </>
    );
  }
  const before = content.slice(0, idx);
  const match = content.slice(idx, idx + lowerQuote.length);
  const after = content.slice(idx + lowerQuote.length);
  return (
    <p className="whitespace-pre-wrap text-sm text-slate-700">
      {before}
      <mark
        className="rounded bg-yellow-200 px-0.5 text-slate-900"
        data-testid="quote-highlight"
      >
        {match}
      </mark>
      {after}
    </p>
  );
}

interface ProjectLite {
  id: number;
  name: string;
}

function ApproveProjectPopover({
  candidateId,
  currentProjectId = null,
  isApproving,
  onApprove,
  triggerLabel = "Approve & Add to Plan",
}: {
  candidateId: number;
  currentProjectId?: number | null;
  isApproving?: boolean;
  onApprove: (id: number, existingProjectId?: number | null) => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [jiraPickerOpen, setJiraPickerOpen] = useState(false);
  const [pushingJira, setPushingJira] = useState(false);
  const [jiraIssueType, setJiraIssueType] = useState<
    "Task" | "Story" | "Bug" | "Epic"
  >("Task");
  const { toast } = useToast();

  const { data: projects = [] } = useQuery<ProjectLite[]>({
    queryKey: ["/api/projects"],
    enabled: open,
  });
  const { data: jiraIntegration } = useQuery<JiraIntegrationLite | null>({
    queryKey: ["/api/jira/integration"],
    enabled: open,
  });
  const jiraConnected = !!jiraIntegration?.isActive;
  const { data: jiraProjects = [], isLoading: jiraProjectsLoading } = useQuery<
    JiraProjectLite[]
  >({
    queryKey: ["/api/jira/projects"],
    enabled: open && jiraConnected && jiraPickerOpen,
  });

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleJiraPush = async (projectKey: string) => {
    setPushingJira(true);
    try {
      const result: any = await apiRequest(
        `/api/feature-candidates/${candidateId}/push-to-jira`,
        {
          method: "POST",
          body: JSON.stringify({ projectKey, issueType: jiraIssueType }),
        },
      );
      queryClient.invalidateQueries({ queryKey: ["/api/feature-candidates"] });
      const issueKey = result?.issueKey || "";
      const issueUrl = result?.issueUrl || "";
      toast({
        title: "Pushed to Jira",
        description: issueUrl ? (
          <a
            href={issueUrl}
            target="_blank"
            rel="noreferrer"
            className="underline text-indigo-600"
            data-testid="jira-issue-link"
          >
            View {issueKey} in Jira
          </a>
        ) : (
          `Created ${issueKey || "issue"}`
        ),
      });
      setJiraPickerOpen(false);
      setOpen(false);
    } catch (err: any) {
      toast({
        title: "Couldn't push to Jira",
        description:
          err?.data?.error || err?.message || "Unexpected error pushing issue.",
        variant: "destructive",
      });
    } finally {
      setPushingJira(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          disabled={isApproving}
          className="bg-emerald-500 hover:bg-emerald-600 text-white flex-1 animate-pulse hover:animate-none"
          data-testid={`button-approve-${candidateId}`}
        >
          <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
          {triggerLabel}
          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <p className="text-xs font-medium text-slate-700 mb-0.5">
            Add this feature to…
          </p>
          <p className="text-[11px] text-slate-500">
            Pick an existing project, or create a brand new one.
          </p>
        </div>
        {currentProjectId &&
          (() => {
            const currentProject = projects.find(
              (p) => p.id === currentProjectId,
            );
            if (!currentProject) return null;
            return (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onApprove(candidateId, currentProject.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-indigo-50 border-b text-sm text-indigo-700"
                data-testid={`approve-current-project-${candidateId}`}
              >
                <Folder className="h-4 w-4 text-indigo-600" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-xs truncate">
                    Add to {currentProject.name}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Current project
                  </div>
                </div>
              </button>
            );
          })()}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onApprove(candidateId, null);
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-emerald-50 border-b text-sm text-emerald-700"
          data-testid={`approve-new-project-${candidateId}`}
        >
          <FolderPlus className="h-4 w-4 text-emerald-600" />
          <div className="flex-1">
            <div className="font-medium text-xs">Create new project</div>
            <div className="text-[10px] text-slate-500">
              Named after this feature
            </div>
          </div>
        </button>
        <div className="px-2 pt-2">
          <div className="relative">
            <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              className="h-7 text-xs pl-7"
              data-testid={`search-projects-${candidateId}`}
            />
          </div>
        </div>
        <div className="max-h-40 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-[11px] text-slate-400 text-center">
              {projects.length === 0
                ? "No projects yet — create a new one above."
                : "No matches."}
            </p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onApprove(candidateId, p.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-indigo-50 text-xs text-slate-700"
                data-testid={`approve-existing-project-${candidateId}-${p.id}`}
              >
                <Folder className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                <span className="truncate">{p.name}</span>
              </button>
            ))
          )}
        </div>
        <Collapsible
          open={trackerOpen}
          onOpenChange={setTrackerOpen}
          className="border-t bg-slate-50"
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-100"
              data-testid={`tracker-section-toggle-${candidateId}`}
            >
              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Push to external tracker
              </span>
              {trackerOpen ? (
                <ChevronUp className="h-3 w-3 text-slate-400" />
              ) : (
                <ChevronDown className="h-3 w-3 text-slate-400" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-2.5">
          {!jiraPickerOpen ? (
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pushingJira}
                onClick={() => {
                  if (jiraConnected) {
                    setJiraPickerOpen(true);
                  } else {
                    window.open("/integrations", "_blank", "noopener,noreferrer");
                  }
                }}
                className="h-7 text-[11px] gap-1.5 justify-start"
                data-testid={`push-jira-${candidateId}`}
              >
                <SiJira className="h-3 w-3 text-[#0052CC]" />
                {jiraConnected ? "Jira" : "Connect Jira"}
              </Button>
              <a
                href="/integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 items-center gap-1.5 justify-start rounded-md border border-input bg-background px-3 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                data-testid={`push-trello-${candidateId}`}
                title="Connect Trello in Integrations"
              >
                <SiTrello className="h-3 w-3 text-[#0079BF]" />
                Connect Trello
              </a>
              <a
                href="/integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 items-center gap-1.5 justify-start rounded-md border border-input bg-background px-3 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                data-testid={`push-asana-${candidateId}`}
                title="Connect Asana in Integrations"
              >
                <SiAsana className="h-3 w-3 text-[#F06A6A]" />
                Connect Asana
              </a>
              <a
                href="/integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 items-center gap-1.5 justify-start rounded-md border border-input bg-background px-3 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                data-testid={`push-monday-${candidateId}`}
                title="Connect Monday in Integrations"
              >
                <Send className="h-3 w-3 text-[#FF3D57]" />
                Connect Monday
              </a>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-600">
                  Pick a Jira project:
                </p>
                <button
                  type="button"
                  className="text-[10px] text-slate-500 hover:text-slate-700"
                  onClick={() => setJiraPickerOpen(false)}
                >
                  Back
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500">Issue type:</span>
                {(["Task", "Story", "Bug", "Epic"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setJiraIssueType(t)}
                    disabled={pushingJira}
                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                      jiraIssueType === t
                        ? "bg-indigo-100 border-indigo-300 text-indigo-700 font-medium"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    } disabled:opacity-50`}
                    data-testid={`jira-issue-type-${t}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="max-h-36 overflow-y-auto rounded-md border border-slate-200 bg-white">
                {jiraProjectsLoading ? (
                  <div className="flex items-center justify-center gap-1.5 px-3 py-3 text-[11px] text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading…
                  </div>
                ) : jiraProjects.length === 0 ? (
                  <p className="px-3 py-3 text-[11px] text-slate-400 text-center">
                    No Jira projects available.
                  </p>
                ) : (
                  jiraProjects.map((jp) => (
                    <button
                      key={jp.key}
                      type="button"
                      disabled={pushingJira}
                      onClick={() => handleJiraPush(jp.key)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-indigo-50 text-[11px] text-slate-700 disabled:opacity-60"
                      data-testid={`push-jira-project-${candidateId}-${jp.key}`}
                    >
                      <SiJira className="h-3 w-3 text-[#0052CC] shrink-0" />
                      <span className="truncate font-medium">{jp.key}</span>
                      <span className="truncate text-slate-500">
                        — {jp.name}
                      </span>
                      {pushingJira && (
                        <Loader2 className="h-3 w-3 animate-spin ml-auto" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
          </CollapsibleContent>
        </Collapsible>
      </PopoverContent>
    </Popover>
  );
}

type SourceChip = {
  key: string;
  kind: "evidence" | "conversation";
  id: number;
  title: string;
  source: string | null | undefined;
  content: string;
  quote: string;
  deepLink: string;
  meetingDate?: string | Date | null;
  participants?: string[] | null;
};

function SourceMapping({
  evidenceItemIds,
  evidenceQuotes,
  sourceConversationIds,
  sourceConversationQuotes,
}: {
  evidenceItemIds: number[];
  evidenceQuotes: string[];
  sourceConversationIds: number[];
  sourceConversationQuotes: string[];
}) {
  const evidenceEnable = evidenceItemIds.length > 0;
  const convEnable = sourceConversationIds.length > 0;
  const { data: allEvidence = [] } = useQuery<EvidenceItem[]>({
    queryKey: ["/api/evidence"],
    enabled: evidenceEnable,
  });
  const { data: allConversations = [] } = useQuery<any[]>({
    queryKey: ["/api/conversations"],
    enabled: convEnable,
  });
  const [openKey, setOpenKey] = useState<string | null>(null);

  const chips = useMemo<SourceChip[]>(() => {
    const out: SourceChip[] = [];
    if (evidenceEnable) {
      const byId = new Map(allEvidence.map((e) => [e.id, e]));
      evidenceItemIds.forEach((id, i) => {
        const item = byId.get(id);
        if (!item) return;
        out.push({
          key: `evidence-${id}`,
          kind: "evidence",
          id,
          title: item.title,
          source: item.source,
          content: item.content || "",
          quote: evidenceQuotes[i] || "",
          deepLink: deepLinkForEvidence(item),
        });
      });
    }
    if (convEnable) {
      const byId = new Map(allConversations.map((c) => [c.id, c]));
      sourceConversationIds.forEach((id, i) => {
        const conv = byId.get(id);
        if (!conv) return;
        const tab = tabForSource(conv.source);
        out.push({
          key: `conversation-${id}`,
          kind: "conversation",
          id,
          title: conv.title || `Conversation #${id}`,
          source: conv.source || "conversation",
          content: conv.content || "",
          quote: sourceConversationQuotes[i] || "",
          deepLink: `/brain?tab=${tab}&id=${id}`,
          meetingDate: conv.meetingDate,
          participants: conv.participants,
        });
      });
    }
    return out;
  }, [
    evidenceEnable,
    convEnable,
    allEvidence,
    allConversations,
    evidenceItemIds,
    evidenceQuotes,
    sourceConversationIds,
    sourceConversationQuotes,
  ]);

  if (chips.length === 0) return null;

  const activeChip = openKey ? chips.find((c) => c.key === openKey) || null : null;

  return (
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
        <Link2 className="h-3 w-3" />
        Sources ({chips.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => {
          const Icon = iconForSource(chip.source);
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setOpenKey(chip.key)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
              data-testid={`source-${chip.kind}-${chip.id}`}
              title={chip.title}
            >
              <Icon className="h-2.5 w-2.5" />
              {chip.title.length > 40
                ? chip.title.slice(0, 40) + "…"
                : chip.title}
            </button>
          );
        })}
      </div>

      <Sheet
        open={!!activeChip}
        onOpenChange={(o) => !o && setOpenKey(null)}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl overflow-y-auto"
          data-testid="source-sheet"
        >
          {activeChip && (
            <SheetBody quote={activeChip.quote} chipKey={activeChip.key}>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-base">
                  {(() => {
                    const Icon = iconForSource(activeChip.source);
                    return <Icon className="h-4 w-4 text-indigo-500" />;
                  })()}
                  <span className="truncate">{activeChip.title}</span>
                </SheetTitle>
                <SheetDescription className="text-xs text-slate-500">
                  {activeChip.source || activeChip.kind} · #{activeChip.id}
                  {activeChip.meetingDate && (
                    <> · {new Date(activeChip.meetingDate).toLocaleDateString()}</>
                  )}
                  {activeChip.participants && activeChip.participants.length > 0 && (
                    <> · {activeChip.participants.slice(0, 3).join(", ")}</>
                  )}
                </SheetDescription>
              </SheetHeader>

              {activeChip.quote && (
                <div className="mt-4 rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-indigo-700 mb-1">
                    Quote referenced by this discovery
                  </p>
                  <p className="text-sm italic text-indigo-900">
                    "{activeChip.quote}"
                  </p>
                </div>
              )}

              <div className="mt-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-2">
                  Full {activeChip.kind === "conversation" ? "transcript" : "content"}
                </p>
                <div
                  className="rounded-md border border-slate-200 bg-slate-50 p-3 max-h-[60vh] overflow-y-auto"
                  data-testid="source-content-scroller"
                >
                  {highlightQuote(activeChip.content || "", activeChip.quote)}
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Link href={activeChip.deepLink}>
                  <a
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    onClick={() => setOpenKey(null)}
                    data-testid="open-full-source"
                  >
                    Open full {activeChip.kind === "conversation" ? "transcript" : "source"}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Link>
              </div>
            </SheetBody>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SheetBody({
  quote,
  chipKey,
  children,
}: {
  quote: string;
  chipKey: string;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // After render, scroll the highlighted <mark> into view, or scroll to top
  // if the quote couldn't be matched (fallback).
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const mark = root.querySelector(
      '[data-testid="quote-highlight"]',
    ) as HTMLElement | null;
    if (mark) {
      mark.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      const scroller = root.querySelector(
        '[data-testid="source-content-scroller"]',
      ) as HTMLElement | null;
      if (scroller) scroller.scrollTop = 0;
    }
  }, [chipKey, quote]);
  return <div ref={containerRef}>{children}</div>;
}

export function FeatureCandidateCard({
  candidate,
  onApprove,
  onDelete,
  isApproving,
  projectName,
  projectDescription,
  selectable = false,
  selected = false,
  onSelectionChange,
  onTagClick,
}: FeatureCandidateCardProps) {
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [refineDialogOpen, setRefineDialogOpen] = useState(false);
  const tasks = Array.isArray(candidate.tasks) ? candidate.tasks : [];
  const isApproved = candidate.status === "approved";
  const [detailsOpen, setDetailsOpen] = useState(!isApproved);

  const sentAgentInfo = candidate.lastSentToAgent
    ? CODING_AGENTS.find((a) => a.id === candidate.lastSentToAgent) ||
      (candidate.lastSentToAgent === "jira"
        ? { id: "jira", name: "Jira" }
        : null)
    : null;
  const SentAgentIcon =
    candidate.lastSentToAgent && agentIcons[candidate.lastSentToAgent]
      ? agentIcons[candidate.lastSentToAgent]
      : candidate.lastSentToAgent === "jira"
        ? SiJira
        : null;

  const evidenceItemIds = Array.isArray(candidate.evidenceItemIds)
    ? candidate.evidenceItemIds
    : [];
  const evidenceQuotes = Array.isArray(candidate.evidenceQuotes)
    ? candidate.evidenceQuotes
    : [];
  const sourceConversationIds = Array.isArray(candidate.sourceConversationIds)
    ? candidate.sourceConversationIds
    : [];
  const sourceConversationQuotes = Array.isArray(
    candidate.sourceConversationQuotes,
  )
    ? candidate.sourceConversationQuotes
    : [];

  const hasDetails = !!(
    tasks.length > 0
  );

  return (
    <>
      <Card
        className={`border transition-all duration-200 ${
          selected
            ? "border-indigo-300 bg-indigo-50/30 ring-1 ring-indigo-200"
            : isApproved
              ? "border-emerald-200 bg-emerald-50/30"
              : "border-orange-200 hover:border-orange-300 hover:shadow-md"
        }`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              {selectable && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectionChange?.(candidate.id, !selected);
                  }}
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                    selected
                      ? "bg-indigo-500 border-indigo-500"
                      : "border-slate-300 hover:border-indigo-400"
                  }`}
                >
                  {selected && <Check className="h-3 w-3 text-white" />}
                </button>
              )}
              <div
                className={`p-1.5 rounded-md ${
                  isApproved ? "bg-emerald-100" : "bg-orange-100"
                }`}
              >
                {isApproved ? (
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Lightbulb className="h-4 w-4 text-orange-600" />
                )}
              </div>
              <CardTitle className="text-base">
                {candidate.featureTitle}
              </CardTitle>
              {(candidate.mentionCount ?? 1) > 1 && (
                <Badge
                  variant="secondary"
                  className={`text-[10px] gap-0.5 px-1.5 py-0 ml-2 ${
                    (candidate.mentionCount ?? 1) >= 3
                      ? "bg-orange-100 text-orange-700 border-orange-200"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  <Flame className="h-2.5 w-2.5" />
                  {candidate.mentionCount}x
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {sentAgentInfo && SentAgentIcon && candidate.lastSentAt && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-indigo-200 text-indigo-600 bg-indigo-50 gap-1"
                >
                  <SentAgentIcon className="h-2.5 w-2.5" />
                  {sentAgentInfo.name}
                  <Clock className="h-2.5 w-2.5 ml-0.5" />
                  {formatTimeAgo(candidate.lastSentAt)}
                </Badge>
              )}
              <Badge
                variant="outline"
                className={
                  isApproved
                    ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                    : "border-orange-300 text-orange-700 bg-orange-50"
                }
              >
                {isApproved ? "Approved" : "Candidate"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.isArray(candidate.tags) && candidate.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {candidate.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTagClick?.(tag);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 hover:bg-sky-100 transition-colors"
                  data-testid={`tag-chip-${tag}`}
                >
                  <TagIcon className="h-2.5 w-2.5" />
                  {tag}
                </button>
              ))}
            </div>
          )}

          <SourceMapping
            evidenceItemIds={evidenceItemIds}
            evidenceQuotes={evidenceQuotes}
            sourceConversationIds={sourceConversationIds}
            sourceConversationQuotes={sourceConversationQuotes}
          />

          {candidate.whyNow && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                Why Now
              </p>
              <p className="text-sm text-slate-700">{candidate.whyNow}</p>
            </div>
          )}

          {candidate.evidence && candidate.evidence.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                Evidence
              </p>
              <div className="space-y-1">
                {candidate.evidence.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-1.5 text-sm text-slate-600"
                  >
                    <FileText className="h-3.5 w-3.5 mt-0.5 text-slate-400 flex-shrink-0" />
                    <span>{e}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasDetails && (
            <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-slate-50 hover:bg-slate-100 transition-colors text-xs font-medium text-slate-600"
                  data-testid={`toggle-details-${candidate.id}`}
                >
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-slate-400" />
                    Implementation details
                    <span className="text-[10px] text-slate-400 font-normal">
                      ({tasks.length} task{tasks.length !== 1 ? "s" : ""})
                    </span>
                  </span>
                  {detailsOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-3">
                {tasks.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1 text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                      <ListTodo className="h-3 w-3" />
                      Tasks ({tasks.length})
                    </div>
                    <div className="space-y-1">
                      {tasks.slice(0, 4).map((t: any, i: number) => (
                        <div
                          key={i}
                          className="text-xs text-slate-600 flex items-center gap-1.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                          {t.name || t.title}
                        </div>
                      ))}
                      {tasks.length > 4 && (
                        <p className="text-xs text-slate-400">
                          +{tasks.length - 4} more tasks
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
            {isApproved && (
              <div className="p-2 rounded-md bg-emerald-50 border border-emerald-100 mb-1">
                <p className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Approved - Ready for implementation
                </p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setAgentDialogOpen(true)}
                className={
                  isApproved
                    ? "bg-indigo-500 hover:bg-indigo-600 text-white flex-1 ring-2 ring-indigo-200 ring-offset-1"
                    : "bg-indigo-500 hover:bg-indigo-600 text-white flex-1"
                }
              >
                <Code2 className="h-3.5 w-3.5 mr-1.5" />
                Send to Coding Agent
              </Button>
              {!isApproved && (
                <Button
                  size="sm"
                  onClick={() => setRefineDialogOpen(true)}
                  className="bg-violet-500 hover:bg-violet-600 text-white flex-1"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Refine
                </Button>
              )}
            </div>
            {!isApproved && (
              <div className="flex items-center gap-2">
                <ApproveProjectPopover
                  candidateId={candidate.id}
                  currentProjectId={candidate.projectId ?? null}
                  isApproving={isApproving}
                  onApprove={onApprove}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(candidate.id)}
                  className="text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <SendToAgentDialog
        open={agentDialogOpen}
        onOpenChange={setAgentDialogOpen}
        candidate={candidate}
        projectName={projectName}
        projectDescription={projectDescription}
      />

      <FeatureRefinementDialog
        open={refineDialogOpen}
        onOpenChange={setRefineDialogOpen}
        candidate={candidate}
      />
    </>
  );
}

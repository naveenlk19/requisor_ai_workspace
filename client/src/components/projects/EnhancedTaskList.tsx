import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, isPast, isToday } from "date-fns";
import {
  Check,
  Calendar as CalendarIcon,
  Trash2,
  Sparkles,
  X,
  Copy,
  Search,
  ArrowUpDown,
  User2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { TaskDetailsPanel } from "@/components/tasks/TaskDetailsPanel";
import { TaskToolRecommendations } from "@/components/tasks/TaskToolRecommendations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Task {
  id: number;
  name: string;
  description: string | null;
  status: "todo" | "in-progress" | "done";
  priority: "low" | "medium" | "high";
  dueDate: string | null;
  assigneeId: string | null;
  projectId: number;
  createdAt: string;
  totalSubtasks?: number;
  completedSubtasks?: number;
  storyPoints?: number | null;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  workload: number;
  capacity: number;
  skills: string[];
}

interface EnhancedTaskListProps {
  projectId: number;
  tasks: Task[];
  onTaskUpdate: () => void;
}

// ── Design tokens ────────────────────────────────────────────────────────────
// Status carries real meaning so it stays semantic, but rendered with a glow so
// it actually reads. Brand (indigo→violet) is reserved for selection + focus.
const statusConfig = {
  "todo": {
    rail: "bg-slate-300",
    dotCls: "bg-slate-300 shadow-[0_0_0_4px_rgba(148,163,184,0.15)]",
    label: "To Do",
  },
  "in-progress": {
    rail: "bg-blue-500",
    dotCls:
      "bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.18),0_0_10px_1px_rgba(59,130,246,0.55)]",
    label: "In Progress",
  },
  "done": {
    rail: "bg-emerald-500",
    dotCls:
      "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18),0_0_10px_1px_rgba(16,185,129,0.5)]",
    label: "Done",
  },
} as const;

const priorityConfig = {
  low: {
    dot: "bg-slate-400",
    label: "Low",
    badgeCls: "bg-slate-50 text-slate-600 border-slate-200",
  },
  medium: {
    dot: "bg-amber-500",
    label: "Medium",
    badgeCls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  high: {
    dot: "bg-rose-500",
    label: "High",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200",
  },
} as const;

// Gradient avatars — same person always gets the same gradient, so ownership is
// scannable straight down the column. All pairs hold white text.
const avatarPalette = [
  "from-violet-500 to-purple-600",
  "from-sky-500 to-blue-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-emerald-500 to-teal-600",
  "from-fuchsia-500 to-pink-600",
  "from-cyan-500 to-blue-600",
  "from-indigo-500 to-violet-600",
];

const avatarColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return avatarPalette[hash % avatarPalette.length];
};

export function EnhancedTaskList({
  projectId,
  tasks,
  onTaskUpdate,
}: EnhancedTaskListProps) {
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dueSort, setDueSort] = useState<"none" | "asc" | "desc">("none");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [taskDetailModalOpen, setTaskDetailModalOpen] = useState(false);
  const [aiToolsModalOpen, setAiToolsModalOpen] = useState(false);
  const [selectedTaskForTools, setSelectedTaskForTools] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch project info (to detect agile)
  const { data: project } = useQuery<{ source?: string }>({
    queryKey: [`/api/projects/${projectId}`],
  });
  const isAgileProject = project?.source === "agile-planning";

  // Fetch team members
  const { data: projectMembers = [] } = useQuery({
    queryKey: [`/api/projects/${projectId}/members`],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch project members");
      return res.json();
    },
  });

  const teamMembers: TeamMember[] = projectMembers.map((m: any) => ({
    id: m.userId,
    name:
      m.userFirstName && m.userLastName
        ? `${m.userFirstName} ${m.userLastName}`
        : m.userEmail,
    email: m.userEmail || "",
    workload: 0,
    capacity: 40,
    skills: [],
  }));

  // Quick map for assignee lookup during search
  const assigneeNameById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const tm of teamMembers) m.set(String(tm.id), tm.name || "");
    return m;
  }, [teamMembers]);

  // --- Mutations ---
  const updateTaskMutation = useMutation({
    mutationFn: async ({
      taskId,
      updates,
    }: {
      taskId: number;
      updates: Partial<Task>;
    }) => {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update task");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}/tasks`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}`],
      });
      onTaskUpdate();
      setEditingTaskId(null);
      setEditingField(null);
      toast({ title: "Task updated" });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}/tasks`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}`],
      });
      onTaskUpdate();
      toast({ title: "Task deleted" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      // Delete in parallel (not sequential)
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/tasks/${id}`, {
            method: "DELETE",
            credentials: "include",
          }),
        ),
      );
    },

    // Optimistic update
    onMutate: async (ids) => {
      await queryClient.cancelQueries({
        queryKey: [`/api/projects/${projectId}/tasks`],
      });

      const previousTasks = queryClient.getQueryData<any[]>([
        `/api/projects/${projectId}/tasks`,
      ]);

      // Remove tasks immediately from UI
      queryClient.setQueryData(
        [`/api/projects/${projectId}/tasks`],
        (old: any[] | undefined) =>
          old?.filter((task) => !ids.includes(task.id)),
      );

      setSelectedIds(new Set());

      return { previousTasks };
    },

    // Rollback if error
    onError: (_err, _ids, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(
          [`/api/projects/${projectId}/tasks`],
          context.previousTasks,
        );
      }

      toast({
        title: "Failed to delete tasks",
        variant: "destructive",
      });
    },

    // Sync with server
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}/tasks`],
      });

      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}`],
      });

      onTaskUpdate();
    },

    onSuccess: () => {
      toast({ title: "Tasks deleted" });
    },
  });

  // --- Filtering, Searching, Sorting ---
  const { sortedTasks } = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = tasks.filter((t) => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;

      if (filterAssignee !== "all") {
        if (filterAssignee === "unassigned" && t.assigneeId !== null) return false;
        if (filterAssignee !== "unassigned" && t.assigneeId !== filterAssignee)
          return false;
      }

      if (q) {
        const nameMatch = t.name.toLowerCase().includes(q);
        const descMatch = (t.description || "").toLowerCase().includes(q);
        const assigneeName =
          assigneeNameById.get(String(t.assigneeId ?? "")) || "";
        const assigneeMatch = assigneeName.toLowerCase().includes(q);
        if (!nameMatch && !descMatch && !assigneeMatch) return false;
      }

      return true;
    });

    let sorted = filtered;
    if (dueSort !== "none") {
      const toTime = (d: string | null) => (d ? new Date(d).getTime() : NaN);
      sorted = [...filtered].sort((a, b) => {
        const ta = toTime(a.dueDate);
        const tb = toTime(b.dueDate);
        const aValid = Number.isFinite(ta);
        const bValid = Number.isFinite(tb);

        if (!aValid && !bValid) return 0;
        if (!aValid) return dueSort === "asc" ? 1 : -1; // nulls last in asc, first in desc
        if (!bValid) return dueSort === "asc" ? -1 : 1;

        return dueSort === "asc" ? ta - tb : tb - ta;
      });
    }

    return { filteredTasks: filtered, sortedTasks: sorted };
  }, [
    tasks,
    searchQuery,
    filterStatus,
    filterPriority,
    filterAssignee,
    dueSort,
    assigneeNameById,
  ]);

  const visibleIds = sortedTasks.map((t) => t.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected =
    visibleIds.some((id) => selectedIds.has(id)) && !allVisibleSelected;

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    filterStatus !== "all" ||
    filterPriority !== "all" ||
    filterAssignee !== "all";

  const toggleOne = (id: number, checked: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });

  const toggleAllVisible = (checked: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      checked
        ? visibleIds.forEach((id) => next.add(id))
        : visibleIds.forEach((id) => next.delete(id));
      return next;
    });

  const copyTableToClipboard = () => {
    const headers = [
      "Status",
      "Task",
      "Priority",
      "Assignee",
      ...(isAgileProject ? ["Story Points"] : []),
      "Due Date",
    ];
    const rows = sortedTasks.map((task) => {
      const assigneeName =
        assigneeNameById.get(String(task.assigneeId ?? "")) || "Unassigned";
      const dueDate = task.dueDate
        ? format(new Date(task.dueDate), "MMM d, yyyy")
        : "";
      return [
        task.status,
        task.name,
        task.priority,
        assigneeName,
        ...(isAgileProject ? [task.storyPoints?.toString() ?? ""] : []),
        dueDate,
      ];
    });

    const tsv = [headers.join("\t"), ...rows.map((row) => row.join("\t"))].join("\n");
    navigator.clipboard
      .writeText(tsv)
      .then(() => {
        toast({
          title: "Copied to clipboard",
          description: "Paste into Excel or Google Sheets",
        });
      })
      .catch(() => {
        toast({ title: "Failed to copy", variant: "destructive" });
      });
  };

  // helpers
  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const dueDateDisplay = (dateStr: string | null) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isToday(d))
      return { label: "Today", cls: "text-amber-700 bg-amber-50 border-amber-200" };
    if (isPast(d))
      return { label: format(d, "MMM d"), cls: "text-rose-700 bg-rose-50 border-rose-200" };
    return { label: format(d, "MMM d"), cls: "text-slate-600 bg-slate-50 border-slate-200" };
  };

  const gridCols = `36px 40px 1fr 130px 188px${isAgileProject ? " 56px" : ""} 124px 90px`;

  // --- Render ---
  return (
    <div className="space-y-3">

      {/* ── Toolbar (frosted control surface) ─────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/70 backdrop-blur p-2 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 min-w-[210px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks, people…"
            className="pl-9 h-9 text-sm bg-slate-100 border-0 rounded-xl shadow-none focus-visible:ring-2 focus-visible:ring-violet-300"
          />
          {searchQuery && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Status filter */}
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-auto min-w-[120px] text-sm bg-slate-100 border-0 rounded-xl shadow-none gap-1 pr-2 hover:bg-slate-200/70 focus:ring-2 focus:ring-violet-300">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="todo">To Do</SelectItem>
            <SelectItem value="in-progress">In Progress</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>

        {/* Priority filter */}
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="h-9 w-auto min-w-[120px] text-sm bg-slate-100 border-0 rounded-xl shadow-none gap-1 pr-2 hover:bg-slate-200/70 focus:ring-2 focus:ring-violet-300">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        {/* Assignee filter */}
        <Select value={filterAssignee} onValueChange={setFilterAssignee}>
          <SelectTrigger className="h-9 w-auto min-w-[132px] text-sm bg-slate-100 border-0 rounded-xl shadow-none gap-1 pr-2 hover:bg-slate-200/70 focus:ring-2 focus:ring-violet-300">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {teamMembers.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Due sort */}
        <Select
          value={dueSort}
          onValueChange={(v: "none" | "asc" | "desc") => setDueSort(v)}
        >
          <SelectTrigger className="h-9 w-auto min-w-[132px] text-sm bg-slate-100 border-0 rounded-xl shadow-none gap-1 pr-2 hover:bg-slate-200/70 focus:ring-2 focus:ring-violet-300">
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No date sort</SelectItem>
            <SelectItem value="asc">Due: Oldest first</SelectItem>
            <SelectItem value="desc">Due: Newest first</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2.5 pr-1">
          <span className="text-xs font-semibold text-slate-400 tabular-nums">
            {sortedTasks.length} task{sortedTasks.length !== 1 ? "s" : ""}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs font-semibold gap-1.5 border-slate-200 rounded-xl bg-white hover:bg-slate-50"
            onClick={copyTableToClipboard}
          >
            <Copy className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* ── Bulk action bar (brand gradient) ──────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 shadow-[0_8px_24px_-10px_rgba(99,102,241,0.6)]">
          <span className="text-sm font-semibold text-white">
            {selectedIds.size} selected
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-8 text-xs font-semibold bg-white/15 text-white hover:bg-white/25 border-0 shadow-none"
              onClick={() => setSelectedIds(new Set())}
            >
              Deselect all
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs font-semibold bg-white text-rose-600 hover:bg-white/90 border-0 shadow-none"
              onClick={() => {
                const ids = Array.from(selectedIds);
                if (window.confirm(`Delete ${ids.length} task(s)?`))
                  bulkDeleteMutation.mutate(ids);
              }}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* ── Task list ─────────────────────────────────────────────────────── */}
      <div className="rounded-[20px] border border-slate-200/70 overflow-hidden bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_-22px_rgba(15,23,42,0.18)]">

        {/* Column headers */}
        <div
          className="grid items-center gap-2.5 px-5 py-3 bg-gradient-to-b from-slate-50 to-white border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-[0.09em]"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div>
            <Checkbox
              checked={
                allVisibleSelected
                  ? true
                  : someVisibleSelected
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(v) => toggleAllVisible(Boolean(v))}
            />
          </div>
          <div />
          <div>Task</div>
          <div>Priority</div>
          <div>Assignee</div>
          {isAgileProject && <div className="text-center">SP</div>}
          <div>Due</div>
          <div />
        </div>

        {/* Empty state */}
        {sortedTasks.length === 0 && (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-[0_8px_20px_-8px_rgba(99,102,241,0.7)]">
              <Check className="h-7 w-7" />
            </div>
            {hasActiveFilters ? (
              <>
                <p className="text-sm font-semibold text-slate-700">
                  Nothing matches your filters
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Adjust the search or filters above to see more tasks
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-700">No tasks yet</p>
                <p className="text-xs text-slate-400 mt-1">
                  Add your first task to start tracking work here
                </p>
              </>
            )}
          </div>
        )}

        {/* Rows */}
        <div className="divide-y divide-slate-100">
          {sortedTasks.map((task) => {
            const sc = statusConfig[task.status] || statusConfig["todo"];
            const pc = priorityConfig[task.priority] || priorityConfig["medium"];
            const due = dueDateDisplay(task.dueDate);
            const assignee = task.assigneeId
              ? teamMembers.find((m) => m.id === task.assigneeId)
              : null;
            const isSelected = selectedIds.has(task.id);

            return (
              <div
                key={task.id}
                className={cn(
                  "group relative grid items-center gap-2.5 px-5 py-3.5 transition-colors cursor-pointer",
                  isSelected
                    ? "bg-gradient-to-r from-violet-500/[0.06] to-transparent"
                    : "hover:bg-slate-50",
                )}
                style={{ gridTemplateColumns: gridCols }}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (
                    target.closest("button") ||
                    target.closest('[role="checkbox"]') ||
                    target.closest('[data-radix-popper-content-wrapper]') ||
                    target.closest('[role="menuitem"]') ||
                    target.closest('[role="option"]') ||
                    target.closest('[role="combobox"]') ||
                    target.closest(".no-row-click")
                  )
                    return;
                  setSelectedTaskId(task.id);
                  setTaskDetailModalOpen(true);
                }}
              >
                {/* Signature: status rail (hover) → brand gradient glow (selected) */}
                <span
                  className={cn(
                    "absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full transition-opacity duration-150",
                    isSelected
                      ? "bg-gradient-to-b from-indigo-500 to-violet-500 shadow-[0_0_14px_rgba(124,58,237,0.55)] opacity-100"
                      : cn(sc.rail, "opacity-0 group-hover:opacity-70"),
                  )}
                />

                {/* Checkbox */}
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(v) => toggleOne(task.id, Boolean(v))}
                    className={cn(
                      "transition-opacity data-[state=checked]:bg-gradient-to-br data-[state=checked]:from-indigo-500 data-[state=checked]:to-violet-500 data-[state=checked]:border-transparent",
                      isSelected
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100 data-[state=checked]:opacity-100",
                    )}
                  />
                </div>

                {/* Status dot (glowing) */}
                <div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="flex items-center justify-center h-7 w-7 rounded-full hover:bg-slate-100 transition-colors"
                        data-testid={`button-status-${task.id}`}
                        title={sc.label}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className={cn("h-2.5 w-2.5 rounded-full", sc.dotCls)} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-44">
                      <DropdownMenuLabel className="text-xs">
                        Change status
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {(["todo", "in-progress", "done"] as const).map((s) => (
                        <DropdownMenuItem
                          key={s}
                          onClick={() =>
                            updateTaskMutation.mutate({
                              taskId: task.id,
                              updates: { status: s },
                            })
                          }
                          data-testid={`status-option-${s}-${task.id}`}
                        >
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full mr-2 shrink-0",
                              statusConfig[s].rail,
                            )}
                          />
                          {statusConfig[s].label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Name + description */}
                <div className="min-w-0">
                  {editingTaskId === task.id && editingField === "name" ? (
                    <Input
                      value={editValues.name || ""}
                      onChange={(e) =>
                        setEditValues({ ...editValues, name: e.target.value })
                      }
                      onBlur={() => {
                        if (editValues.name?.trim())
                          updateTaskMutation.mutate({
                            taskId: task.id,
                            updates: { name: editValues.name },
                          });
                        setEditingTaskId(null);
                        setEditingField(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        else if (e.key === "Escape") {
                          setEditingTaskId(null);
                          setEditingField(null);
                        }
                      }}
                      autoFocus
                      className="h-7 text-sm"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p
                      className={cn(
                        "text-[15px] font-semibold tracking-[-0.01em] text-slate-900 truncate leading-snug",
                        task.status === "done" && "line-through text-slate-400",
                      )}
                      data-testid={`task-name-${task.id}`}
                    >
                      {task.name}
                    </p>
                  )}
                  {task.description && editingTaskId !== task.id && (
                    <p
                      className="text-[13px] text-slate-400 truncate mt-0.5 leading-snug"
                      data-testid={`task-description-${task.id}`}
                    >
                      {task.description}
                    </p>
                  )}
                  {editingTaskId === task.id && editingField === "description" && (
                    <Textarea
                      value={editValues.description || ""}
                      onChange={(e) =>
                        setEditValues({
                          ...editValues,
                          description: e.target.value,
                        })
                      }
                      onBlur={() => {
                        updateTaskMutation.mutate({
                          taskId: task.id,
                          updates: { description: editValues.description || "" },
                        });
                        setEditingTaskId(null);
                        setEditingField(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setEditingTaskId(null);
                          setEditingField(null);
                        }
                      }}
                      autoFocus
                      className="mt-1 text-xs"
                      rows={2}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </div>

                {/* Priority */}
                <div onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={task.priority}
                    onValueChange={(v) =>
                      updateTaskMutation.mutate({
                        taskId: task.id,
                        updates: { priority: v as "low" | "medium" | "high" },
                      })
                    }
                  >
                    <SelectTrigger className="h-7 w-full border-0 text-xs px-1 gap-1 shadow-none focus:ring-0 rounded-lg bg-transparent">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold border",
                          pc.badgeCls,
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", pc.dot)} />
                        {pc.label}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {(["low", "medium", "high"] as const).map((p) => (
                        <SelectItem key={p} value={p}>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold border",
                              priorityConfig[p].badgeCls,
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                priorityConfig[p].dot,
                              )}
                            />
                            {priorityConfig[p].label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Assignee */}
                <div onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={task.assigneeId || "unassigned"}
                    onValueChange={(v) =>
                      updateTaskMutation.mutate({
                        taskId: task.id,
                        updates: { assigneeId: v === "unassigned" ? null : v },
                      })
                    }
                  >
                    <SelectTrigger className="h-7 w-full border-0 shadow-none focus:ring-0 text-xs px-1 gap-1.5 bg-transparent">
                      {assignee ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              "h-6 w-6 rounded-full text-[10px] font-bold text-white flex items-center justify-center shrink-0 bg-gradient-to-br ring-2 ring-white shadow-sm",
                              avatarColor(assignee.name),
                            )}
                          >
                            {getInitials(assignee.name)}
                          </span>
                          <span className="truncate text-slate-700 font-medium">
                            {assignee.name}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-400 font-medium">
                          <span className="h-6 w-6 rounded-full border-[1.5px] border-dashed border-slate-300 flex items-center justify-center shrink-0">
                            <User2 className="h-3 w-3" />
                          </span>
                          <span>Unassigned</span>
                        </div>
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">
                        <div className="flex items-center gap-2 text-slate-500">
                          <span className="h-6 w-6 rounded-full border-[1.5px] border-dashed border-slate-300 flex items-center justify-center">
                            <User2 className="h-3 w-3" />
                          </span>
                          Unassigned
                        </div>
                      </SelectItem>
                      {teamMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "h-6 w-6 rounded-full text-[10px] font-bold text-white flex items-center justify-center bg-gradient-to-br ring-2 ring-white shadow-sm",
                                avatarColor(m.name),
                              )}
                            >
                              {getInitials(m.name)}
                            </span>
                            {m.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Story Points */}
                {isAgileProject && (
                  <div className="text-center text-xs font-medium text-slate-500">
                    {task.storyPoints != null ? (
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-xs font-bold shadow-sm">
                        {task.storyPoints}
                      </span>
                    ) : (
                      "—"
                    )}
                  </div>
                )}

                {/* Due Date */}
                <div onClick={(e) => e.stopPropagation()}>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className={cn(
                          "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors",
                          due
                            ? due.cls
                            : "text-slate-400 border-transparent hover:border-slate-200 hover:bg-slate-50",
                        )}
                      >
                        <CalendarIcon className="h-3 w-3 shrink-0" />
                        <span>{due ? due.label : "Set date"}</span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={task.dueDate ? new Date(task.dueDate) : undefined}
                        onSelect={(date) =>
                          updateTaskMutation.mutate({
                            taskId: task.id,
                            updates: { dueDate: date ? date.toISOString() : null },
                          })
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Actions (visible on hover) */}
                <div
                  className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-violet-50 transition-colors"
                    title="AI Tools"
                    data-testid={`button-ai-tools-${task.id}`}
                    onClick={() => {
                      setSelectedTaskForTools(task.id);
                      setAiToolsModalOpen(true);
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                  </button>
                  <button
                    className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-rose-50 transition-colors"
                    title="Delete"
                    data-testid={`button-delete-${task.id}`}
                    onClick={() => deleteTaskMutation.mutate(task.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Tools Modal */}
      <Dialog open={aiToolsModalOpen} onOpenChange={setAiToolsModalOpen}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>AI Tool Recommendations</DialogTitle>
            <DialogDescription>
              Get personalized tool suggestions for this task
            </DialogDescription>
          </DialogHeader>
          {selectedTaskForTools && (
            <div className="flex-1 overflow-hidden">
              <TaskToolRecommendations taskId={selectedTaskForTools} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Task Detail Panel */}
      {selectedTaskId && taskDetailModalOpen && (
        <TaskDetailsPanel
          task={tasks.find((t) => t.id === selectedTaskId)!}
          projectId={projectId}
          onClose={() => {
            setSelectedTaskId(null);
            setTaskDetailModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
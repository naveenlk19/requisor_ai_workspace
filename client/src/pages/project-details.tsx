import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  CardTitle,
  CardDescription,
  CardHeader,
  CardContent,
  Card,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  getProject,
  pullTasksFromProvider,
  getProjectTasks,
  updateProject,
  deleteProject,
  processNLPTaskCommand,
} from "@/lib/api";
import { ProjectMembers } from "@/components/projects/ProjectMembers";
import { IntegrationProvider } from "@/types";
import { format } from "date-fns";
import {
  FolderOpen,
  Calendar,
  BarChart2,
  RefreshCcw,
  Plus,
  ListTodo,
  Kanban,
  ToggleLeft,
  Cpu,
  Check,
  X,
  Edit,
  Trash2,
  Milestone,
} from "lucide-react";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskDetailsWithRecommendations } from "@/components/tasks/TaskDetailsWithRecommendations";
import { TaskListEnhanced } from "@/components/tasks/TaskListEnhanced";
import { CollapsibleAIRecommendations } from "@/components/tasks/CollapsibleAIRecommendations";
// import { MilestonesTab } from "@/components/projects/MilestonesTab";
import { TimelineCalendar } from "@/components/projects/TimelineCalendar";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { KanbanBoard } from "@/components/tasks/KanbanBoard";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { SyncActions } from "@/components/tasks/SyncActions";
import { ProjectAnalysis } from "@/components/projects/ProjectAnalysis";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Project } from "@shared/schema";
import TaskCreator from "@/components/projects/TaskCreator";
// import MilestoneCreator from "@/components/projects/MilestoneCreator";
import { EnhancedTaskList } from "@/components/projects/EnhancedTaskList";
import { FloatingProjectAssistant } from "@/components/FloatingProjectAssistant";
import { ProjectDiscoveries } from "@/components/projects/ProjectDiscoveries";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EditableProjectNameProps {
  project: Project;
  onUpdate: (newName: string) => void;
}

function EditableProjectName({ project, onUpdate }: EditableProjectNameProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEditing = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    if (name.trim() !== "" && name !== project.name) {
      onUpdate(name);
    } else {
      setName(project.name); // Revert if empty or unchanged
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setName(project.name); // Revert changes
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  return (
    <div className="relative flex items-center">
      {isEditing ? (
        <div className="flex items-center gap-1.5">
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="text-2xl sm:text-3xl font-bold px-2 py-1 h-auto rounded-xl border-slate-200 focus-visible:ring-2 focus-visible:ring-violet-300"
            placeholder="Project name"
          />
          <div className="flex">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSave}
              className="h-9 w-9 rounded-xl text-emerald-600 hover:bg-emerald-50"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancel}
              className="h-9 w-9 rounded-xl text-rose-600 hover:bg-rose-50"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center group">
          <span className="tracking-tight">{project.name}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleStartEditing}
            className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ml-1.5 text-slate-400 hover:text-slate-700"
          >
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ProjectDetails() {
  // Handle both /projects/:id and /project/:id routes
  const [matchProjects, paramsProjects] = useRoute("/projects/:id");
  const [matchProject, paramsProject] = useRoute("/project/:id");

  // Use whichever route matched
  const params = paramsProjects || paramsProject;
  const projectId = params?.id ? parseInt(params.id) : 0;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [isAddMilestoneModalOpen, setIsAddMilestoneModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [showAIRecommendations, setShowAIRecommendations] = useState(false);

  // Mutation for deleting a project
  const deleteProjectMutation = useMutation({
    mutationFn: (id: number) => {
      return deleteProject(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Project deleted",
        description: "The project has been successfully deleted.",
      });
      setLocation("/projects"); // Redirect to projects list
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete the project",
        variant: "destructive",
      });
    },
  });
  const primaryTabs = ["tasks", "discoveries", "overview"];
  const secondaryTabs = ["members", "milestones", "timeline", "analytics"];

  const [activeTab, setActiveTab] = useState("tasks");

  // Mutation for updating project details
  const updateProjectMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Project> }) => {
      return updateProject(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      toast({
        title: "Project updated",
        description: "Project details have been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update project details",
        variant: "destructive",
      });
    },
  });

  const {
    data: project,
    isLoading,
    error,
  } = useQuery({
    queryKey: [`/api/projects/${projectId}`],
    queryFn: () => getProject(projectId),
    enabled: !!projectId,
    retry: 0,
    staleTime: 0,
  });

  const { data: tasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: [`/api/projects/${projectId}/tasks`],
    queryFn: () => getProjectTasks(projectId),
    enabled: !!projectId,
  });

  // Mutation for syncing with connected providers
  const syncWithProviderMutation = useMutation({
    mutationFn: ({ provider }: { provider: IntegrationProvider }) => {
      return pullTasksFromProvider(provider, projectId);
    },
    onSuccess: (data) => {
      toast({
        title: "Tasks synchronized",
        description:
          data.message || "Project tasks were successfully synchronized",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "tasks"],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync failed",
        description:
          error.message || "Failed to synchronize with external provider",
        variant: "destructive",
      });
    },
  });

  const handleSyncWithProvider = (provider: IntegrationProvider) => {
    syncWithProviderMutation.mutate({ provider });
  };

  // NLP Task Updater mutation - processes natural language commands and auto-refreshes
  const nlpTaskMutation = useMutation({
    mutationFn: ({ command }: { command: string }) => {
      return processNLPTaskCommand(command, projectId);
    },
    onSuccess: (data) => {
      toast({
        title: data.success ? "Task updated" : "Command failed",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });

      if (data.success) {
        // Invalidate tasks query to trigger automatic refresh
        queryClient.invalidateQueries({
          queryKey: [`/api/projects/${projectId}/tasks`],
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Command failed",
        description: error.message || "Failed to process command",
        variant: "destructive",
      });
    },
  });

  const handleNLPCommand = (command: string) => {
    nlpTaskMutation.mutate({ command });
  };

  const getProjectStatus = () => {
    if (!project) return null;

    const pill =
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border";
    const dot = "h-1.5 w-1.5 rounded-full";

    switch (project.status) {
      case "active":
        return (
          <span className={cn(pill, "bg-emerald-50 text-emerald-700 border-emerald-200")}>
            <span className={cn(dot, "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]")} />
            Active
          </span>
        );
      case "completed":
        return (
          <span className={cn(pill, "bg-blue-50 text-blue-700 border-blue-200")}>
            <span className={cn(dot, "bg-blue-500")} />
            Completed
          </span>
        );
      case "on-hold":
        return (
          <span className={cn(pill, "bg-amber-50 text-amber-700 border-amber-200")}>
            <span className={cn(dot, "bg-amber-500")} />
            On Hold
          </span>
        );
      default:
        return (
          <span className={cn(pill, "bg-slate-50 text-slate-600 border-slate-200")}>
            <span className={cn(dot, "bg-slate-400")} />
            {project.status}
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-10 w-1/3 rounded-xl" />
          <Skeleton className="h-9 w-[100px] rounded-xl" />
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm">
          <div className="p-6 space-y-2">
            <Skeleton className="h-7 w-1/4 rounded-lg" />
            <Skeleton className="h-5 w-1/2 rounded-lg" />
          </div>
          <div className="p-6 pt-0">
            <div className="space-y-6">
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    console.error("Project error details:", error);

    // If it's an authentication error, redirect to login
    if (
      (error as any)?.status === 401 ||
      error.message?.includes("401") ||
      error.message?.includes("Not authenticated")
    ) {
      return (
        <div className="container mx-auto py-6">
          <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm p-8">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2 text-slate-900">
                Authentication Required
              </h2>
              <p className="text-slate-500 mb-5">
                Please log in to view project details.
              </p>
              <Button
                className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 shadow-[0_8px_20px_-8px_rgba(99,102,241,0.7)]"
                onClick={() => (window.location.href = "/api/login")}
              >
                Log In
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="container mx-auto py-6">
        <div className="rounded-2xl border border-rose-200/70 bg-white shadow-sm p-8">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2 text-rose-600">
              Error Loading Project
            </h2>
            <p className="text-slate-700">Project ID: {projectId}</p>
            <p className="text-sm text-slate-500 mt-2">
              Error: {error?.message || "Unknown error occurred"}
            </p>
            <div className="flex gap-2 justify-center mt-5">
              <Button
                variant="outline"
                className="rounded-xl border-slate-200"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </Button>
              <Button
                variant="outline"
                className="rounded-xl border-slate-200"
                onClick={() => setLocation("/projects")}
              >
                Back to Projects
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!project && !isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm p-8">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2 text-slate-900">
              Project Not Found
            </h2>
            <p className="text-slate-700">Project ID: {projectId}</p>
            <p className="text-slate-500 mb-5">
              The project you're looking for doesn't exist or you don't have
              access to it.
            </p>
            <Button
              variant="outline"
              className="rounded-xl border-slate-200"
              onClick={() => setLocation("/projects")}
            >
              Back to Projects
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 bg-[radial-gradient(1100px_520px_at_75%_-8%,rgba(238,242,255,0.9),rgba(248,250,252,0)_60%)]">
      {/* Main Content */}
      <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div className="flex items-start gap-3.5 min-w-0">
            <span
              className={`mt-1 h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center ring-1 ring-black/5 shadow-sm bg-${project?.iconBg || "blue"}-100`}
            >
              <FolderOpen
                className={`h-5 w-5 sm:h-6 sm:w-6 text-${project?.iconBg || "blue"}-600`}
              />
            </span>

            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold flex items-center flex-wrap text-slate-900">
                {project && (
                  <EditableProjectName
                    project={project}
                    onUpdate={(updatedName) => {
                      updateProjectMutation.mutate({
                        id: project.id,
                        data: { name: updatedName },
                      });
                    }}
                  />
                )}
              </h1>

              <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1.5 mt-2">
                {project?.source && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/10">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    {project.source === "agile-planning"
                      ? "Created with Agile Planning Agent"
                      : project.source === "manual" && project.aiGenerated
                        ? "Created with Requisor Agent"
                        : project.source === "manual"
                          ? "Created manually"
                          : `From ${project.source}`}
                  </span>
                )}
                <span className="text-xs sm:text-sm font-medium text-slate-400">
                  Created on{" "}
                  {project?.createdAt && typeof project.createdAt === "string"
                    ? format(new Date(project.createdAt), "MMM d, yyyy")
                    : "Unknown"}
                  {project?.dueDate && typeof project.dueDate === "string" && (
                    <> · Due by {format(new Date(project.dueDate), "MMM d, yyyy")}</>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 w-full sm:flex-row sm:gap-2 sm:w-auto sm:flex-nowrap">
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto rounded-xl text-rose-600 border-rose-200 hover:bg-rose-50"
              onClick={() => {
                if (
                  project &&
                  window.confirm(
                    `Are you sure you want to delete the project "${project.name}"?`,
                  )
                ) {
                  deleteProjectMutation.mutate(project.id);
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto rounded-xl border-slate-200"
              onClick={() => setIsAddMilestoneModalOpen(true)}
            >
              <Milestone className="h-4 w-4 mr-1" />
              Milestone
            </Button>

            <Button
              size="sm"
              className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 font-semibold shadow-[0_8px_20px_-8px_rgba(99,102,241,0.7)]"
              onClick={() => setIsAddTaskModalOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Create Task
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* MOBILE */}
          <div className="sm:hidden mb-4">
            <div className="flex items-center gap-2">
              <TabsList className="flex flex-1 gap-1 rounded-2xl border border-slate-200/80 bg-white/70 backdrop-blur p-1 shadow-sm h-auto">
                {primaryTabs.map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="flex-1 text-xs rounded-xl py-1.5 text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* More dropdown */}
              <select
                value={secondaryTabs.includes(activeTab) ? activeTab : ""}
                onChange={(e) => setActiveTab(e.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 shadow-sm"
              >
                <option value="">More</option>
                {secondaryTabs.map((tab) => (
                  <option key={tab} value={tab}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* DESKTOP */}
          <TabsList className="hidden sm:inline-flex h-auto mb-6 items-center gap-1 rounded-2xl border border-slate-200/80 bg-white/70 backdrop-blur p-1 shadow-sm">
            {[
              "tasks",
              "discoveries",
              "overview",
              "members",
              //  "milestones",
              "timeline",
              "analytics",
            ].map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                data-testid={`tab-${tab}`}
                className="rounded-xl px-3.5 py-1.5 text-sm font-medium text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-colors"
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-slate-900">
                  Tasks
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  {project.completedTasks} of {project.totalTasks} completed
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3.5">
                {getProjectStatus()}

                <div className="flex items-center gap-2.5">
                  <div className="h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-slate-700 tabular-nums">
                    {project.progress}%
                  </span>
                </div>

                <div className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/70 backdrop-blur p-1 shadow-sm">
                  <button
                    onClick={() => setViewMode("list")}
                    aria-label="List view"
                    className={cn(
                      "flex h-7 w-9 items-center justify-center rounded-lg transition-colors",
                      viewMode === "list"
                        ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_4px_10px_-4px_rgba(99,102,241,0.6)]"
                        : "text-slate-500 hover:bg-slate-100",
                    )}
                  >
                    <ListTodo className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("kanban")}
                    aria-label="Kanban view"
                    className={cn(
                      "flex h-7 w-9 items-center justify-center rounded-lg transition-colors",
                      viewMode === "kanban"
                        ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_4px_10px_-4px_rgba(99,102,241,0.6)]"
                        : "text-slate-500 hover:bg-slate-100",
                    )}
                  >
                    <Kanban className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {viewMode === "list" ? (
              <EnhancedTaskList
                projectId={projectId}
                tasks={tasks}
                onTaskUpdate={() =>
                  queryClient.invalidateQueries({
                    queryKey: [`/api/projects/${projectId}/tasks`],
                  })
                }
              />
            ) : (
              <div className="rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-5 shadow-sm">
                <KanbanBoard
                  projectId={projectId}
                  tasks={tasks}
                  isLoading={isLoadingTasks}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="discoveries">
            <ProjectDiscoveries
              projectId={projectId}
              projectName={project?.name}
            />
          </TabsContent>

          <TabsContent value="overview">
            <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm min-h-[200px]" />
          </TabsContent>

          <TabsContent value="members">
            <ProjectMembers projectId={projectId} />
          </TabsContent>

          <TabsContent value="timeline">
            <TimelineCalendar projectId={projectId} />
          </TabsContent>

          <TabsContent value="analytics">
            <ProjectAnalysis projectId={projectId} />
          </TabsContent>
        </Tabs>
      </div>
      {/* Add Task Modal */}
      <Dialog open={isAddTaskModalOpen} onOpenChange={setIsAddTaskModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add New Task</DialogTitle>
            <DialogDescription>
              Create a new task for your project. Fill in the task details
              below.
            </DialogDescription>
          </DialogHeader>
          <TaskCreator
            projectId={projectId}
            onTaskCreated={() => {
              queryClient.invalidateQueries({
                queryKey: [`/api/projects/${projectId}/tasks`],
              });
              setIsAddTaskModalOpen(false);
              toast({
                title: "Task created",
                description: "New task has been added to your project.",
              });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Add Milestone Modal */}
      <Dialog
        open={isAddMilestoneModalOpen}
        onOpenChange={setIsAddMilestoneModalOpen}
      >
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add New Milestone</DialogTitle>
            <DialogDescription>
              Create a new milestone to group related tasks together.
            </DialogDescription>
          </DialogHeader>
          <div>Milestone creator temporarily disabled for debugging</div>
        </DialogContent>
      </Dialog>
      {/* Floating Project Assistant */}

      {project && (
        <FloatingProjectAssistant
          projectId={projectId}
          projectName={project.name}
          onNLPCommand={handleNLPCommand}
          className="bottom-4 right-4 sm:bottom-6 sm:right-6"
        />
      )}
    </div>
  );
}
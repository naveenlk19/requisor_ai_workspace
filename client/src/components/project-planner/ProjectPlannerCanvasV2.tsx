import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Save,
  Calendar,
  Target,
  Edit2,
  Plus,
  Trash2,
  CheckCircle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, addDays, addWeeks, startOfDay, parseISO, isValid } from "date-fns";
import { v4 as uuidv4 } from "uuid";

function safeFmt(dateStr: string | null | undefined, fmt: string, fallback: string = "No date"): string {
  if (!dateStr) return fallback;
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return fallback;
    return format(d, fmt);
  } catch {
    return fallback;
  }
}

interface Task {
  id: string;
  name: string;
  description?: string;
  dueDate: string;
  priority: "high" | "medium" | "low";
  status?: string;
  assignee?: string;
}

interface Milestone {
  id: string;
  name: string;
  description?: string;
  dueDate: string;
  tasks: Task[];
}

interface ProjectPlan {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  milestones: Milestone[];
}

interface ProjectPlannerCanvasProps {
  projectPlan: ProjectPlan;
  onSave: (plan: ProjectPlan) => void;
  onUpdate: (plan: ProjectPlan) => void;
}

export function ProjectPlannerCanvasV2({
  projectPlan,
  onSave,
  onUpdate,
}: ProjectPlannerCanvasProps) {
  const [editMode, setEditMode] = useState(false);
  const [plan, setPlan] = useState<ProjectPlan>(projectPlan);

  // Sync internal plan state when projectPlan prop changes
  useEffect(() => {
    setPlan(projectPlan);
  }, [projectPlan]);

  // Validate and fix dates on mount
  useEffect(() => {
    try {
      const today = startOfDay(new Date());
      let updated = false;
      const updatedPlan = { ...plan };

      const safeParse = (d: string | null | undefined): Date => {
        if (!d) return today;
        try {
          const parsed = parseISO(d);
          return isValid(parsed) ? parsed : today;
        } catch {
          return today;
        }
      };

      const safeFormat = (d: Date, fmt: string): string => {
        try {
          return isValid(d) ? format(d, fmt) : format(today, fmt);
        } catch {
          return format(today, fmt);
        }
      };

      // Fix project dates
      if (safeParse(updatedPlan.startDate) < today) {
        updatedPlan.startDate = safeFormat(today, "yyyy-MM-dd");
        updated = true;
      }
      if (safeParse(updatedPlan.endDate) < safeParse(updatedPlan.startDate)) {
        updatedPlan.endDate = safeFormat(
          addWeeks(safeParse(updatedPlan.startDate), 4),
          "yyyy-MM-dd",
        );
        updated = true;
      }

      // Fix milestone and task dates
      updatedPlan.milestones = updatedPlan.milestones.map((milestone, mIndex) => {
        const minMilestoneDate = addDays(
          safeParse(updatedPlan.startDate),
          (mIndex + 1) * 7,
        );
        let milestoneDue = safeParse(milestone.dueDate);

        if (milestoneDue < minMilestoneDate) {
          milestoneDue = minMilestoneDate;
          updated = true;
        }

        const updatedTasks = milestone.tasks.map((task, tIndex) => {
          const minTaskDate = addDays(
            safeParse(updatedPlan.startDate),
            mIndex * 7 + tIndex + 1,
          );
          let taskDue = safeParse(task.dueDate);

          if (taskDue < minTaskDate || taskDue > milestoneDue) {
            taskDue = minTaskDate;
            updated = true;
          }

          return {
            ...task,
            dueDate: safeFormat(taskDue, "yyyy-MM-dd"),
          };
        });

        return {
          ...milestone,
          dueDate: safeFormat(milestoneDue, "yyyy-MM-dd"),
          tasks: updatedTasks,
        };
      });

      if (updated) {
        setPlan(updatedPlan);
        onUpdate(updatedPlan);
      }
    } catch (err) {
      console.warn("Date validation failed:", err);
    }
  }, [
    projectPlan.name,
    projectPlan.startDate,
    projectPlan.endDate,
    projectPlan.milestones.length,
  ]);

  const handleUpdateProject = (field: keyof ProjectPlan, value: string) => {
    const updatedPlan = { ...plan, [field]: value };
    setPlan(updatedPlan);
    onUpdate(updatedPlan);
  };

  const handleUpdateMilestone = (
    milestoneId: string,
    field: keyof Milestone,
    value: string,
  ) => {
    const updatedPlan = {
      ...plan,
      milestones: plan.milestones.map((m) =>
        m.id === milestoneId ? { ...m, [field]: value } : m,
      ),
    };
    setPlan(updatedPlan);
    onUpdate(updatedPlan);
  };

  const handleUpdateTask = (
    milestoneId: string,
    taskId: string,
    field: keyof Task,
    value: any,
  ) => {
    const updatedPlan = {
      ...plan,
      milestones: plan.milestones.map((m) =>
        m.id === milestoneId
          ? {
              ...m,
              tasks: m.tasks.map((t) =>
                t.id === taskId ? { ...t, [field]: value } : t,
              ),
            }
          : m,
      ),
    };
    setPlan(updatedPlan);
    onUpdate(updatedPlan);
  };

  const handleAddTask = (milestoneId: string) => {
    const milestone = plan.milestones.find((m) => m.id === milestoneId);
    if (!milestone) return;

    const newTask: Task = {
      id: uuidv4(),
      name: "New Task",
      description: "",
      dueDate: milestone.dueDate,
      priority: "medium",
      status: "To Do",
    };

    handleUpdateMilestone(milestoneId, "tasks", [
      ...milestone.tasks,
      newTask,
    ] as any);
  };

  const handleDeleteTask = (milestoneId: string, taskId: string) => {
    const updatedPlan = {
      ...plan,
      milestones: plan.milestones.map((m) =>
        m.id === milestoneId
          ? {
              ...m,
              tasks: m.tasks.filter((t) => t.id !== taskId),
            }
          : m,
      ),
    };
    setPlan(updatedPlan);
    onUpdate(updatedPlan);
  };

  const handleAddMilestone = () => {
    const lastMilestone = plan.milestones[plan.milestones.length - 1];
    const baseDateStr = lastMilestone ? lastMilestone.dueDate : plan.startDate;
    let baseDate = new Date(baseDateStr);
    if (!isValid(baseDate) || isNaN(baseDate.getTime())) baseDate = new Date();
    const newDueDate = format(addWeeks(baseDate, 1), "yyyy-MM-dd");

    const newMilestone: Milestone = {
      id: uuidv4(),
      name: "New Milestone",
      description: "",
      dueDate: newDueDate,
      tasks: [],
    };

    const updatedPlan = {
      ...plan,
      milestones: [...plan.milestones, newMilestone],
    };
    setPlan(updatedPlan);
    onUpdate(updatedPlan);
  };

  const handleDeleteMilestone = (milestoneId: string) => {
    const updatedPlan = {
      ...plan,
      milestones: plan.milestones.filter((m) => m.id !== milestoneId),
    };
    setPlan(updatedPlan);
    onUpdate(updatedPlan);
  };

  const handleSave = () => {
    onSave(plan);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-700";
      case "medium":
        return "bg-yellow-100 text-yellow-700";
      case "low":
        return "bg-green-100 text-green-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-white rounded-2xl border border-gray-200/70 shadow-sm overflow-hidden max-h-full">
      {/* Header - Fixed at top */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-white via-purple-50/40 to-pink-50/40 z-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-md shadow-purple-500/20">
              <Target className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">
                Project Canvas
              </h2>
              <p className="text-sm text-gray-500 hidden sm:block">
                Visual project planning with milestones and tasks
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditMode(!editMode)}
              className="flex items-center space-x-2 rounded-lg border-gray-200 bg-white shadow-sm hover:border-purple-200 hover:bg-purple-50/60 hover:text-purple-700 transition-all"
            >
              <Edit2 className="h-4 w-4" />
              <span className="hidden sm:inline">
                {editMode ? "Done Editing" : "Edit"}
              </span>
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              className="bg-gradient-to-r from-purple-600 to-pink-500 hover:shadow-lg hover:shadow-purple-500/30 hover:-translate-y-0.5 flex items-center space-x-2 rounded-lg border-0 transition-all duration-200"
            >
              <Save className="h-4 w-4" />
              <span className="hidden sm:inline">Save to Projects</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable Content Area - Enhanced scrolling with visible scrollbar */}
      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-slate-50/50 to-white"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "#D1D5DB #F3F4F6",
        }}
      >
        <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">
          <div className="max-w-none lg:max-w-5xl mx-auto space-y-6 sm:space-y-8">
            {/* Project Overview */}
            <div className="bg-white rounded-2xl p-4 sm:p-6 space-y-4 border border-gray-100 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-purple-500 to-pink-500" />
                Project Overview
              </h3>

              {/* Project Details */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Project Name
                  </label>
                  {editMode ? (
                    <Input
                      value={plan.name}
                      onChange={(e) =>
                        handleUpdateProject("name", e.target.value)
                      }
                      className="mt-1"
                    />
                  ) : (
                    <h2 className="text-2xl font-bold mt-1">{plan.name}</h2>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Description
                  </label>
                  {editMode ? (
                    <Textarea
                      value={plan.description}
                      onChange={(e) =>
                        handleUpdateProject("description", e.target.value)
                      }
                      className="mt-1"
                      rows={3}
                    />
                  ) : (
                    <p className="text-gray-600 mt-1">{plan.description}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Start Date
                    </label>
                    {editMode ? (
                      <Input
                        type="date"
                        value={plan.startDate}
                        onChange={(e) =>
                          handleUpdateProject("startDate", e.target.value)
                        }
                        className="mt-1"
                        min={format(new Date(), "yyyy-MM-dd")}
                      />
                    ) : (
                      <p className="text-gray-900 mt-1">
                        {safeFmt(plan.startDate, "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      End Date
                    </label>
                    {editMode ? (
                      <Input
                        type="date"
                        value={plan.endDate}
                        onChange={(e) =>
                          handleUpdateProject("endDate", e.target.value)
                        }
                        className="mt-1"
                        min={plan.startDate}
                      />
                    ) : (
                      <p className="text-gray-900 mt-1">
                        {safeFmt(plan.endDate, "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Milestones & Tasks */}
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-sm shadow-purple-500/20">
                    <CheckCircle className="h-4 w-4 text-white" />
                  </span>
                  Milestones & Tasks
                </h3>
                {editMode && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddMilestone}
                    className="rounded-lg border-gray-200 bg-white shadow-sm hover:border-purple-200 hover:bg-purple-50/60 hover:text-purple-700 transition-all"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">Add Milestone</span>
                  </Button>
                )}
              </div>

              {plan.milestones.map((milestone, mIndex) => (
                <div key={milestone.id} className="relative">
                  {mIndex < plan.milestones.length - 1 && (
                    <div className="absolute left-[19px] sm:left-[23px] top-14 bottom-[-24px] sm:bottom-[-32px] w-0.5 bg-gradient-to-b from-purple-300 to-pink-200 z-0" />
                  )}
                  <div className="relative bg-white rounded-2xl p-4 sm:p-5 border border-purple-100 shadow-sm hover:shadow-md hover:shadow-purple-500/5 transition-shadow z-10">
                    <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-purple-500 to-pink-500" />
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-md shadow-purple-500/30 flex-shrink-0">
                          {mIndex + 1}
                        </div>
                        {editMode ? (
                          <Input
                            value={milestone.name}
                            onChange={(e) =>
                              handleUpdateMilestone(
                                milestone.id,
                                "name",
                                e.target.value,
                              )
                            }
                            className="font-semibold flex-1 bg-white"
                          />
                        ) : (
                          <h4 className="font-bold text-lg text-gray-900 flex-1">
                            {milestone.name}
                          </h4>
                        )}
                        {editMode && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteMilestone(milestone.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {editMode ? (
                        <div className="space-y-2 ml-10 sm:ml-12">
                          <Textarea
                            value={milestone.description}
                            onChange={(e) =>
                              handleUpdateMilestone(
                                milestone.id,
                                "description",
                                e.target.value,
                              )
                            }
                            rows={2}
                            className="bg-white"
                            placeholder="Milestone description..."
                          />
                          <Input
                            type="date"
                            value={milestone.dueDate}
                            onChange={(e) =>
                              handleUpdateMilestone(
                                milestone.id,
                                "dueDate",
                                e.target.value,
                              )
                            }
                            className="bg-white"
                            min={format(new Date(), "yyyy-MM-dd")}
                          />
                        </div>
                      ) : (
                        <div className="ml-6 sm:ml-12">
                          <p className="text-gray-600 text-sm">
                            {milestone.description}
                          </p>
                          <div className="flex items-center mt-2 gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 w-fit">
                            <Calendar className="h-3.5 w-3.5 text-purple-600" />
                            <span className="text-xs text-purple-700 font-semibold">
                              Due {safeFmt(milestone.dueDate, "MMM d, yyyy")}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                  {/* Tasks */}
                  <div className="space-y-2 ml-6 sm:ml-12">
                    {milestone.tasks.map((task, tIndex) => (
                      <div
                        key={task.id}
                        className="bg-slate-50/70 rounded-xl p-4 border border-gray-100 hover:border-purple-200 hover:bg-white hover:shadow-md hover:shadow-purple-500/5 transition-all"
                      >
                        {editMode ? (
                          <div className="space-y-3">
                            <div className="flex gap-2">
                              <Input
                                value={task.name}
                                onChange={(e) =>
                                  handleUpdateTask(
                                    milestone.id,
                                    task.id,
                                    "name",
                                    e.target.value,
                                  )
                                }
                                className="flex-1"
                                placeholder="Task name..."
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  handleDeleteTask(milestone.id, task.id)
                                }
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <Textarea
                              value={task.description || ""}
                              onChange={(e) =>
                                handleUpdateTask(
                                  milestone.id,
                                  task.id,
                                  "description",
                                  e.target.value,
                                )
                              }
                              rows={2}
                              placeholder="Task description..."
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <Input
                                type="date"
                                value={task.dueDate}
                                onChange={(e) =>
                                  handleUpdateTask(
                                    milestone.id,
                                    task.id,
                                    "dueDate",
                                    e.target.value,
                                  )
                                }
                                min={format(new Date(), "yyyy-MM-dd")}
                              />
                              <Select
                                value={task.priority}
                                onValueChange={(value) =>
                                  handleUpdateTask(
                                    milestone.id,
                                    task.id,
                                    "priority",
                                    value,
                                  )
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="high">
                                    High Priority
                                  </SelectItem>
                                  <SelectItem value="medium">
                                    Medium Priority
                                  </SelectItem>
                                  <SelectItem value="low">
                                    Low Priority
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-start justify-between mb-2">
                              <h5 className="font-medium text-gray-900">
                                {task.name}
                              </h5>
                              <Badge
                                className={getPriorityColor(task.priority)}
                              >
                                {task.priority}
                              </Badge>
                            </div>
                            {task.description && (
                              <p className="text-sm text-gray-600 mb-2">
                                {task.description}
                              </p>
                            )}
                            <div className="flex items-center text-sm text-gray-500">
                              <Calendar className="h-3 w-3 mr-1" />
                              <span>
                                {safeFmt(task.dueDate, "MMM d, yyyy")}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {editMode && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAddTask(milestone.id)}
                        className="w-full rounded-lg border-gray-200 border-dashed hover:border-purple-300 hover:bg-purple-50/60 hover:text-purple-700 transition-all"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Task
                      </Button>
                    )}
                  </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

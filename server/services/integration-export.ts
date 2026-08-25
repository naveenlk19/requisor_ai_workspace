import { IntegrationProvider } from "@shared/integrations";
import { storage } from "../storage";
import { createIntegrationService } from "./integration";
import type { BaseIntegrationService } from "./integration/base-integration";

/**
 * Shared implementation for POST /api/integrations/export/:provider.
 *
 * Pushes a project plan (project + tasks) to a connected external tool
 * (Jira, Asana, Linear, …) via that provider's API. Persists the local
 * project/tasks, the returned external ids, and per-task `task_mappings`.
 *
 * Extracted out of server/routes.ts so it can be exercised end-to-end in
 * tests with an injected `createService` factory (avoiding real provider
 * HTTP calls) while still hitting the real storage layer. The route in
 * server/routes.ts MUST delegate here so the contract lives in one place.
 */
export type IntegrationExportResult = {
  status: number;
  body: any;
};

export type IntegrationExportDeps = {
  createService?: (
    userId: string,
    provider: IntegrationProvider,
  ) => BaseIntegrationService;
};

export async function performIntegrationExport(
  userId: string | undefined,
  provider: string,
  body: any,
  deps: IntegrationExportDeps = {},
): Promise<IntegrationExportResult> {
  const createService = deps.createService || createIntegrationService;

  const plan = body?.plan;

  if (!plan || !plan.name || !Array.isArray(plan.tasks)) {
    return {
      status: 400,
      body: { message: "A project plan with tasks is required" },
    };
  }

  // Validate the provider is one we support
  if (
    !Object.values(IntegrationProvider).includes(
      provider as IntegrationProvider,
    )
  ) {
    return {
      status: 400,
      body: { message: `Unsupported export target: ${provider}` },
    };
  }

  if (!userId) {
    return { status: 401, body: { message: "Authentication required" } };
  }

  // The provider must be connected before we can push anything to it.
  const integration = await storage.getIntegrationByProvider(userId, provider);
  if (!integration || !integration.isConnected) {
    return {
      status: 400,
      body: {
        message: `${provider} is not connected. Connect it from the Integrations page first.`,
        needsConnection: true,
        provider,
      },
    };
  }

  // Check project creation limits before export
  const limitCheck = await storage.canUserCreateProject(userId);
  if (!limitCheck.allowed) {
    return {
      status: 403,
      body: {
        message: "Project creation limit reached",
        reason: limitCheck.reason,
        current: limitCheck.current,
        max: limitCheck.max,
        suggestion: "Please upgrade your plan to create more projects.",
      },
    };
  }

  // Build the integration service and make sure it is ready.
  const service = createService(userId, provider as IntegrationProvider);
  const ready = await service.initialize();
  if (!ready) {
    return {
      status: 400,
      body: {
        message: `${provider} is not connected. Connect it from the Integrations page first.`,
        needsConnection: true,
        provider,
      },
    };
  }

  // 1) Create the project locally first (no fake external id yet).
  const newProject = await storage.createProject({
    name: plan.name,
    description: plan.description,
    dueDate: plan.timeline?.endDate
      ? new Date(plan.timeline.endDate)
      : undefined,
    progress: 0,
    totalTasks: plan.tasks.length,
    completedTasks: 0,
    icon: "sparkles",
    iconBg: "blue",
    aiGenerated: true,
    source: provider,
    ownerId: userId,
  });

  // 2) Push the project to the external tool.
  const projectResult = await service.pushProject({
    name: plan.name,
    description: plan.description || "",
    dueDate: plan.timeline?.endDate
      ? new Date(plan.timeline.endDate)
      : undefined,
    externalId: String(newProject.id),
  });

  if (!projectResult.success || !projectResult.data?.externalId) {
    return {
      status: 502,
      body: {
        message:
          projectResult.message ||
          `Failed to create the project in ${provider}`,
        projectId: newProject.id,
      },
    };
  }

  const projectExternalId = projectResult.data.externalId as string;

  // Save the real external id on the local project.
  await storage.updateProject(newProject.id, {
    externalId: projectExternalId,
  });

  // Best-effort: refresh workspace metadata (Jira needs the project key
  // and issue types populated before tasks can be created).
  try {
    await service.getWorkspaces();
  } catch (wsError) {
    console.warn(
      `Could not refresh ${provider} workspaces after project create:`,
      wsError,
    );
  }

  // 3) Push each task to the external tool.
  const taskResults: Array<{
    name: string;
    status: "exported" | "failed";
    externalId?: string;
    url?: string;
    reason?: string;
  }> = [];

  for (const taskData of plan.tasks) {
    const localTask = await storage.createTask({
      name: taskData.name,
      description: taskData.description || "",
      status: "todo",
      priority: taskData.priority || "medium",
      dueDate: taskData.dueDate ? new Date(taskData.dueDate) : undefined,
      projectId: newProject.id,
      assigneeId: taskData.assigneeId,
      source: provider,
    });

    try {
      const taskResult = await service.pushTask({
        name: taskData.name,
        description: taskData.description || "",
        status: "todo",
        priority: taskData.priority || "medium",
        dueDate: taskData.dueDate ? new Date(taskData.dueDate) : undefined,
        assigneeId: taskData.assigneeId,
        projectId: newProject.id,
      });

      if (taskResult.success && taskResult.data?.externalId) {
        const taskExternalId = taskResult.data.externalId as string;
        await storage.updateTask(localTask.id, {
          externalId: taskExternalId,
        });
        await storage.createTaskMapping({
          taskId: localTask.id,
          externalId: taskExternalId,
          provider,
          mappedFields: {
            key: taskResult.data.key,
            url: taskResult.data.url,
          },
        });
        taskResults.push({
          name: taskData.name,
          status: "exported",
          externalId: taskExternalId,
          url: taskResult.data.url,
        });
      } else {
        taskResults.push({
          name: taskData.name,
          status: "failed",
          reason: taskResult.message,
        });
      }
    } catch (taskError: any) {
      console.error(`Error exporting task to ${provider}:`, taskError);
      taskResults.push({
        name: taskData.name,
        status: "failed",
        reason: taskError?.message || "Unknown error",
      });
    }
  }

  const exportedCount = taskResults.filter(
    (t) => t.status === "exported",
  ).length;
  const failedCount = taskResults.length - exportedCount;

  return {
    status: 200,
    body: {
      success: true,
      message: `Project exported to ${provider} (${exportedCount} task${
        exportedCount === 1 ? "" : "s"
      } created${failedCount ? `, ${failedCount} failed` : ""})`,
      exportDetails: {
        provider,
        projectId: newProject.id,
        externalId: projectExternalId,
        key: projectResult.data.key,
        url: projectResult.data.url,
        tasks: taskResults,
        exportedTasks: exportedCount,
        failedTasks: failedCount,
      },
    },
  };
}

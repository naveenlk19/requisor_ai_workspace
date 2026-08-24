import { IntegrationProvider } from "@shared/integrations";
import {
  BaseIntegrationService,
  ProjectData,
  SyncResult,
  TaskData,
} from "./base-integration";
import { storage } from "../../storage";
import { getLinearAccessToken } from "./linear-connector";

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

/**
 * Linear integration. Unlike the OAuth-based providers, Linear is authorized
 * through the Replit Linear connector — the access token is fetched fresh from
 * the connector proxy on every call (never persisted in the integrations row).
 */
export class LinearService extends BaseIntegrationService {
  constructor(userId: string) {
    super(userId, IntegrationProvider.LINEAR);
  }

  /**
   * Run a GraphQL query/mutation against Linear using a fresh connector token.
   */
  private async graphql<T = any>(
    query: string,
    variables?: Record<string, any>,
  ): Promise<T> {
    const token = await getLinearAccessToken();
    const res = await fetch(LINEAR_GRAPHQL_URL, {
      method: "POST",
      headers: {
        // Linear personal API keys are sent bare; OAuth tokens need "Bearer ".
        Authorization: token.startsWith("lin_api_") ? token : `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    const json: any = await res.json();
    if (!res.ok || json.errors) {
      const message =
        json?.errors?.map((e: any) => e.message).join("; ") ||
        `Linear API error (${res.status})`;
      throw new Error(message);
    }
    return json.data as T;
  }

  // Linear is connected via the connector, not an OAuth redirect.
  getAuthUrl(): string {
    throw new Error(
      "Linear is connected through Replit's Linear connector, not an OAuth redirect.",
    );
  }

  async handleOAuthCallback(): Promise<boolean> {
    return false;
  }

  /**
   * Linear "workspaces" are Teams.
   */
  async getWorkspaces(): Promise<{ id: string; name: string }[]> {
    try {
      const data = await this.graphql<{
        teams: { nodes: { id: string; name: string; key?: string }[] };
      }>(`query { teams { nodes { id name key } } }`);
      return (data.teams?.nodes || []).map((t) => ({ id: t.id, name: t.name }));
    } catch (error) {
      console.error("Error fetching Linear teams:", error);
      return [];
    }
  }

  /**
   * Returns the team id to use for new projects/issues.
   */
  private async resolveTeamId(): Promise<string | null> {
    if (this.integration?.workspaceId) {
      return this.integration.workspaceId;
    }
    const teams =
      (this.integration?.additionalData as any)?.teams ||
      (await this.getWorkspaces());
    return teams && teams.length > 0 ? teams[0].id : null;
  }

  /**
   * Map a Requisor status to a Linear workflow state id for a given team.
   * Returns undefined when no good match is found (Linear uses its default).
   */
  private async resolveStateId(
    teamId: string,
    status?: string,
  ): Promise<string | undefined> {
    if (!status) return undefined;
    try {
      const data = await this.graphql<{
        team: {
          states: { nodes: { id: string; name: string; type: string }[] };
        };
      }>(
        `query States($teamId: String!) {
          team(id: $teamId) { states { nodes { id name type } } }
        }`,
        { teamId },
      );
      const states = data.team?.states?.nodes || [];
      const normalized = status.toLowerCase().replace(/[\s_-]/g, "");
      let wantedTypes: string[];
      if (normalized === "done" || normalized === "completed") {
        wantedTypes = ["completed"];
      } else if (
        normalized === "inprogress" ||
        normalized === "started" ||
        normalized === "doing"
      ) {
        wantedTypes = ["started"];
      } else {
        wantedTypes = ["unstarted", "backlog"];
      }
      for (const type of wantedTypes) {
        const match = states.find((s) => s.type === type);
        if (match) return match.id;
      }
      return undefined;
    } catch (error) {
      console.error("Error resolving Linear state:", error);
      return undefined;
    }
  }

  /**
   * Map a Requisor priority to a Linear priority (0 none, 1 urgent, 2 high,
   * 3 normal/medium, 4 low).
   */
  private mapPriority(priority?: string): number {
    switch ((priority || "").toLowerCase()) {
      case "urgent":
        return 1;
      case "high":
        return 2;
      case "medium":
        return 3;
      case "low":
        return 4;
      default:
        return 0;
    }
  }

  async pushProject(project: ProjectData): Promise<SyncResult> {
    try {
      const teamId = await this.resolveTeamId();
      if (!teamId) {
        return {
          success: false,
          message: "No Linear team found for this account.",
        };
      }

      const data = await this.graphql<{
        projectCreate: {
          success: boolean;
          project: { id: string; name: string; url: string };
        };
      }>(
        `mutation CreateProject($input: ProjectCreateInput!) {
          projectCreate(input: $input) {
            success
            project { id name url }
          }
        }`,
        {
          input: {
            name: project.name,
            description: project.description || "",
            teamIds: [teamId],
          },
        },
      );

      const created = data.projectCreate?.project;
      if (!data.projectCreate?.success || !created) {
        return { success: false, message: "Failed to create project in Linear" };
      }

      return {
        success: true,
        message: "Successfully created project in Linear",
        data: {
          externalId: created.id,
          name: created.name,
          url: created.url,
        },
      };
    } catch (error: any) {
      console.error("Error pushing project to Linear:", error);
      return {
        success: false,
        message: error?.message || "Failed to create project in Linear",
        errors: [error],
      };
    }
  }

  async pushTask(task: TaskData): Promise<SyncResult> {
    try {
      const teamId = await this.resolveTeamId();
      if (!teamId) {
        return {
          success: false,
          message: "No Linear team found for this account.",
        };
      }

      // Find the Linear project id from the local project's externalId.
      const project = await storage.getProject(task.projectId);
      const linearProjectId = project?.externalId || undefined;

      const stateId = await this.resolveStateId(teamId, task.status);

      const input: Record<string, any> = {
        teamId,
        title: task.name,
        description: task.description || "",
        priority: this.mapPriority(task.priority),
      };
      if (linearProjectId) input.projectId = linearProjectId;
      if (stateId) input.stateId = stateId;
      if (task.dueDate) {
        input.dueDate = new Date(task.dueDate).toISOString().split("T")[0];
      }

      const data = await this.graphql<{
        issueCreate: {
          success: boolean;
          issue: { id: string; identifier: string; url: string };
        };
      }>(
        `mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue { id identifier url }
          }
        }`,
        { input },
      );

      const issue = data.issueCreate?.issue;
      if (!data.issueCreate?.success || !issue) {
        return { success: false, message: "Failed to create issue in Linear" };
      }

      return {
        success: true,
        message: "Successfully created issue in Linear",
        data: {
          externalId: issue.id,
          key: issue.identifier,
          url: issue.url,
        },
      };
    } catch (error: any) {
      console.error("Error pushing task to Linear:", error);
      return {
        success: false,
        message: error?.message || "Failed to push task to Linear",
        errors: [error],
      };
    }
  }

  async pullProjects(): Promise<SyncResult> {
    try {
      const data = await this.graphql<{
        projects: {
          nodes: { id: string; name: string; description?: string }[];
        };
      }>(`query { projects { nodes { id name description } } }`);

      const requisorProjects = (data.projects?.nodes || []).map((p) => ({
        name: p.name,
        description: p.description || `Imported from Linear - ${p.name}`,
        externalId: p.id,
        source: "linear",
        sourceData: {},
        ownerId: this.userId,
      }));

      return {
        success: true,
        message: `Successfully pulled ${requisorProjects.length} projects from Linear`,
        data: requisorProjects,
      };
    } catch (error: any) {
      console.error("Error pulling projects from Linear:", error);
      return {
        success: false,
        message: error?.message || "Failed to pull projects from Linear",
        errors: [error],
      };
    }
  }

  async pullTasks(
    projectId: number,
    externalProjectId?: string,
  ): Promise<SyncResult> {
    try {
      if (!externalProjectId) {
        const project = await storage.getProject(projectId);
        if (!project || !project.externalId) {
          return {
            success: false,
            message: "No external project ID provided or found in project",
          };
        }
        externalProjectId = project.externalId;
      }

      const data = await this.graphql<{
        project: {
          issues: {
            nodes: {
              id: string;
              title: string;
              description?: string;
              dueDate?: string;
              state?: { type: string };
            }[];
          };
        };
      }>(
        `query ProjectIssues($id: String!) {
          project(id: $id) {
            issues { nodes { id title description dueDate state { type } } }
          }
        }`,
        { id: externalProjectId },
      );

      const tasks = (data.project?.issues?.nodes || []).map((issue) => {
        const completed = issue.state?.type === "completed";
        const task: Record<string, any> = {
          name: issue.title,
          description: issue.description || "",
          status: completed ? "done" : "todo",
          isCompleted: completed,
          projectId,
          source: "linear",
          externalId: issue.id,
        };
        if (issue.dueDate) task.dueDate = new Date(issue.dueDate);
        return task;
      });

      return {
        success: true,
        message: `Successfully pulled ${tasks.length} tasks from Linear`,
        data: tasks,
      };
    } catch (error: any) {
      console.error("Error pulling tasks from Linear:", error);
      return {
        success: false,
        message: error?.message || "Failed to pull tasks from Linear",
        errors: [error],
      };
    }
  }

  protected async refreshTokenIfNeeded(): Promise<boolean> {
    // Token refresh is handled by the Replit connector proxy.
    return true;
  }
}

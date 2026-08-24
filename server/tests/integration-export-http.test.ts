/**
 * HTTP-level integration test for POST /api/integrations/export/:provider.
 *
 * Mounts a thin Express app whose handler delegates to the EXACT same shared
 * helper (`performIntegrationExport`) wired into the real route in
 * server/routes.ts. Avoids `setupAuth` (which requires REPLIT_DOMAINS / OAuth)
 * by stubbing `req.user` in a middleware.
 *
 * The external provider API (Jira/Asana) is replaced with an injected fake
 * service factory so we exercise the real validation/auth/persistence sequence
 * (project create, task create, externalId save, task_mappings persistence)
 * against the real Postgres WITHOUT making any live HTTP calls. This is why the
 * route could not be verified end-to-end before — no Jira/Asana account is
 * connected in this environment.
 *
 * Covered cases (from task-123):
 *   1. needsConnection — no integration row -> 400 { needsConnection: true }
 *   2. successful external project creation -> 200 + real project row
 *   3. task_mappings persistence -> one mapping row per exported task
 *
 * Run with: tsx server/tests/integration-export-http.test.ts
 */

import express from "express";
import http from "node:http";
import { db, pool } from "../db";
import { storage } from "../database-storage";
import { performIntegrationExport } from "../services/integration-export";
import type {
  BaseIntegrationService,
  ProjectData,
  SyncResult,
  TaskData,
} from "../services/integration/base-integration";
import { IntegrationProvider } from "@shared/integrations";
import {
  integrations,
  projects,
  tasks,
  taskMappings,
  users,
  type InsertUser,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

function assert(cond: any, msg: string) {
  if (!cond) {
    console.error("ASSERT FAILED:", msg);
    process.exit(1);
  }
}

/**
 * A fake integration service that mimics a connected provider but never makes
 * a network call. pushProject/pushTask return deterministic external ids so we
 * can assert persistence (externalId on project/task + task_mappings rows).
 */
class FakeIntegrationService {
  constructor(
    private opts: {
      siteUrl?: string;
      failTaskNames?: Set<string>;
    } = {},
  ) {}

  async initialize(): Promise<boolean> {
    return true;
  }
  isConnected(): boolean {
    return true;
  }
  async getWorkspaces(): Promise<{ id: string; name: string }[]> {
    return [{ id: "ws-1", name: "Test Workspace" }];
  }
  async pushProject(project: ProjectData): Promise<SyncResult> {
    const externalId = `EXT-PROJ-${project.externalId}`;
    return {
      success: true,
      message: "Successfully created project",
      data: {
        externalId,
        key: "TEST",
        url: `${this.opts.siteUrl || "https://example.test"}/browse/${externalId}`,
      },
    };
  }
  async pushTask(task: TaskData): Promise<SyncResult> {
    if (this.opts.failTaskNames?.has(task.name)) {
      return { success: false, message: "boom: provider rejected task" };
    }
    const externalId = `EXT-TASK-${task.name.replace(/\W+/g, "-")}`;
    return {
      success: true,
      message: "Successfully created task",
      data: {
        externalId,
        key: `TEST-${externalId}`,
        url: `${this.opts.siteUrl || "https://example.test"}/browse/${externalId}`,
      },
    };
  }
  // Unused abstract members for export, present for type-compat.
  getAuthUrl(): string {
    return "";
  }
  async handleOAuthCallback(): Promise<boolean> {
    return true;
  }
  async pullTasks(): Promise<SyncResult> {
    return { success: true, message: "" };
  }
  async pullProjects(): Promise<SyncResult> {
    return { success: true, message: "" };
  }
}

function buildApp(
  testUserId: string | null,
  fakeFactory?: () => BaseIntegrationService,
) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (testUserId) {
      req.user = {
        dbUserId: testUserId,
        claims: { sub: testUserId },
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
    }
    next();
  });
  app.post("/api/integrations/export/:provider", async (req: any, res) => {
    const { provider } = req.params;
    try {
      const userId = req.user?.dbUserId || req.user?.claims?.sub;
      const result = await performIntegrationExport(
        userId,
        provider,
        req.body,
        fakeFactory ? { createService: () => fakeFactory() } : {},
      );
      return res.status(result.status).json(result.body);
    } catch (err: any) {
      return res
        .status(500)
        .json({ message: `Failed to export to ${provider}` });
    }
  });
  return app;
}

function postJson(
  port: number,
  path: string,
  body: any,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (chunk) => (buf += chunk));
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode || 0,
              body: buf ? JSON.parse(buf) : null,
            });
          } catch {
            resolve({ status: res.statusCode || 0, body: buf });
          }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function listen(app: express.Express): Promise<{
  server: http.Server;
  port: number;
}> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve),
  );
  return { server, port: (server.address() as any).port };
}

async function main() {
  // Smoke check: the real route in server/routes.ts must delegate to the
  // shared helper. If someone re-inlines the export logic, this fails fast.
  const fs = await import("node:fs/promises");
  const routesSrc = await fs.readFile(
    new URL("../routes.ts", import.meta.url).pathname,
    "utf8",
  );
  assert(
    routesSrc.includes("performIntegrationExport(") &&
      routesSrc.includes(
        'import { performIntegrationExport } from "./services/integration-export"',
      ),
    "export route in server/routes.ts is no longer delegating to performIntegrationExport — re-extract it",
  );

  const stamp = Date.now();
  const userId = `test-export-user-${stamp}`;
  await storage.upsertUser({
    id: userId,
    username: `export-${stamp}`,
    email: `export-${stamp}@example.com`,
    firstName: "Export",
    lastName: "Test",
  } as InsertUser);

  const createdProjectIds: number[] = [];

  // Deletes a project plus its tasks/task_mappings so the per-plan project
  // creation limit doesn't trip later success cases (FK order matters).
  async function deleteProjectDeep(projectId: number) {
    const localTasks = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.projectId, projectId));
    const taskIds = localTasks.map((t) => t.id);
    if (taskIds.length) {
      await db.delete(taskMappings).where(inArray(taskMappings.taskId, taskIds));
      await db.delete(tasks).where(inArray(tasks.id, taskIds));
    }
    await db.delete(projects).where(eq(projects.id, projectId));
  }

  const samplePlan = {
    name: `Export Test Project ${stamp}`,
    description: "A project created by the export integration test",
    tasks: [
      { name: "Design the schema", description: "Model entities", priority: "high" },
      { name: "Build the API", description: "Routes + storage", priority: "medium" },
    ],
  };

  // --- Test 0: unauthenticated -> 401 ---
  {
    const { server, port } = await listen(buildApp(null));
    const res = await postJson(port, "/api/integrations/export/jira", {
      plan: samplePlan,
    });
    assert(res.status === 401, `expected 401 without auth, got ${res.status}`);
    server.close();
  }

  // --- Test 1: needsConnection — no integration row -> 400 ---
  {
    const { server, port } = await listen(buildApp(userId));
    const res = await postJson(port, "/api/integrations/export/jira", {
      plan: samplePlan,
    });
    assert(
      res.status === 400,
      `expected 400 when not connected, got ${res.status} body=${JSON.stringify(res.body)}`,
    );
    assert(
      res.body?.needsConnection === true && res.body?.provider === "jira",
      `expected needsConnection payload, got ${JSON.stringify(res.body)}`,
    );
    server.close();
  }

  // --- Test 2: invalid plan -> 400 ---
  {
    const { server, port } = await listen(buildApp(userId));
    const res = await postJson(port, "/api/integrations/export/jira", {
      plan: { description: "no name, no tasks" },
    });
    assert(
      res.status === 400 && /project plan/i.test(res.body?.message || ""),
      `expected 400 invalid plan, got ${res.status} ${JSON.stringify(res.body)}`,
    );
    server.close();
  }

  // --- Test 3: unsupported provider -> 400 ---
  {
    const { server, port } = await listen(buildApp(userId));
    const res = await postJson(port, "/api/integrations/export/notreal", {
      plan: samplePlan,
    });
    assert(
      res.status === 400 && /Unsupported export target/.test(res.body?.message || ""),
      `expected 400 unsupported provider, got ${res.status} ${JSON.stringify(res.body)}`,
    );
    server.close();
  }

  // Connect a (fake) Jira integration so the export can proceed.
  await storage.createIntegration({
    userId,
    provider: IntegrationProvider.JIRA,
    accessToken: "fake-access-token",
    refreshToken: "fake-refresh-token",
    isConnected: true,
  });

  // --- Test 4: successful export + task_mappings persistence ---
  {
    const fake = new FakeIntegrationService({ siteUrl: "https://acme.atlassian.net" });
    const { server, port } = await listen(
      buildApp(userId, () => fake as unknown as BaseIntegrationService),
    );
    const res = await postJson(port, "/api/integrations/export/jira", {
      plan: samplePlan,
    });
    server.close();

    assert(
      res.status === 200,
      `expected 200, got ${res.status} body=${JSON.stringify(res.body)}`,
    );
    const details = res.body?.exportDetails;
    assert(details, `missing exportDetails in ${JSON.stringify(res.body)}`);
    assert(
      details.provider === "jira",
      `wrong provider ${details.provider}`,
    );
    assert(
      typeof details.projectId === "number",
      `missing local projectId ${JSON.stringify(details)}`,
    );
    createdProjectIds.push(details.projectId);

    assert(
      details.externalId === `EXT-PROJ-${details.projectId}`,
      `project externalId mismatch: ${details.externalId}`,
    );
    assert(
      typeof details.url === "string" && details.url.includes("acme.atlassian.net"),
      `expected real-looking project url, got ${details.url}`,
    );
    assert(
      details.exportedTasks === 2 && details.failedTasks === 0,
      `expected 2 exported / 0 failed, got ${details.exportedTasks}/${details.failedTasks}`,
    );

    // The local project row exists, is owned by the user, and carries the
    // external id returned by the provider.
    const proj = await storage.getProject(details.projectId);
    assert(proj, `local project ${details.projectId} not found`);
    assert(
      proj?.ownerId === userId,
      `project owner mismatch: ${proj?.ownerId}`,
    );
    assert(
      proj?.externalId === details.externalId,
      `project externalId not persisted: ${proj?.externalId}`,
    );
    assert(proj?.source === "jira", `project source mismatch: ${proj?.source}`);

    // task_mappings persistence: one mapping row per exported task, with the
    // provider + the url/key persisted into mappedFields.
    const localTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, details.projectId));
    assert(
      localTasks.length === 2,
      `expected 2 local tasks, got ${localTasks.length}`,
    );

    let mappingCount = 0;
    for (const t of localTasks) {
      const mappings = await storage.getTaskMappingsByTask(t.id);
      assert(
        mappings.length === 1,
        `expected 1 task_mapping for task ${t.id}, got ${mappings.length}`,
      );
      const m = mappings[0];
      mappingCount += mappings.length;
      assert(m.provider === "jira", `mapping provider mismatch: ${m.provider}`);
      assert(
        m.externalId === t.externalId && !!t.externalId,
        `mapping externalId (${m.externalId}) != task externalId (${t.externalId})`,
      );
      const mf = (m.mappedFields || {}) as any;
      assert(
        typeof mf.url === "string" && mf.url.includes("acme.atlassian.net"),
        `mappedFields.url not persisted: ${JSON.stringify(mf)}`,
      );
    }
    assert(mappingCount === 2, `expected 2 task_mappings total, got ${mappingCount}`);

    // Free the project slot so the next success case isn't blocked by the
    // per-plan project creation limit.
    await deleteProjectDeep(details.projectId);
    createdProjectIds.pop();
  }

  // --- Test 5: partial failure — one task rejected by provider ---
  {
    const fake = new FakeIntegrationService({
      failTaskNames: new Set(["Build the API"]),
    });
    const { server, port } = await listen(
      buildApp(userId, () => fake as unknown as BaseIntegrationService),
    );
    const res = await postJson(port, "/api/integrations/export/jira", {
      plan: { ...samplePlan, name: `${samplePlan.name} partial` },
    });
    server.close();

    assert(res.status === 200, `expected 200 on partial, got ${res.status}`);
    const details = res.body?.exportDetails;
    createdProjectIds.push(details.projectId);
    assert(
      details.exportedTasks === 1 && details.failedTasks === 1,
      `expected 1 exported / 1 failed, got ${details.exportedTasks}/${details.failedTasks}`,
    );
    // Only the successful task should have a mapping row.
    const localTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, details.projectId));
    let total = 0;
    for (const t of localTasks) {
      total += (await storage.getTaskMappingsByTask(t.id)).length;
    }
    assert(total === 1, `expected 1 mapping on partial export, got ${total}`);
  }

  // Cleanup (FK order: task_mappings -> tasks -> projects -> integration -> user)
  for (const projectId of createdProjectIds) {
    await deleteProjectDeep(projectId);
  }
  await db.delete(integrations).where(eq(integrations.userId, userId));
  await db.delete(users).where(eq(users.id, userId));

  console.log("PASS: HTTP-level integration export test");
  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("ERROR:", err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});

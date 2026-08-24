/**
 * Integration test: routing an action item is atomic.
 *
 * Run with:
 *   tsx server/tests/route-action-item.test.ts
 *
 * Requires DATABASE_URL pointing at a Postgres database with the project schema
 * already applied (e.g. the dev database). The test creates and tears down its
 * own user, project and conversation rows.
 */

import { db, pool } from "../db";
import { storage } from "../database-storage";
import {
  conversations,
  projects,
  projectMembers,
  tasks,
  users,
  ProjectRole,
  type Conversation,
  type ConversationActionItem,
  type InsertConversation,
  type InsertUser,
} from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const stamp = Date.now();
  const userId = `test-route-user-${stamp}`;
  const username = `route-test-${stamp}`;
  const itemId = `item-${stamp}`;

  let createdConvId: number | null = null;
  let createdProjectId: number | null = null;

  try {
    const newUser: InsertUser & { id: string } = { id: userId, username };
    await storage.createUser(newUser);

    const project = await storage.createProject({
      name: `Route Test Project ${stamp}`,
      ownerId: userId,
    });
    createdProjectId = project.id;
    await storage.addProjectMember({
      projectId: project.id,
      userId,
      role: ProjectRole.OWNER,
    });

    const item: ConversationActionItem = {
      id: itemId,
      text: "Follow up with the design team about the new sidebar",
      owner: "Alex",
      dueHint: "next Friday",
    };
    const newConv: InsertConversation = {
      userId,
      title: "Test routing conversation",
      source: "manual",
      content: "irrelevant",
      actionItems: [item],
    };
    const conv = await storage.createConversation(newConv);
    createdConvId = conv.id;

    const buildTask = (it: ConversationActionItem, c: Conversation) => ({
      name: it.text,
      description: `From conversation: ${c.title}`,
      projectId: project.id,
      assigneeId: userId,
      source: "conversation" as const,
      aiGenerated: true,
    });

    // Fire two concurrent routing calls for the SAME action item.
    const [a, b] = await Promise.all([
      storage.routeConversationActionItem({
        conversationId: conv.id,
        itemId,
        routedProjectId: project.id,
        routedProjectName: project.name,
        buildTask,
      }),
      storage.routeConversationActionItem({
        conversationId: conv.id,
        itemId,
        routedProjectId: project.id,
        routedProjectName: project.name,
        buildTask,
      }),
    ]);

    const statuses = [a.status, b.status].sort();
    if (statuses[0] !== "already_routed" || statuses[1] !== "created") {
      throw new Error(
        `Expected one created + one already_routed, got: ${a.status}, ${b.status}`,
      );
    }

    const created = a.status === "created" ? a : (b as typeof a);
    const loser = a.status === "already_routed" ? a : (b as typeof a);

    // Only one task should exist for this project.
    const projectTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, project.id));
    if (projectTasks.length !== 1) {
      throw new Error(
        `Expected exactly 1 task to be created, found ${projectTasks.length}`,
      );
    }
    if (projectTasks[0].id !== created.task.id) {
      throw new Error(
        `Stored task id ${projectTasks[0].id} did not match created winner ${created.task.id}`,
      );
    }

    // The loser must report the same task id the winner created.
    if (loser.status !== "already_routed") {
      throw new Error("Loser branch lost its status");
    }
    if (loser.item.routedTaskId !== created.task.id) {
      throw new Error(
        `Loser saw routedTaskId=${loser.item.routedTaskId}, expected ${created.task.id}`,
      );
    }

    // The conversation row should reflect the single routed task.
    const [finalConv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conv.id));
    const finalItems = (finalConv.actionItems ?? []) as ConversationActionItem[];
    const finalItem = finalItems.find((it) => it.id === itemId);
    if (!finalItem || finalItem.routedTaskId !== created.task.id) {
      throw new Error(
        `Final conversation row did not reflect the winning task: ${JSON.stringify(finalItem)}`,
      );
    }

    console.log(
      `OK - one task created (id=${created.task.id}); concurrent caller got 409-style already_routed.`,
    );
  } finally {
    if (createdConvId !== null) {
      await db.delete(conversations).where(eq(conversations.id, createdConvId));
    }
    if (createdProjectId !== null) {
      await db
        .delete(tasks)
        .where(eq(tasks.projectId, createdProjectId));
      await db
        .delete(projectMembers)
        .where(eq(projectMembers.projectId, createdProjectId));
      await db.delete(projects).where(eq(projects.id, createdProjectId));
    }
    await db.delete(users).where(eq(users.id, userId));
    await pool.end();
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});

/**
 * Agent memory persistence hook.
 *
 * A thin, fail-open wrapper over the existing `memoryManager` (which embeds
 * text with gemini-embedding-001 and stores it in `chat_embeddings` for
 * semantic recall). Agents call `persistMemory(...)` fire-and-forget after
 * producing a response so the interaction becomes searchable later.
 *
 * Failure semantics: never throws. A missing GEMINI_API_KEY, an embedding
 * outage, or a DB error degrades to a warning — it must never block the
 * agent's own work (e.g. the meeting-intelligence worker).
 */

import { memoryManager } from "./memory-manager";

export interface AgentMemoryContext {
  userId: string;
  agentName: string;
  /** Reserved for callers that also want a retrieval pass; persistence ignores it. */
  retrieve?: boolean;
  metadata?: Record<string, any>;
}

export interface PersistMemoryInput {
  ctx: AgentMemoryContext;
  userQuery: string;
  agentResponse: string;
}

/**
 * Persist a single agent interaction (the prompting query + the produced
 * response) into long-term semantic memory, scoped by userId + agentName.
 */
export async function persistMemory(input: PersistMemoryInput): Promise<void> {
  try {
    const { ctx, userQuery, agentResponse } = input;
    if (!ctx?.userId) return;

    const base: Record<string, any> = {
      userId: ctx.userId,
      agentName: ctx.agentName,
      type: "agent_memory",
      ...(ctx.metadata || {}),
    };

    if (typeof userQuery === "string" && userQuery.trim()) {
      await memoryManager.storeMessage(userQuery.trim(), {
        ...base,
        role: "user",
      });
    }
    if (typeof agentResponse === "string" && agentResponse.trim()) {
      await memoryManager.storeMessage(agentResponse.trim(), {
        ...base,
        role: "assistant",
      });
    }
  } catch (err: any) {
    // Fail-open: agent memory is an enhancement, never a hard dependency.
    console.warn(
      `[agent-memory] persistMemory failed (non-fatal): ${err?.message || err}`,
    );
  }
}

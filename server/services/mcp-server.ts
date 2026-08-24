// Task #121 — Requisor MCP (Model Context Protocol) server.
//
// Exposes a read-only, per-user view of a Requisor user's context to external
// MCP clients (Claude Desktop, Cursor, ChatGPT, Claude Code, …). Because those
// clients cannot use Requisor's session-based Replit OIDC, authentication is
// done with per-user Personal Access Tokens (see `personal_access_tokens`).
//
// Transport: Streamable HTTP (the modern MCP HTTP transport). The protocol is
// just JSON-RPC 2.0 over HTTP POST, so it is implemented here directly —
// statelessly, with no shared session state and therefore no cross-user
// leakage risk. Every tool handler is given the authenticated `userId` and
// scopes all storage/retrieval calls to that user. The server is strictly
// read-only.

import * as crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { retrieveContext } from "./retrieval";

// Newest protocol version we implement. We echo back the client's requested
// version when we support it, otherwise we offer this one.
const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
];
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

const SERVER_INFO = { name: "requisor", version: "1.0.0" };
const SERVER_INSTRUCTIONS =
  "Requisor read-only context server. Use these tools to read the authenticated user's projects, tasks, evidence, discoveries (feature candidates), consolidated beliefs, and to run hybrid retrieval over their full context. All tools are read-only and scoped to the token owner.";

// --- Token helpers --------------------------------------------------------

const TOKEN_PREFIX = "rqsr_";

/** Generate a new plaintext personal access token. Shown to the user once. */
export function generatePlainToken(): string {
  return TOKEN_PREFIX + crypto.randomBytes(32).toString("base64url");
}

/** SHA-256 hash of a plaintext token — only the hash is persisted. */
export function hashToken(plain: string): string {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

/** Short, non-secret display prefix (e.g. "rqsr_ab12") for the UI list. */
export function tokenDisplayPrefix(plain: string): string {
  return plain.slice(0, TOKEN_PREFIX.length + 4);
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers["authorization"];
  if (typeof header === "string" && header.length > 0) {
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  const xToken = req.headers["x-api-key"];
  if (typeof xToken === "string" && xToken.length > 0) return xToken.trim();
  return null;
}

// --- Auth middleware ------------------------------------------------------

/**
 * Express middleware that authenticates a Personal Access Token from the
 * Authorization: Bearer header. On success, attaches `req.mcpUserId` and
 * updates the token's last-used timestamp (best-effort). On failure, returns
 * a JSON-RPC-shaped 401 so MCP clients render a clean error.
 */
export async function mcpTokenAuth(
  req: Request & { mcpUserId?: string },
  res: Response,
  next: NextFunction,
): Promise<void> {
  const unauthorized = (message: string) => {
    // Advertise the OAuth protected-resource metadata (RFC 9728) so MCP
    // clients like Claude can discover the one-click OAuth flow (Task #133).
    const fwdProto = String(req.headers["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim();
    const proto = fwdProto || req.protocol || "https";
    const host = req.get("host") || "localhost";
    let base = `${proto}://${host}`;
    try {
      base = new URL(base).origin;
    } catch {
      base = `https://${host}`;
    }
    res
      .status(401)
      .set(
        "WWW-Authenticate",
        `Bearer realm="requisor-mcp", resource_metadata="${base}/.well-known/oauth-protected-resource/api/mcp"`,
      )
      .json({ jsonrpc: "2.0", error: { code: -32001, message }, id: null });
  };

  try {
    const plain = extractBearerToken(req);
    if (!plain) {
      unauthorized(
        "Missing access token. Provide an Authorization: Bearer <token> header.",
      );
      return;
    }
    if (plain.length > 512) {
      unauthorized("Invalid access token.");
      return;
    }

    const tokenHash = hashToken(plain);
    const record = await storage.getPersonalAccessTokenByHash(tokenHash);
    if (!record || record.revoked) {
      unauthorized("Invalid or revoked access token.");
      return;
    }

    req.mcpUserId = record.userId;
    storage.touchPersonalAccessToken(record.id).catch(() => {});
    next();
  } catch (err: any) {
    console.error("[mcp] token auth error:", err?.message || err);
    res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal authentication error." },
      id: null,
    });
  }
}

// --- Tool definitions -----------------------------------------------------

type ToolContent = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (userId: string, args: Record<string, any>) => Promise<ToolContent>;
}

function textResult(payload: unknown): ToolContent {
  const text =
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: "text", text }] };
}

function errorResult(message: string): ToolContent {
  return { isError: true, content: [{ type: "text", text: message }] };
}

const TOOLS: ToolDef[] = [
  {
    name: "list_projects",
    title: "List projects",
    description:
      "List all of the user's Requisor projects with status, progress and task counts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (userId) => {
      try {
        const projects = await storage.getProjectsForUser(userId);
        const rows = projects.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          status: p.status,
          progress: p.progress,
          totalTasks: p.totalTasks,
          completedTasks: p.completedTasks,
          dueDate: p.dueDate,
          createdAt: p.createdAt,
        }));
        return textResult({ count: rows.length, projects: rows });
      } catch (err: any) {
        return errorResult(`Failed to list projects: ${err?.message || err}`);
      }
    },
  },
  {
    name: "get_project_tasks",
    title: "Get project tasks",
    description:
      "Get the tasks for one of the user's projects. Requires a projectId from list_projects.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "integer",
          description: "The numeric id of the project (from list_projects).",
        },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
    handler: async (userId, args) => {
      try {
        const projectId = Number(args.projectId);
        if (!Number.isInteger(projectId) || projectId <= 0) {
          return errorResult("projectId must be a positive integer.");
        }
        const userProjects = await storage.getProjectsForUser(userId);
        const owned = userProjects.find((p) => p.id === projectId);
        if (!owned) {
          return errorResult(`Project ${projectId} not found or not accessible.`);
        }
        const tasks = await storage.getTasksByProjectId(projectId);
        const rows = tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          parentTaskId: t.parentTaskId,
        }));
        return textResult({
          projectId,
          projectName: owned.name,
          count: rows.length,
          tasks: rows,
        });
      } catch (err: any) {
        return errorResult(`Failed to get tasks: ${err?.message || err}`);
      }
    },
  },
  {
    name: "search_evidence",
    title: "Search evidence & notes",
    description:
      "Search the user's Evidence Library (notes, files, meeting/conversation snippets, Context Brain insights). Returns matching items. Omit the query to list recent evidence.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          maxLength: 500,
          description: "Optional free-text search; omit to list recent items.",
        },
        insightType: {
          type: "string",
          enum: ["problem", "feature", "decision", "insight", "question"],
          description: "Optionally filter to one Context Brain insight type.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Max items to return (default 20).",
        },
      },
      additionalProperties: false,
    },
    handler: async (userId, args) => {
      try {
        const cap = Math.min(50, Math.max(1, Number(args.limit) || 20));
        const query = typeof args.query === "string" ? args.query.trim() : "";
        let items = query
          ? await storage.searchEvidence(userId, query)
          : await storage.getEvidenceItems(userId);
        if (args.insightType) {
          items = items.filter((it) => it.insightType === args.insightType);
        }
        const rows = items.slice(0, cap).map((it) => ({
          id: it.id,
          title: it.title,
          content: (it.content || "").slice(0, 1200),
          source: it.source,
          insightType: it.insightType,
          tags: it.tags,
          mentionCount: it.mentionCount,
          createdAt: it.createdAt,
        }));
        return textResult({ count: rows.length, evidence: rows });
      } catch (err: any) {
        return errorResult(`Failed to search evidence: ${err?.message || err}`);
      }
    },
  },
  {
    name: "list_discoveries",
    title: "List discoveries (feature candidates)",
    description:
      "List the user's discovered feature candidates (with RICE scores, evidence and reasoning). Optionally filter by projectId.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "integer",
          description: "Optionally filter discoveries to one project.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Max discoveries to return (default 25).",
        },
      },
      additionalProperties: false,
    },
    handler: async (userId, args) => {
      try {
        const cap = Math.min(50, Math.max(1, Number(args.limit) || 25));
        let candidates: any[] = await storage.getFeatureCandidates(userId);
        candidates = candidates.filter(
          (c) => c.status !== "merged" && c.mergedIntoId == null,
        );
        if (args.projectId != null) {
          const pid = Number(args.projectId);
          candidates = candidates.filter((c) => c.projectId === pid);
        }
        const rows = candidates.slice(0, cap).map((c) => ({
          id: c.id,
          featureTitle: c.featureTitle,
          whyNow: c.whyNow,
          status: c.status,
          projectId: c.projectId,
          impactScore: c.impactScore,
          effortScore: c.effortScore,
          confidenceScore: c.confidenceScore,
          riceScore: c.riceScore,
          priorityRank: c.priorityRank,
          mentionCount: c.mentionCount,
          tags: c.tags,
          createdAt: c.createdAt,
        }));
        return textResult({ count: rows.length, discoveries: rows });
      } catch (err: any) {
        return errorResult(`Failed to list discoveries: ${err?.message || err}`);
      }
    },
  },
  {
    name: "query_beliefs",
    title: "Query beliefs / durable insights",
    description:
      "Search the user's consolidated 'beliefs' — durable, attributed claims promoted from repeated mentions across their meetings, conversations and notes (e.g. who is worried about what, what is blocked).",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          maxLength: 500,
          description: "What to look up, e.g. 'what is the team worried about?'",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "Max beliefs to return (default 8).",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: async (userId, args) => {
      try {
        const query = String(args.query || "").trim();
        if (!query) return errorResult("query is required.");
        const cap = Math.min(20, Math.max(1, Number(args.limit) || 8));
        const result = await retrieveContext({
          query,
          scope: { userId },
          k: Math.min(20, cap + 6),
          readOnly: true,
        });
        const beliefs = result.chunks
          .filter((c) => c.sourceType === "belief")
          .slice(0, cap)
          .map((c) => ({
            id: c.sourceId,
            claim: c.text,
            holder: c.metadata?.belief?.holder ?? null,
            mentionCount: c.metadata?.belief?.mentionCount ?? null,
            weight: c.metadata?.belief?.weight ?? null,
            lastSeenAt: c.metadata?.belief?.lastSeenAt ?? null,
            score: c.score,
          }));
        return textResult({ count: beliefs.length, beliefs });
      } catch (err: any) {
        return errorResult(`Failed to query beliefs: ${err?.message || err}`);
      }
    },
  },
  {
    name: "search_my_context",
    title: "Search my context (hybrid RAG)",
    description:
      "Ask a question about anything in the user's Requisor context. Runs Requisor's hybrid retrieval (vector + keyword + rerank + entity graph + beliefs) and returns the most relevant verbatim source snippets with citations. Use this for open-ended 'what do we know about X?' questions.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          maxLength: 1000,
          description: "The question to answer.",
        },
        projectId: {
          type: "integer",
          description: "Optionally scope retrieval to one project.",
        },
        topK: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "Number of snippets to return (default 8).",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: async (userId, args) => {
      try {
        const query = String(args.query || "").trim();
        if (!query) return errorResult("query is required.");
        const topK = Math.min(20, Math.max(1, Number(args.topK) || 8));
        const projectId =
          args.projectId != null ? Number(args.projectId) : null;
        const result = await retrieveContext({
          query,
          scope: { userId, projectId },
          k: topK,
          readOnly: true,
        });
        const snippets = result.chunks.map((c, i) => ({
          rank: i + 1,
          sourceType: c.sourceType,
          sourceId: c.sourceId,
          title:
            c.metadata?.title ??
            c.metadata?.subject ??
            c.metadata?.fileName ??
            null,
          speaker: c.metadata?.speaker ?? null,
          via: c.metadata?.via ?? null,
          text: (c.text || "").slice(0, 1200),
          score: c.score,
        }));
        return textResult({
          query,
          retrievalMs: result.retrievalMs,
          fallbackUsed: result.fallbackUsed,
          count: snippets.length,
          snippets,
        });
      } catch (err: any) {
        return errorResult(`Failed to search context: ${err?.message || err}`);
      }
    },
  },
];

const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

// --- JSON-RPC dispatch ----------------------------------------------------

const JSONRPC_VERSION = "2.0";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: any;
}

function negotiateProtocol(requested?: string): string {
  if (requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
    return requested;
  }
  return LATEST_PROTOCOL_VERSION;
}

async function dispatchRpc(
  userId: string,
  msg: JsonRpcRequest,
): Promise<object | null> {
  const id = msg.id ?? null;
  const isNotification = msg.id === undefined;

  const ok = (result: object) => ({ jsonrpc: JSONRPC_VERSION, id, result });
  const fail = (code: number, message: string, data?: unknown) => ({
    jsonrpc: JSONRPC_VERSION,
    id,
    error: { code, message, ...(data ? { data } : {}) },
  });

  switch (msg.method) {
    case "initialize":
      return ok({
        protocolVersion: negotiateProtocol(msg.params?.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return null; // notifications get no response

    case "ping":
      return ok({});

    case "tools/list":
      return ok({
        tools: TOOLS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case "tools/call": {
      const name = msg.params?.name;
      const tool = name ? TOOLS_BY_NAME.get(name) : undefined;
      if (!tool) {
        return fail(-32602, `Unknown tool: ${name}`);
      }
      const args =
        msg.params?.arguments && typeof msg.params.arguments === "object"
          ? msg.params.arguments
          : {};
      try {
        const result = await tool.handler(userId, args);
        return ok(result);
      } catch (err: any) {
        // Tool execution errors are reported in-band per MCP spec.
        return ok(errorResult(`Tool error: ${err?.message || err}`));
      }
    }

    default:
      if (isNotification) return null;
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

/**
 * Handle a single MCP Streamable-HTTP POST. The body is JSON-RPC (single or
 * batch). Responds with application/json. Stateless: no session is created.
 */
export async function handleMcpRequest(
  req: Request & { mcpUserId?: string },
  res: Response,
): Promise<void> {
  const userId = req.mcpUserId;
  if (!userId) {
    res.status(401).json({
      jsonrpc: JSONRPC_VERSION,
      error: { code: -32001, message: "Not authenticated." },
      id: null,
    });
    return;
  }

  const body = (req as any).body;

  // Parse-error guard.
  if (body == null || typeof body !== "object") {
    res.status(400).json({
      jsonrpc: JSONRPC_VERSION,
      error: { code: -32700, message: "Parse error: expected JSON-RPC body." },
      id: null,
    });
    return;
  }

  try {
    if (Array.isArray(body)) {
      const responses = (
        await Promise.all(body.map((m) => dispatchRpc(userId, m)))
      ).filter((r): r is object => r !== null);
      if (responses.length === 0) {
        res.status(202).end();
        return;
      }
      res.status(200).json(responses);
      return;
    }

    const response = await dispatchRpc(userId, body as JsonRpcRequest);
    if (response === null) {
      res.status(202).end();
      return;
    }
    res.status(200).json(response);
  } catch (err: any) {
    console.error("[mcp] request handling error:", err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: JSONRPC_VERSION,
        error: { code: -32603, message: "Internal MCP server error." },
        id: null,
      });
    }
  }
}

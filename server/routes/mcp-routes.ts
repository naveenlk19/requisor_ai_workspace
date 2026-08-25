// Task #121 — Routes for the Requisor MCP server + Personal Access Token mgmt.
//
// Two surfaces:
//   1. Session-authenticated REST endpoints (used by the in-app "Connect" page)
//      to create / list / revoke Personal Access Tokens.
//   2. The MCP endpoint itself (`/api/mcp`), authenticated by Bearer token,
//      speaking JSON-RPC over Streamable HTTP. Read-only.

import { Router } from "express";
import { isAuthenticated } from "../auth";
import { storage } from "../storage";
import {
  generatePlainToken,
  hashToken,
  tokenDisplayPrefix,
  mcpTokenAuth,
  handleMcpRequest,
} from "../services/mcp-server";

const router = Router();

function getUserId(req: any): string | undefined {
  return req.user?.dbUserId || req.user?.claims?.sub || req.user?.id;
}

// --- Token management (session auth) -------------------------------------

// List the current user's tokens (never returns the secret).
router.get("/tokens", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const tokens = await storage.getPersonalAccessTokensByUser(userId);
    res.json(
      tokens.map((t) => ({
        id: t.id,
        name: t.name,
        tokenPrefix: t.tokenPrefix,
        revoked: t.revoked,
        lastUsedAt: t.lastUsedAt,
        createdAt: t.createdAt,
      })),
    );
  } catch (error) {
    console.error("Error listing access tokens:", error);
    res.status(500).json({ message: "Failed to list access tokens" });
  }
});

// Create a new token. The plaintext is returned exactly once.
router.post("/tokens", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const rawName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const name = rawName || "MCP token";
    if (name.length > 100) {
      return res.status(400).json({ message: "Name must be 100 characters or fewer." });
    }

    const plain = generatePlainToken();
    const created = await storage.createPersonalAccessToken({
      userId,
      name,
      tokenHash: hashToken(plain),
      tokenPrefix: tokenDisplayPrefix(plain),
    });

    res.status(201).json({
      id: created.id,
      name: created.name,
      tokenPrefix: created.tokenPrefix,
      createdAt: created.createdAt,
      // Shown only once — the client must copy it now.
      token: plain,
    });
  } catch (error) {
    console.error("Error creating access token:", error);
    res.status(500).json({ message: "Failed to create access token" });
  }
});

// Revoke a token (ownership enforced).
router.delete("/tokens/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid token id" });
    }
    const ok = await storage.revokePersonalAccessToken(id, userId);
    if (!ok) return res.status(404).json({ message: "Token not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("Error revoking access token:", error);
    res.status(500).json({ message: "Failed to revoke access token" });
  }
});

export default router;

// --- MCP endpoint (Bearer-token auth) ------------------------------------
// Mounted separately at /api/mcp so it doesn't inherit the /api/mcp/tokens
// session-auth prefix. Exported for explicit mounting in routes.ts.

export const mcpProtocolRouter = Router();

// Permissive CORS for the MCP endpoint: auth is Bearer-token (never cookies),
// so this is safe and lets browser-based MCP clients connect.
mcpProtocolRouter.use((req, res, next) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, mcp-protocol-version, mcp-session-id",
    "Access-Control-Max-Age": "86400",
  });
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

mcpProtocolRouter.post("/", mcpTokenAuth, async (req, res) => {
  await handleMcpRequest(req as any, res);
});

// MCP clients may probe GET for a server-initiated SSE stream. We are stateless
// and don't push, so advertise method-not-allowed cleanly.
mcpProtocolRouter.get("/", mcpTokenAuth, (_req, res) => {
  res
    .status(405)
    .set("Allow", "POST")
    .json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "GET not supported; use POST." },
      id: null,
    });
});

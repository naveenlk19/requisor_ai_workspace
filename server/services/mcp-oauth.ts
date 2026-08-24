// Task #133 — MCP OAuth authorization flow for one-click Claude connections.
//
// Implements the pieces the MCP spec's authorization flow requires so that
// users can paste just the server URL into Claude's "Add custom connector"
// and finish auth in the browser — no token copy-paste:
//
//   * RFC 9728 Protected Resource Metadata  (/.well-known/oauth-protected-resource)
//   * RFC 8414 Authorization Server Metadata (/.well-known/oauth-authorization-server)
//   * RFC 7591 Dynamic Client Registration   (POST /api/oauth/register)
//   * Authorization Code + PKCE grant        (GET /api/oauth/authorize, POST /api/oauth/token)
//
// Design notes:
//   - Public clients only (token_endpoint_auth_method "none"); PKCE (S256)
//     binds the code exchange to the client that started the flow.
//   - The issued access token IS a Personal Access Token — the exact same
//     thing users create manually on the Connect page. `mcpTokenAuth` keeps
//     working unchanged, tokens show up in the Connect page list, and users
//     revoke them the same way.
//   - The authorize endpoint uses the normal browser session (Replit OIDC).
//     If the user isn't signed in we bounce through /api/login and back.
//   - A consent screen is always shown: registration is open to anyone, so
//     silent auto-approval would let a malicious page mint tokens for a
//     signed-in user. Approval POSTs back with a session-bound CSRF nonce.

import * as crypto from "crypto";
import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { generatePlainToken, hashToken, tokenDisplayPrefix } from "./mcp-server";

const AUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REDIRECT_URIS = 10;

// --- Base-URL helpers -------------------------------------------------------

/**
 * Derive the externally visible origin (e.g. "https://requisor.io").
 * Guarded with try/new URL per Replit env quirks (proxy headers can be odd).
 */
export function getPublicBaseUrl(req: Request): string {
  const fwdProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const proto = fwdProto || req.protocol || "https";
  const host = req.get("host") || "localhost";
  const candidate = `${proto}://${host}`;
  try {
    return new URL(candidate).origin;
  } catch {
    return `https://${host}`;
  }
}

// --- Redirect-URI validation -------------------------------------------------

/**
 * Custom URI schemes for known native MCP clients. Registration is open, so
 * anything outside this allowlist (plus https / loopback http) is rejected —
 * browser-executable schemes like javascript:, data:, file:, blob:, vbscript:
 * must never be accepted as redirect targets.
 */
const ALLOWED_CUSTOM_SCHEMES = new Set([
  "claude:",
  "claudedesktop:",
  "cursor:",
  "vscode:",
  "vscode-insiders:",
  "vscodium:",
  "windsurf:",
  "zed:",
]);

function isAcceptableRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return true;
    // Allow http only for loopback (local dev clients).
    if (
      u.protocol === "http:" &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1")
    ) {
      return true;
    }
    // Native clients with known-safe custom schemes only.
    return ALLOWED_CUSTOM_SCHEMES.has(u.protocol);
  } catch {
    return false;
  }
}

// --- Small HTML helpers ------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background: #f8fafc; color: #0f172a; margin: 0; display: flex;
         min-height: 100vh; align-items: center; justify-content: center; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,.06); max-width: 26rem; width: 100%;
          margin: 1rem; padding: 2rem; }
  h1 { font-size: 1.15rem; margin: 0 0 .5rem; }
  p { font-size: .9rem; color: #475569; line-height: 1.5; }
  ul { font-size: .85rem; color: #475569; padding-left: 1.2rem; }
  .apps { display: flex; align-items: center; gap: .5rem; font-weight: 600;
          font-size: 1rem; margin-bottom: 1rem; }
  .btnrow { display: flex; gap: .6rem; margin-top: 1.5rem; }
  button { flex: 1; padding: .6rem 1rem; border-radius: 8px; font-size: .9rem;
           cursor: pointer; border: 1px solid #cbd5e1; background: #fff; }
  button.approve { background: #059669; border-color: #059669; color: #fff; }
  .err { color: #b91c1c; }
</style>
</head>
<body><div class="card">${body}</div></body>
</html>`;
}

function errorPage(res: Response, status: number, title: string, message: string) {
  res
    .status(status)
    .type("html")
    .send(
      htmlPage(
        title,
        `<h1 class="err">${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`,
      ),
    );
}

// --- CORS (bearer/public endpoints only — never the cookie'd authorize) ------

function openCors(req: Request, res: Response): boolean {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, mcp-protocol-version",
    "Access-Control-Max-Age": "86400",
  });
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

// --- Session helpers ---------------------------------------------------------

function getSessionUserId(req: any): string | undefined {
  if (!req.user || !req.user.claims) return undefined;
  // Session must not be expired.
  const now = Math.floor(Date.now() / 1000);
  if (req.user.expires_at && now > req.user.expires_at && !req.user.refresh_token) {
    return undefined;
  }
  return req.user.dbUserId || req.user.claims?.sub || req.user.id;
}

// --- Metadata documents --------------------------------------------------

function authServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
    service_documentation: `${base}/connect`,
  };
}

function protectedResourceMetadata(base: string) {
  return {
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
    resource_name: "Requisor MCP",
    resource_documentation: `${base}/connect`,
  };
}

// --- Router -------------------------------------------------------------

export const mcpOAuthRouter = Router();

// Discovery documents. Clients probe both the root form and the
// path-inserted form (RFC 8414 §3 / RFC 9728) for a resource at /api/mcp.
for (const path of [
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-authorization-server/api/mcp",
]) {
  mcpOAuthRouter.all(path, (req, res) => {
    if (openCors(req, res)) return;
    res.json(authServerMetadata(getPublicBaseUrl(req)));
  });
}

for (const path of [
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/api/mcp",
]) {
  mcpOAuthRouter.all(path, (req, res) => {
    if (openCors(req, res)) return;
    res.json(protectedResourceMetadata(getPublicBaseUrl(req)));
  });
}

// --- Dynamic client registration (RFC 7591) -------------------------------

mcpOAuthRouter.all("/api/oauth/register", async (req, res) => {
  if (openCors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "invalid_request" });
  }
  try {
    const body = req.body ?? {};
    const redirectUris: unknown = body.redirect_uris;
    if (
      !Array.isArray(redirectUris) ||
      redirectUris.length === 0 ||
      redirectUris.length > MAX_REDIRECT_URIS ||
      !redirectUris.every(
        (u) => typeof u === "string" && u.length <= 2000 && isAcceptableRedirectUri(u),
      )
    ) {
      return res.status(400).json({
        error: "invalid_redirect_uri",
        error_description:
          "redirect_uris must be a non-empty array of https (or loopback/custom-scheme) URLs.",
      });
    }

    const name =
      typeof body.client_name === "string"
        ? body.client_name.trim().slice(0, 200)
        : null;

    const clientId = crypto.randomBytes(24).toString("base64url");
    const created = await storage.createOauthClient!({
      id: clientId,
      name,
      redirectUris: redirectUris as string[],
    });

    res.status(201).json({
      client_id: created.id,
      client_name: created.name ?? undefined,
      redirect_uris: created.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      client_id_issued_at: Math.floor(Date.now() / 1000),
    });
  } catch (err: any) {
    console.error("[mcp-oauth] register error:", err?.message || err);
    res.status(500).json({ error: "server_error" });
  }
});

// --- Authorization endpoint (browser, session-authed) ----------------------

interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  scope?: string;
}

async function validateAuthorizeRequest(
  req: Request,
  res: Response,
): Promise<{ params: AuthorizeParams; clientName: string } | null> {
  const q = req.method === "POST" ? req.body ?? {} : req.query;
  const clientId = typeof q.client_id === "string" ? q.client_id : "";
  const redirectUri = typeof q.redirect_uri === "string" ? q.redirect_uri : "";

  if (!clientId) {
    errorPage(res, 400, "Invalid request", "Missing client_id.");
    return null;
  }
  const client = await storage.getOauthClient!(clientId);
  if (!client) {
    errorPage(res, 400, "Unknown client", "This client_id is not registered.");
    return null;
  }

  // Exact-match redirect validation. Never redirect to an unregistered URI.
  let finalRedirect = redirectUri;
  if (!finalRedirect && client.redirectUris.length === 1) {
    finalRedirect = client.redirectUris[0];
  }
  if (!finalRedirect || !client.redirectUris.includes(finalRedirect)) {
    errorPage(
      res,
      400,
      "Invalid redirect",
      "The redirect_uri does not match this client's registration.",
    );
    return null;
  }

  const fail = (error: string, description: string) => {
    const u = new URL(finalRedirect);
    u.searchParams.set("error", error);
    u.searchParams.set("error_description", description);
    if (typeof q.state === "string") u.searchParams.set("state", q.state);
    res.redirect(u.href);
    return null;
  };

  if (q.response_type !== "code") {
    return fail("unsupported_response_type", "Only response_type=code is supported.");
  }
  const codeChallenge =
    typeof q.code_challenge === "string" ? q.code_challenge : undefined;
  const codeChallengeMethod =
    typeof q.code_challenge_method === "string"
      ? q.code_challenge_method
      : codeChallenge
        ? "plain"
        : undefined;
  if (!codeChallenge) {
    return fail("invalid_request", "PKCE code_challenge is required.");
  }
  if (codeChallengeMethod !== "S256") {
    return fail("invalid_request", "Only code_challenge_method=S256 is supported.");
  }

  return {
    params: {
      clientId,
      redirectUri: finalRedirect,
      state: typeof q.state === "string" ? q.state : undefined,
      codeChallenge,
      codeChallengeMethod,
      scope: typeof q.scope === "string" ? q.scope.slice(0, 200) : undefined,
    },
    clientName: client.name || "An MCP client",
  };
}

mcpOAuthRouter.get("/api/oauth/authorize", async (req: any, res) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) {
      // Bounce through login, then come back to this exact authorize URL.
      const returnTo = req.originalUrl;
      if (req.session && typeof returnTo === "string" && returnTo.startsWith("/")) {
        req.session.oauthReturnTo = returnTo;
      }
      return res.redirect("/api/login");
    }

    const validated = await validateAuthorizeRequest(req, res);
    if (!validated) return;
    const { params, clientName } = validated;

    // Session-bound CSRF nonce for the consent form.
    const csrf = crypto.randomBytes(24).toString("base64url");
    req.session.oauthConsentCsrf = csrf;

    const hidden = (name: string, value: string | undefined) =>
      value == null
        ? ""
        : `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`;

    const body = `
      <div class="apps">🔌 ${escapeHtml(clientName)} → Requisor</div>
      <h1>Allow read-only access to your Requisor data?</h1>
      <p><strong>${escapeHtml(clientName)}</strong> is asking to connect to your Requisor account. If you allow it, it will be able to:</p>
      <ul>
        <li>Read your projects &amp; tasks</li>
        <li>Search your evidence, notes and meetings</li>
        <li>Read discoveries and consolidated insights</li>
      </ul>
      <p>It can <strong>never create, change or delete</strong> anything. You can revoke access anytime from the Connect page.</p>
      <form method="POST" action="/api/oauth/authorize/decision">
        ${hidden("csrf", csrf)}
        ${hidden("client_id", params.clientId)}
        ${hidden("redirect_uri", params.redirectUri)}
        ${hidden("response_type", "code")}
        ${hidden("state", params.state)}
        ${hidden("code_challenge", params.codeChallenge)}
        ${hidden("code_challenge_method", params.codeChallengeMethod)}
        ${hidden("scope", params.scope)}
        <div class="btnrow">
          <button type="submit" name="decision" value="deny">Deny</button>
          <button type="submit" name="decision" value="approve" class="approve">Allow access</button>
        </div>
      </form>`;

    res.type("html").send(htmlPage("Connect to Requisor", body));
  } catch (err: any) {
    console.error("[mcp-oauth] authorize error:", err?.message || err);
    errorPage(res, 500, "Something went wrong", "Please try connecting again.");
  }
});

mcpOAuthRouter.post("/api/oauth/authorize/decision", async (req: any, res) => {
  try {
    const userId = getSessionUserId(req);
    if (!userId) {
      return errorPage(res, 401, "Signed out", "Your session expired. Please restart the connection from your MCP client.");
    }

    const expectedCsrf = req.session?.oauthConsentCsrf;
    const gotCsrf = typeof req.body?.csrf === "string" ? req.body.csrf : "";
    if (!expectedCsrf || gotCsrf !== expectedCsrf) {
      return errorPage(res, 403, "Invalid request", "This consent form is stale. Please restart the connection from your MCP client.");
    }
    delete req.session.oauthConsentCsrf;

    const validated = await validateAuthorizeRequest(req, res);
    if (!validated) return;
    const { params } = validated;

    const redirect = new URL(params.redirectUri);
    if (params.state) redirect.searchParams.set("state", params.state);

    if (req.body?.decision !== "approve") {
      redirect.searchParams.set("error", "access_denied");
      redirect.searchParams.set("error_description", "The user denied the request.");
      return res.redirect(redirect.href);
    }

    const code = crypto.randomBytes(32).toString("base64url");
    await storage.createOauthAuthCode!({
      codeHash: hashToken(code),
      clientId: params.clientId,
      userId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      scope: params.scope ?? "mcp",
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    });

    redirect.searchParams.set("code", code);
    res.redirect(redirect.href);
  } catch (err: any) {
    console.error("[mcp-oauth] decision error:", err?.message || err);
    errorPage(res, 500, "Something went wrong", "Please try connecting again.");
  }
});

// --- Token endpoint --------------------------------------------------------

mcpOAuthRouter.all("/api/oauth/token", async (req, res) => {
  if (openCors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "invalid_request" });
  }

  const fail = (status: number, error: string, description?: string) =>
    res.status(status).json({
      error,
      ...(description ? { error_description: description } : {}),
    });

  try {
    const body = req.body ?? {};
    if (body.grant_type !== "authorization_code") {
      return fail(
        400,
        "unsupported_grant_type",
        "Only grant_type=authorization_code is supported.",
      );
    }
    const code = typeof body.code === "string" ? body.code : "";
    const clientId = typeof body.client_id === "string" ? body.client_id : "";
    const redirectUri =
      typeof body.redirect_uri === "string" ? body.redirect_uri : "";
    const verifier =
      typeof body.code_verifier === "string" ? body.code_verifier : "";

    if (!code || code.length > 512) {
      return fail(400, "invalid_grant", "Missing or invalid code.");
    }

    const record = await storage.getOauthAuthCodeByHash!(hashToken(code));
    if (!record || record.used) {
      return fail(400, "invalid_grant", "Authorization code is invalid or already used.");
    }
    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      return fail(400, "invalid_grant", "Authorization code expired.");
    }
    if (clientId && clientId !== record.clientId) {
      return fail(400, "invalid_grant", "client_id mismatch.");
    }
    if (redirectUri && redirectUri !== record.redirectUri) {
      return fail(400, "invalid_grant", "redirect_uri mismatch.");
    }

    // PKCE verification (S256 only — enforced at authorize time).
    if (record.codeChallenge) {
      if (!verifier) {
        return fail(400, "invalid_grant", "code_verifier is required.");
      }
      const computed = crypto
        .createHash("sha256")
        .update(verifier)
        .digest("base64url");
      const a = Buffer.from(computed);
      const b = Buffer.from(record.codeChallenge);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return fail(400, "invalid_grant", "PKCE verification failed.");
      }
    }

    // Single-use: atomically burn the code before minting the token. If a
    // concurrent exchange already consumed it, this returns false.
    const consumed = await storage.markOauthAuthCodeUsed!(record.id);
    if (!consumed) {
      return fail(400, "invalid_grant", "Authorization code is invalid or already used.");
    }

    const client = await storage.getOauthClient!(record.clientId);
    const label = client?.name ? client.name.slice(0, 80) : "MCP client";
    const plain = generatePlainToken();
    await storage.createPersonalAccessToken({
      userId: record.userId,
      name: `${label} (connected via OAuth)`,
      tokenHash: hashToken(plain),
      tokenPrefix: tokenDisplayPrefix(plain),
    });

    res.json({
      access_token: plain,
      token_type: "Bearer",
      scope: record.scope ?? "mcp",
    });
  } catch (err: any) {
    console.error("[mcp-oauth] token error:", err?.message || err);
    fail(500, "server_error");
  }
});

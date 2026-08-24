/**
 * HTTP-level integration test for the MCP one-click OAuth flow (Task #133).
 *
 * Mounts an in-process Express app with the REAL `mcpOAuthRouter`
 * (server/services/mcp-oauth.ts) and the REAL `mcpProtocolRouter`
 * (server/routes/mcp-routes.ts) — the same routers wired into
 * server/routes.ts — against the real Postgres storage. Session auth is
 * stubbed with a shared in-memory session object (mirrors what
 * express-session + Replit OIDC would attach), so we exercise the exact
 * consent/CSRF/PKCE/token code paths without needing REPLIT_DOMAINS.
 *
 * Covered cases (from task-137):
 *   1. Discovery documents (all 4 well-known paths) return correct URLs
 *      derived from the request host.
 *   2. Dynamic registration rejects bad redirect URIs (javascript:, http
 *      non-loopback, empty list, missing list) and accepts https/loopback/
 *      claude: URIs.
 *   3. Authorize: unknown client -> 400; unregistered redirect_uri -> 400
 *      (never redirects); missing PKCE -> error redirect; signed-out user
 *      bounces to /api/login; consent page renders with CSRF.
 *   4. Decision endpoint enforces the session-bound CSRF nonce and
 *      deny -> access_denied redirect.
 *   5. Token endpoint rejects wrong PKCE verifier, wrong client_id, wrong
 *      redirect_uri, and replayed (already-used) codes.
 *   6. Full happy path: register -> authorize -> approve -> code -> token
 *      exchange -> Bearer token authenticates a JSON-RPC call to /api/mcp
 *      (and a bad token gets 401 with resource_metadata advertisement).
 *
 * Run with: tsx server/tests/mcp-oauth.test.ts
 */

import * as crypto from "node:crypto";
import http from "node:http";
import express from "express";
import { db, pool } from "../db";
import { storage } from "../storage";
import { mcpOAuthRouter } from "../services/mcp-oauth";
import { mcpProtocolRouter } from "../routes/mcp-routes";
import { hashToken } from "../services/mcp-server";
import {
  oauthClients,
  oauthAuthCodes,
  personalAccessTokens,
  users,
  type InsertUser,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

let failures = 0;
function assert(cond: any, msg: string) {
  if (!cond) {
    failures++;
    console.error("  ✗ ASSERT FAILED:", msg);
  } else {
    console.log("  ✓", msg);
  }
}

// --- Tiny HTTP client (keeps redirects un-followed so we can inspect them) --

interface Resp {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
  json: any;
}

function request(
  baseUrl: string,
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: string } = {},
): Promise<Resp> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(
      url,
      { method, headers: opts.headers },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json: any = null;
          try {
            json = JSON.parse(data);
          } catch {}
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            text: data,
            json,
          });
        });
      },
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

const postJson = (base: string, path: string, body: any) =>
  request(base, "POST", path, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const postForm = (base: string, path: string, form: Record<string, string>) =>
  request(base, "POST", path, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });

// --- App under test ---------------------------------------------------------

/**
 * The shared session object stands in for express-session; the real authorize
 * flow writes `oauthConsentCsrf` / `oauthReturnTo` into req.session, and the
 * decision POST reads them back — so the object must persist across requests.
 */
function buildApp(session: Record<string, any>, getUser: () => any) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use((req: any, _res, next) => {
    req.session = session;
    const u = getUser();
    if (u) req.user = u;
    next();
  });
  app.use("/api/mcp", mcpProtocolRouter);
  app.use(mcpOAuthRouter);
  return app;
}

function listen(app: express.Express): Promise<{ base: string; server: http.Server }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address() as any;
      resolve({ base: `http://127.0.0.1:${addr.port}`, server });
    });
  });
}

// --- PKCE helpers ------------------------------------------------------------

function pkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

function extractHidden(html: string, name: string): string | undefined {
  const m = html.match(
    new RegExp(`name="${name}" value="([^"]*)"`),
  );
  return m?.[1];
}

// --- Main --------------------------------------------------------------------

async function main() {
  const stamp = Date.now();
  const userId = `test-mcp-oauth-${stamp}`;
  await storage.upsertUser({
    id: userId,
    username: `mcp-oauth-${stamp}`,
    email: `mcp-oauth-${stamp}@example.com`,
    firstName: "Oauth",
    lastName: "Test",
  } as InsertUser);

  const session: Record<string, any> = {};
  let currentUser: any = {
    dbUserId: userId,
    claims: { sub: userId },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
  const app = buildApp(session, () => currentUser);
  const { base, server } = await listen(app);

  const createdClientIds: string[] = [];
  const redirectUri = "https://claude.ai/api/mcp/auth_callback";

  try {
    // ------------------------------------------------------------------
    console.log("\n[1] Discovery documents");
    for (const path of [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-authorization-server/api/mcp",
    ]) {
      const r = await request(base, "GET", path);
      assert(r.status === 200, `${path} returns 200`);
      assert(r.json?.issuer === base, `${path} issuer matches host (${r.json?.issuer})`);
      assert(
        r.json?.authorization_endpoint === `${base}/api/oauth/authorize` &&
          r.json?.token_endpoint === `${base}/api/oauth/token` &&
          r.json?.registration_endpoint === `${base}/api/oauth/register`,
        `${path} endpoints point at this host`,
      );
      assert(
        Array.isArray(r.json?.code_challenge_methods_supported) &&
          r.json.code_challenge_methods_supported.includes("S256"),
        `${path} advertises S256 PKCE`,
      );
    }
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/api/mcp",
    ]) {
      const r = await request(base, "GET", path);
      assert(r.status === 200, `${path} returns 200`);
      assert(r.json?.resource === `${base}/api/mcp`, `${path} resource is /api/mcp`);
      assert(
        Array.isArray(r.json?.authorization_servers) &&
          r.json.authorization_servers[0] === base,
        `${path} names this host as authorization server`,
      );
    }
    {
      const r = await request(base, "OPTIONS", "/.well-known/oauth-authorization-server");
      assert(r.status === 204, "OPTIONS preflight on metadata returns 204");
      assert(
        r.headers["access-control-allow-origin"] === "*",
        "metadata endpoint sends permissive CORS",
      );
    }

    // ------------------------------------------------------------------
    console.log("\n[2] Dynamic client registration");
    for (const [label, body] of [
      ["missing redirect_uris", {}],
      ["empty redirect_uris", { redirect_uris: [] }],
      ["javascript: scheme", { redirect_uris: ["javascript:alert(1)"] }],
      ["data: scheme", { redirect_uris: ["data:text/html,x"] }],
      ["http non-loopback", { redirect_uris: ["http://evil.example.com/cb"] }],
      [
        "one bad among good",
        { redirect_uris: ["https://ok.example.com/cb", "file:///etc/passwd"] },
      ],
    ] as const) {
      const r = await postJson(base, "/api/oauth/register", body);
      assert(
        r.status === 400 && r.json?.error === "invalid_redirect_uri",
        `registration rejects ${label}`,
      );
    }
    {
      const r = await request(base, "GET", "/api/oauth/register");
      assert(r.status === 405, "GET /api/oauth/register returns 405");
    }

    const reg = await postJson(base, "/api/oauth/register", {
      client_name: "Claude Test",
      redirect_uris: [redirectUri, "http://localhost:8976/cb", "claude://oauth"],
    });
    assert(reg.status === 201, "registration with https+loopback+claude: URIs succeeds");
    assert(typeof reg.json?.client_id === "string" && reg.json.client_id.length > 0, "registration returns client_id");
    assert(reg.json?.token_endpoint_auth_method === "none", "registered as public client");
    const clientId: string = reg.json.client_id;
    createdClientIds.push(clientId);

    // ------------------------------------------------------------------
    console.log("\n[3] Authorization endpoint");
    const { verifier, challenge } = pkcePair();
    const authorizeQs = (over: Record<string, string | undefined> = {}) => {
      const q = new URLSearchParams();
      const defaults: Record<string, string | undefined> = {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        state: "st-123",
        code_challenge: challenge,
        code_challenge_method: "S256",
        ...over,
      };
      for (const [k, v] of Object.entries(defaults)) if (v != null) q.set(k, v);
      return `/api/oauth/authorize?${q.toString()}`;
    };

    {
      currentUser = null; // signed out
      const r = await request(base, "GET", authorizeQs());
      assert(
        r.status === 302 && r.headers.location === "/api/login",
        "signed-out user is bounced to /api/login",
      );
      assert(
        session.oauthReturnTo?.startsWith("/api/oauth/authorize?"),
        "return-to path is stashed in the session",
      );
      currentUser = {
        dbUserId: userId,
        claims: { sub: userId },
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
    }
    {
      const r = await request(base, "GET", authorizeQs({ client_id: "nope" }));
      assert(r.status === 400, "unknown client_id -> 400 error page (no redirect)");
    }
    {
      const r = await request(
        base,
        "GET",
        authorizeQs({ redirect_uri: "https://attacker.example.com/cb" }),
      );
      assert(r.status === 400, "unregistered redirect_uri -> 400 error page (never redirects)");
    }
    {
      const r = await request(base, "GET", authorizeQs({ code_challenge: undefined, code_challenge_method: undefined }));
      const loc = String(r.headers.location || "");
      assert(
        r.status === 302 &&
          loc.startsWith(redirectUri) &&
          loc.includes("error=invalid_request") &&
          loc.includes("state=st-123"),
        "missing PKCE -> error redirect back to client with state",
      );
    }
    {
      const r = await request(base, "GET", authorizeQs({ code_challenge_method: "plain" }));
      assert(
        r.status === 302 && String(r.headers.location).includes("error=invalid_request"),
        "plain PKCE method is rejected (S256 only)",
      );
    }

    const consent = await request(base, "GET", authorizeQs());
    assert(consent.status === 200, "valid authorize request renders the consent page");
    assert(consent.text.includes("Claude Test"), "consent page shows the client name");
    const csrf = extractHidden(consent.text, "csrf");
    assert(!!csrf && session.oauthConsentCsrf === csrf, "consent page embeds the session-bound CSRF nonce");

    // ------------------------------------------------------------------
    console.log("\n[4] Decision endpoint (CSRF + deny)");
    const decisionForm = (over: Record<string, string> = {}) => ({
      csrf: csrf!,
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state: "st-123",
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "mcp",
      decision: "approve",
      ...over,
    });

    {
      const r = await postForm(base, "/api/oauth/authorize/decision", decisionForm({ csrf: "wrong" }));
      assert(r.status === 403, "wrong CSRF nonce -> 403");
    }
    {
      // Deny burns the CSRF, so re-arm the session first.
      const page = await request(base, "GET", authorizeQs());
      const freshCsrf = extractHidden(page.text, "csrf")!;
      const r = await postForm(base, "/api/oauth/authorize/decision", decisionForm({ csrf: freshCsrf, decision: "deny" }));
      const loc = String(r.headers.location || "");
      assert(
        r.status === 302 && loc.includes("error=access_denied") && loc.includes("state=st-123"),
        "deny -> access_denied redirect with state",
      );
    }

    // Approve for real.
    const page2 = await request(base, "GET", authorizeQs());
    const csrf2 = extractHidden(page2.text, "csrf")!;
    const approve = await postForm(base, "/api/oauth/authorize/decision", decisionForm({ csrf: csrf2 }));
    assert(approve.status === 302, "approve -> redirect");
    const approveLoc = new URL(String(approve.headers.location));
    const code = approveLoc.searchParams.get("code") || "";
    assert(
      approveLoc.href.startsWith(redirectUri) && code.length > 20,
      "approve redirect carries an authorization code to the registered URI",
    );
    assert(approveLoc.searchParams.get("state") === "st-123", "approve redirect echoes state");
    {
      const r = await postForm(base, "/api/oauth/authorize/decision", decisionForm({ csrf: csrf2 }));
      assert(r.status === 403, "CSRF nonce is single-use (replayed consent -> 403)");
    }

    // ------------------------------------------------------------------
    console.log("\n[5] Token endpoint rejections");
    const tokenReq = (over: Record<string, string> = {}) =>
      postForm(base, "/api/oauth/token", {
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        ...over,
      });

    {
      const r = await postForm(base, "/api/oauth/token", { grant_type: "client_credentials" });
      assert(r.status === 400 && r.json?.error === "unsupported_grant_type", "non-authorization_code grant rejected");
    }
    {
      const r = await tokenReq({ code: "definitely-not-a-real-code" });
      assert(r.status === 400 && r.json?.error === "invalid_grant", "unknown code rejected");
    }
    {
      const r = await tokenReq({ client_id: "other-client" });
      assert(r.status === 400 && r.json?.error === "invalid_grant", "client_id mismatch rejected");
    }
    {
      const r = await tokenReq({ redirect_uri: "https://claude.ai/other" });
      assert(r.status === 400 && r.json?.error === "invalid_grant", "redirect_uri mismatch rejected");
    }
    {
      const r = await tokenReq({ code_verifier: crypto.randomBytes(32).toString("base64url") });
      assert(r.status === 400 && r.json?.error === "invalid_grant", "wrong PKCE verifier rejected");
    }
    {
      const r = await postForm(base, "/api/oauth/token", {
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
      });
      assert(r.status === 400 && r.json?.error === "invalid_grant", "missing PKCE verifier rejected");
    }

    // ------------------------------------------------------------------
    console.log("\n[6] Happy-path exchange + Bearer call to /api/mcp");
    const tok = await tokenReq();
    assert(tok.status === 200, "correct verifier exchanges the code for a token");
    const accessToken: string = tok.json?.access_token || "";
    assert(accessToken.startsWith("rqsr_"), "issued token is a normal Personal Access Token");
    assert(tok.json?.token_type === "Bearer", "token_type is Bearer");

    {
      const r = await tokenReq();
      assert(r.status === 400 && r.json?.error === "invalid_grant", "replayed code is rejected (single-use)");
    }

    // The token must be visible/revocable like any manually created PAT.
    const pat = await storage.getPersonalAccessTokenByHash(hashToken(accessToken));
    assert(!!pat && pat.userId === userId, "token row belongs to the authorizing user");
    assert(
      (pat?.name || "").includes("connected via OAuth"),
      "token is labeled as an OAuth-connected token",
    );

    {
      const r = await postJson(base, "/api/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" });
      assert(r.status === 401, "MCP call without a token -> 401");
      assert(
        String(r.headers["www-authenticate"] || "").includes("resource_metadata="),
        "401 advertises resource_metadata for OAuth discovery",
      );
    }
    {
      const r = await request(base, "POST", "/api/mcp", {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer rqsr_bogus",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      assert(r.status === 401, "MCP call with a bogus token -> 401");
    }
    {
      const r = await request(base, "POST", "/api/mcp", {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      assert(r.status === 200, "OAuth-issued token authenticates against /api/mcp");
      assert(
        Array.isArray(r.json?.result?.tools) && r.json.result.tools.length > 0,
        `tools/list returns tools (${r.json?.result?.tools?.length ?? 0})`,
      );
    }
    {
      // Revoked token stops working (same lifecycle as manual PATs).
      await storage.revokePersonalAccessToken(pat!.id, userId);
      const r = await request(base, "POST", "/api/mcp", {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      });
      assert(r.status === 401, "revoked OAuth token is rejected by /api/mcp");
    }
  } finally {
    server.close();
    // Cleanup (FK order: codes -> clients; tokens -> user).
    try {
      if (createdClientIds.length) {
        await db.delete(oauthAuthCodes).where(inArray(oauthAuthCodes.clientId, createdClientIds));
        await db.delete(oauthClients).where(inArray(oauthClients.id, createdClientIds));
      }
      await db.delete(personalAccessTokens).where(eq(personalAccessTokens.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    } catch (e: any) {
      console.error("cleanup error:", e?.message || e);
    }
    await pool.end().catch(() => {});
  }

  console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} ASSERTION(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});

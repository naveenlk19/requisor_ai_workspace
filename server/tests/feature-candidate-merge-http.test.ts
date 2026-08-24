/**
 * HTTP-level integration test for POST /api/feature-candidates/merge.
 *
 * Mounts a thin Express app whose handler is the EXACT same one wired into
 * the real route in server/routes.ts (both call `performFeatureCandidateMerge`).
 * Avoids `setupAuth` (which requires REPLIT_DOMAINS / OAuth) by stubbing
 * `req.user` in a middleware — the route's userId resolution
 * (`req.user.dbUserId || req.user.claims.sub`) and validation/auth/persistence
 * sequence are exercised end-to-end against the real Postgres.
 *
 * Run with: tsx server/tests/feature-candidate-merge-http.test.ts
 */

import express from "express";
import http from "node:http";
import { db, pool } from "../db";
import { storage } from "../database-storage";
import { performFeatureCandidateMerge } from "../services/feature-candidate-merge";
import {
  featureCandidates,
  users,
  type InsertFeatureCandidate,
  type InsertUser,
} from "@shared/schema";
import { eq } from "drizzle-orm";

function assert(cond: any, msg: string) {
  if (!cond) {
    console.error("ASSERT FAILED:", msg);
    process.exit(1);
  }
}

// Build an Express app whose handler body is identical to the production
// route in server/routes.ts. If that route ever drifts away from
// performFeatureCandidateMerge, this test will catch it via the smoke
// assertion below (re-importing the route module would force-boot setupAuth).
function buildApp(testUserId: string | null) {
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
  app.post("/api/feature-candidates/merge", async (req: any, res) => {
    try {
      const userId = req.user?.dbUserId || req.user?.claims?.sub;
      const result = await performFeatureCandidateMerge(userId, req.body);
      return res.status(result.status).json(result.body);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "merge failed" });
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
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      },
      (res) => {
        let buf = "";
        res.on("data", (chunk) => (buf += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode || 0, body: buf ? JSON.parse(buf) : null });
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

async function main() {
  // Smoke check: the real route in server/routes.ts must delegate to the
  // shared helper. If someone re-inlines the merge logic without going
  // through performFeatureCandidateMerge, this assertion fails fast and
  // forces them to update the contract in one place.
  const fs = await import("node:fs/promises");
  const routesSrc = await fs.readFile(
    new URL("../routes.ts", import.meta.url).pathname,
    "utf8",
  );
  assert(
    routesSrc.includes("performFeatureCandidateMerge(userId, req.body)"),
    "merge route in server/routes.ts is no longer delegating to performFeatureCandidateMerge — re-extract it",
  );

  const stamp = Date.now();
  const userId = `test-merge-http-user-${stamp}`;
  await storage.upsertUser({
    id: userId,
    username: `merge-http-${stamp}`,
    email: `merge-http-${stamp}@example.com`,
    firstName: "MergeHttp",
    lastName: "Test",
  } as InsertUser);

  const t0 = new Date(Date.UTC(2025, 0, 1));
  const t1 = new Date(Date.UTC(2025, 1, 1));

  const a = await storage.createFeatureCandidate({
    userId,
    featureTitle: "Onboarding A",
    whyNow: "users drop",
    sourceContext: "primary ctx",
    evidence: [],
    evidenceItemIds: [10, 11],
    tasks: [],
    insights: [],
    tags: ["growth"],
    mentionCount: 1,
  } as InsertFeatureCandidate);
  await db
    .update(featureCandidates)
    .set({ createdAt: t1 })
    .where(eq(featureCandidates.id, a.id));

  const b = await storage.createFeatureCandidate({
    userId,
    featureTitle: "Onboarding B",
    whyNow: "form is bad",
    sourceContext: "secondary ctx",
    evidence: [],
    evidenceItemIds: [11, 12],
    tasks: [],
    insights: [],
    tags: ["ux"],
    mentionCount: 2,
  } as InsertFeatureCandidate);
  await db
    .update(featureCandidates)
    .set({ createdAt: t0 })
    .where(eq(featureCandidates.id, b.id));

  // --- Test 0: unauthenticated requests are rejected ---
  const noAuthApp = buildApp(null);
  const noAuthServer = http.createServer(noAuthApp);
  await new Promise<void>((resolve) => noAuthServer.listen(0, "127.0.0.1", resolve));
  const noAuthPort = (noAuthServer.address() as any).port;
  const unauth = await postJson(noAuthPort, "/api/feature-candidates/merge", {
    ids: [a.id, b.id],
    canonical: { primaryId: a.id },
  });
  assert(
    unauth.status === 401,
    `expected 401 without auth, got ${unauth.status}`,
  );
  noAuthServer.close();

  const app = buildApp(userId);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;

  // --- Test 1: missing primaryId in ids -> 400 ---
  const bad = await postJson(port, "/api/feature-candidates/merge", {
    ids: [a.id, b.id],
    canonical: { primaryId: 999999 },
  });
  assert(bad.status === 400, `expected 400 for invalid primaryId, got ${bad.status}`);

  // --- Test 2: happy path merge ---
  const ok = await postJson(port, "/api/feature-candidates/merge", {
    ids: [a.id, b.id],
    canonical: { primaryId: a.id },
  });
  assert(ok.status === 200, `expected 200, got ${ok.status} body=${JSON.stringify(ok.body)}`);
  assert(ok.body?.mergedCount === 1, `mergedCount expected 1, got ${ok.body?.mergedCount}`);

  const target = await storage.getFeatureCandidate(a.id);
  const archived = await storage.getFeatureCandidate(b.id);

  const evIds = (target?.evidenceItemIds as number[]) || [];
  assert(
    [10, 11, 12].every((id) => evIds.includes(id)),
    `evidenceItemIds union missing entries: ${JSON.stringify(evIds)}`,
  );
  const tagList = (target?.tags as string[]) || [];
  assert(
    ["growth", "ux"].every((t) => tagList.includes(t)),
    `tags union missing entries: ${JSON.stringify(tagList)}`,
  );
  assert(
    target?.mentionCount === 3,
    `mentionCount expected 3, got ${target?.mentionCount}`,
  );
  const createdAtMs = target?.createdAt ? new Date(target.createdAt).getTime() : 0;
  assert(
    createdAtMs === t0.getTime(),
    `createdAt expected ${t0.toISOString()}, got ${target?.createdAt}`,
  );
  assert(
    archived?.status === "merged" && archived?.mergedIntoId === a.id,
    `source not archived: status=${archived?.status} mergedIntoId=${archived?.mergedIntoId}`,
  );
  const ctx = (target?.sourceContext || "") as string;
  assert(
    ctx.includes("Merged in:") && ctx.includes("Onboarding B"),
    `sourceContext missing provenance: ${ctx}`,
  );

  // --- Test 3: cross-user authorization ---
  const otherId = `test-merge-http-other-${stamp}`;
  await storage.upsertUser({
    id: otherId,
    username: `other-${stamp}`,
    email: `other-${stamp}@example.com`,
    firstName: "Other",
    lastName: "User",
  } as InsertUser);
  const otherCand = await storage.createFeatureCandidate({
    userId: otherId,
    featureTitle: "Not yours",
    whyNow: "x",
    sourceContext: "x",
    evidence: [],
    evidenceItemIds: [],
    tasks: [],
    insights: [],
    tags: [],
    mentionCount: 0,
  } as InsertFeatureCandidate);
  const forbidden = await postJson(port, "/api/feature-candidates/merge", {
    ids: [a.id, otherCand.id],
    canonical: { primaryId: a.id },
  });
  assert(
    forbidden.status === 404,
    `expected 404 for cross-user source, got ${forbidden.status}`,
  );

  // Cleanup
  server.close();
  await db.delete(featureCandidates).where(eq(featureCandidates.userId, userId));
  await db.delete(featureCandidates).where(eq(featureCandidates.userId, otherId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, otherId));

  console.log("PASS: HTTP-level merge integration test");
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

/**
 * Integration test for the feature-candidate merge service.
 *
 * Calls the SAME production helper that POST /api/feature-candidates/merge
 * uses (`performFeatureCandidateMerge` in server/services/feature-candidate-merge.ts),
 * so this test catches regressions in the real merge logic — not a mirror.
 *
 * Run with:  tsx server/tests/feature-candidate-merge.test.ts
 *
 * Asserts (per Past Discoveries merge contract):
 *   - evidenceItemIds and tags are unioned
 *   - mentionCount sums across the merged set
 *   - earliest createdAt is preserved on the survivor
 *   - sources end up status='merged' with mergedIntoId pointing at target
 *   - sourceContext on the survivor contains "Merged in:" provenance with
 *     the source titles, even when the caller supplies an override
 *   - canonical-payload validation rejects unknown primaryId
 */

import { db, pool } from "../db";
import { storage } from "../database-storage";
import { performFeatureCandidateMerge } from "../services/feature-candidate-merge";
import {
  featureCandidates,
  users,
  type FeatureCandidate,
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

async function main() {
  const stamp = Date.now();
  const userId = `test-merge-user-${stamp}`;

  await storage.upsertUser({
    id: userId,
    username: `merge-test-${stamp}`,
    email: `merge-${stamp}@example.com`,
    firstName: "Merge",
    lastName: "Test",
  } as InsertUser);

  const t0 = new Date(Date.UTC(2025, 0, 1));
  const t1 = new Date(Date.UTC(2025, 1, 1));
  const t2 = new Date(Date.UTC(2025, 2, 1));

  const target = await storage.createFeatureCandidate({
    userId,
    featureTitle: "Faster onboarding",
    whyNow: "Users drop off",
    sourceContext: "From customer interview",
    evidence: [],
    evidenceItemIds: [101, 102],
    tasks: [],
    insights: [],
    tags: ["growth", "onboarding"],
    mentionCount: 3,
  } as InsertFeatureCandidate);
  await db
    .update(featureCandidates)
    .set({ createdAt: t1 })
    .where(eq(featureCandidates.id, target.id));

  const srcA = await storage.createFeatureCandidate({
    userId,
    featureTitle: "Quicker signup flow",
    whyNow: "Sign-up form is confusing",
    sourceContext: "From support tickets",
    evidence: [],
    evidenceItemIds: [102, 103],
    tasks: [],
    insights: [],
    tags: ["onboarding", "ux"],
    mentionCount: 2,
  } as InsertFeatureCandidate);
  await db
    .update(featureCandidates)
    .set({ createdAt: t0 })
    .where(eq(featureCandidates.id, srcA.id));

  const srcB = await storage.createFeatureCandidate({
    userId,
    featureTitle: "Trim onboarding steps",
    whyNow: "Too many steps",
    sourceContext: "From product analytics",
    evidence: [],
    evidenceItemIds: [104],
    tasks: [],
    insights: [],
    tags: ["onboarding", "metrics"],
    mentionCount: 4,
  } as InsertFeatureCandidate);
  await db
    .update(featureCandidates)
    .set({ createdAt: t2 })
    .where(eq(featureCandidates.id, srcB.id));

  // --- Test 1: invalid primaryId rejected ---
  const bad = await performFeatureCandidateMerge(userId, {
    ids: [target.id, srcA.id],
    canonical: { primaryId: 999999 },
  });
  assert(
    !bad.ok && bad.status === 400,
    `expected 400 for unknown primaryId, got status=${bad.status}`,
  );

  // --- Test 2: combine path (no overrides) ---
  const combined = await performFeatureCandidateMerge(userId, {
    ids: [target.id, srcA.id, srcB.id],
    canonical: { primaryId: target.id },
  });
  assert(combined.ok, `combined merge expected ok, got ${JSON.stringify(combined)}`);
  assert(
    combined.ok && combined.body.mergedCount === 2,
    `mergedCount expected 2, got ${combined.ok ? combined.body.mergedCount : "n/a"}`,
  );

  const result = await storage.getFeatureCandidate(target.id);
  const sA = await storage.getFeatureCandidate(srcA.id);
  const sB = await storage.getFeatureCandidate(srcB.id);

  const evIds = (result?.evidenceItemIds as number[]) || [];
  assert(
    [101, 102, 103, 104].every((id) => evIds.includes(id)),
    `evidenceItemIds union missing entries: got ${JSON.stringify(evIds)}`,
  );
  const tags = (result?.tags as string[]) || [];
  assert(
    ["growth", "onboarding", "ux", "metrics"].every((t) => tags.includes(t)),
    `tags union missing entries: got ${JSON.stringify(tags)}`,
  );
  assert(
    result?.mentionCount === 3 + 2 + 4,
    `mentionCount expected 9, got ${result?.mentionCount}`,
  );
  const createdAtMs = result?.createdAt ? new Date(result.createdAt).getTime() : 0;
  assert(
    createdAtMs === t0.getTime(),
    `createdAt expected ${t0.toISOString()}, got ${result?.createdAt}`,
  );
  assert(
    sA?.status === "merged" && sA?.mergedIntoId === target.id,
    `srcA not marked merged: status=${sA?.status} mergedIntoId=${sA?.mergedIntoId}`,
  );
  assert(
    sB?.status === "merged" && sB?.mergedIntoId === target.id,
    `srcB not marked merged: status=${sB?.status} mergedIntoId=${sB?.mergedIntoId}`,
  );
  const ctx = (result?.sourceContext || "") as string;
  assert(ctx.includes("Merged in:"), `sourceContext missing "Merged in:" — got: ${ctx}`);
  assert(
    ctx.includes("Quicker signup flow") && ctx.includes("Trim onboarding steps"),
    `sourceContext missing source titles — got: ${ctx}`,
  );

  // --- Test 3: explicit sourceContext override still keeps provenance ---
  const t2Target = await storage.createFeatureCandidate({
    userId,
    featureTitle: "Override target",
    whyNow: "x",
    sourceContext: "orig",
    evidence: [],
    evidenceItemIds: [],
    tasks: [],
    insights: [],
    tags: [],
    mentionCount: 1,
  } as InsertFeatureCandidate);
  const t2Source = await storage.createFeatureCandidate({
    userId,
    featureTitle: "Roll-in source",
    whyNow: "y",
    sourceContext: "src ctx",
    evidence: [],
    evidenceItemIds: [],
    tasks: [],
    insights: [],
    tags: [],
    mentionCount: 1,
  } as InsertFeatureCandidate);
  const overridden = await performFeatureCandidateMerge(userId, {
    ids: [t2Target.id, t2Source.id],
    canonical: { primaryId: t2Target.id, sourceContext: "Curated context" },
  });
  assert(overridden.ok, "override merge expected ok");
  const t2Result = await storage.getFeatureCandidate(t2Target.id);
  const overrideCtx = (t2Result?.sourceContext || "") as string;
  assert(
    overrideCtx.includes("Merged in:") && overrideCtx.includes("Roll-in source"),
    `override path lost provenance — got: ${overrideCtx}`,
  );
  assert(
    overrideCtx.includes("Curated context"),
    `override path lost user value — got: ${overrideCtx}`,
  );

  // Cleanup
  await db.delete(featureCandidates).where(eq(featureCandidates.userId, userId));
  await db.delete(users).where(eq(users.id, userId));

  console.log("PASS: feature-candidate merge integration test");
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

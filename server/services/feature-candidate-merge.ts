/**
 * Shared merge logic for feature candidates ("discoveries").
 *
 * Extracted from the POST /api/feature-candidates/merge route so that route
 * handlers and integration tests exercise the same production code path —
 * tests no longer have to mirror this math.
 */

import { z } from "zod";
import { storage } from "../database-storage";
import type { FeatureCandidate } from "@shared/schema";

export const mergeCanonicalSchema = z.object({
  ids: z.array(z.number().int().positive()).min(2),
  canonical: z
    .object({
      primaryId: z.number().int().positive(),
      featureTitle: z.string().min(1).max(500).optional(),
      whyNow: z.string().nullable().optional(),
      sourceContext: z.string().nullable().optional(),
      tags: z.array(z.string()).optional(),
      impactScore: z.number().nullable().optional(),
      effortScore: z.number().nullable().optional(),
      confidenceScore: z.number().nullable().optional(),
    })
    .optional(),
});

export const mergeLegacySchema = z.object({
  targetId: z.number().int().positive(),
  sourceIds: z.array(z.number().int().positive()).min(1),
  newTitle: z.string().min(1).max(500).optional(),
});

export type MergeResult =
  | { ok: true; status: 200; body: { target: FeatureCandidate; mergedCount: number } }
  | { ok: false; status: 400 | 401 | 404 | 500; body: { error: string; details?: unknown } };

export async function performFeatureCandidateMerge(
  userId: string | undefined,
  body: unknown,
): Promise<MergeResult> {
  if (!userId) return { ok: false, status: 401, body: { error: "Unauthorized" } };

  let targetId: number;
  let sourceIds: number[];
  let canonicalOverrides: {
    featureTitle?: string;
    whyNow?: string | null;
    sourceContext?: string | null;
    tags?: string[];
    impactScore?: number | null;
    effortScore?: number | null;
    confidenceScore?: number | null;
  } = {};

  const canonicalParse = mergeCanonicalSchema.safeParse(body);
  if (canonicalParse.success) {
    const ids = Array.from(new Set(canonicalParse.data.ids));
    const primary = canonicalParse.data.canonical?.primaryId ?? ids[0];
    if (!ids.includes(primary)) {
      return { ok: false, status: 400, body: { error: "primaryId must be one of ids" } };
    }
    targetId = primary;
    sourceIds = ids.filter((id) => id !== primary);
    if (canonicalParse.data.canonical) {
      const { primaryId: _p, ...rest } = canonicalParse.data.canonical;
      canonicalOverrides = rest;
    }
  } else {
    const legacyParse = mergeLegacySchema.safeParse(body);
    if (!legacyParse.success) {
      return {
        ok: false,
        status: 400,
        body: { error: "Invalid merge payload", details: legacyParse.error.flatten() },
      };
    }
    targetId = legacyParse.data.targetId;
    sourceIds = legacyParse.data.sourceIds;
    if (legacyParse.data.newTitle) canonicalOverrides.featureTitle = legacyParse.data.newTitle;
  }

  if (sourceIds.length === 0) {
    return { ok: false, status: 400, body: { error: "Need at least one source to merge" } };
  }
  if (sourceIds.includes(targetId)) {
    return { ok: false, status: 400, body: { error: "Target cannot also be a source" } };
  }

  const target = await storage.getFeatureCandidate(targetId);
  if (!target || target.userId !== userId) {
    return { ok: false, status: 404, body: { error: "Target discovery not found" } };
  }

  const sources: FeatureCandidate[] = [];
  for (const sid of sourceIds) {
    const c = await storage.getFeatureCandidate(sid);
    if (!c || c.userId !== userId) {
      return { ok: false, status: 404, body: { error: `Discovery #${sid} not found` } };
    }
    sources.push(c);
  }

  const allDiscoveries: FeatureCandidate[] = [target, ...sources];
  const combinedEvidence = Array.from(
    new Set(
      allDiscoveries
        .flatMap((c) => (Array.isArray(c.evidence) ? (c.evidence as unknown[]) : []))
        .filter((e): e is string => typeof e === "string" && e.trim().length > 0),
    ),
  );
  const combinedEvidenceItemIds = Array.from(
    new Set(
      allDiscoveries.flatMap((c) =>
        Array.isArray(c.evidenceItemIds) ? (c.evidenceItemIds as number[]) : [],
      ),
    ),
  );
  const combinedTags = Array.from(
    new Set(
      allDiscoveries
        .flatMap((c) => (Array.isArray(c.tags) ? (c.tags as unknown[]) : []))
        .filter((t): t is string => typeof t === "string"),
    ),
  );
  const combinedTasks = allDiscoveries.flatMap((c) =>
    Array.isArray(c.tasks) ? (c.tasks as unknown[]) : [],
  );
  const totalMentions = allDiscoveries.reduce(
    (sum, c) => sum + (c.mentionCount || 1),
    0,
  );
  const whyParts = allDiscoveries
    .map((c) => (c.whyNow || "").trim())
    .filter((s) => s.length > 0);
  const mergedWhy =
    whyParts.length > 0 ? Array.from(new Set(whyParts)).join("\n\n— ") : null;

  const maxOf = (key: "impactScore" | "effortScore" | "confidenceScore"): number | null => {
    const values = allDiscoveries
      .map((c) => (typeof (c as any)[key] === "number" ? ((c as any)[key] as number) : null))
      .filter((v): v is number => v !== null);
    return values.length > 0 ? Math.max(...values) : null;
  };
  const mergedImpact = maxOf("impactScore");
  const mergedEffort = maxOf("effortScore");
  const mergedConfidence = maxOf("confidenceScore");
  let mergedRice: number | null = null;
  if (mergedImpact != null && mergedEffort != null && mergedConfidence != null) {
    const denom = Math.max(mergedEffort, 1);
    mergedRice = Math.round((mergedImpact * mergedConfidence) / denom);
  } else {
    const riceVals = allDiscoveries
      .map((c) => (typeof c.riceScore === "number" ? (c.riceScore as number) : null))
      .filter((v): v is number => v !== null);
    mergedRice = riceVals.length > 0 ? Math.max(...riceVals) : null;
  }

  const earliestCreatedAt = allDiscoveries
    .map((c) => (c.createdAt ? new Date(c.createdAt as any).getTime() : null))
    .filter((v): v is number => v !== null)
    .reduce<number | null>((min, t) => (min == null || t < min ? t : min), null);

  const referencesLine =
    sources.length > 0
      ? `Merged in: ${sources.map((s) => `"${s.featureTitle}"`).join(", ")}`
      : "";
  const targetSourceContext = (target.sourceContext || "").trim();
  const mergedSourceContext = [referencesLine, targetSourceContext]
    .filter((s) => s.length > 0)
    .join("\n");

  const updates: Partial<FeatureCandidate> = {
    featureTitle: canonicalOverrides.featureTitle?.trim() || target.featureTitle,
    whyNow:
      canonicalOverrides.whyNow !== undefined ? canonicalOverrides.whyNow : mergedWhy,
    evidence: combinedEvidence,
    evidenceItemIds: combinedEvidenceItemIds,
    tags:
      canonicalOverrides.tags && canonicalOverrides.tags.length > 0
        ? Array.from(
            new Set(
              canonicalOverrides.tags
                .map((t) => t.trim().toLowerCase())
                .filter(Boolean),
            ),
          )
        : combinedTags,
    tasks: combinedTasks,
    mentionCount: totalMentions,
    impactScore:
      canonicalOverrides.impactScore !== undefined
        ? canonicalOverrides.impactScore
        : mergedImpact,
    effortScore:
      canonicalOverrides.effortScore !== undefined
        ? canonicalOverrides.effortScore
        : mergedEffort,
    confidenceScore:
      canonicalOverrides.confidenceScore !== undefined
        ? canonicalOverrides.confidenceScore
        : mergedConfidence,
    riceScore: mergedRice,
    // Always preserve "Merged in: …" provenance — even when the caller
    // supplied an explicit sourceContext override — so the merged record
    // never loses the audit trail of which discoveries were rolled in.
    sourceContext:
      canonicalOverrides.sourceContext !== undefined
        ? [referencesLine, canonicalOverrides.sourceContext]
            .filter((s) => s && s.length > 0)
            .join("\n") || null
        : mergedSourceContext || target.sourceContext || null,
  };
  if (earliestCreatedAt != null) {
    updates.createdAt = new Date(earliestCreatedAt);
  }

  const updated = await storage.updateFeatureCandidate(targetId, updates);

  for (const s of sources) {
    await storage.updateFeatureCandidate(s.id, {
      status: "merged",
      mergedIntoId: targetId,
    } as Partial<FeatureCandidate>);
  }

  return { ok: true, status: 200, body: { target: updated as FeatureCandidate, mergedCount: sources.length } };
}

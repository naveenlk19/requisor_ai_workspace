import { db } from "../db";
import { tokenUsage, tokenBudgets, users, subscriptionPlans } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "whisper-1": { input: 0.006, output: 0 },
  system: { input: 0, output: 0 },
};

const PLAN_LIMITS: Record<string, number> = {
  free: 100000,
  pro: 1000000,
  business: 10000000,
  enterprise: 20000000,
};

export const MEETING_TOKEN_COSTS = {
  meeting_create: 500,
  transcript_fetch: 2000,
  whisper_per_minute: 1500,
  assemblyai_per_minute: 2000,
} as const;

export type MeetingFeature =
  | "meeting_create_teams"
  | "meeting_create_google"
  | "meeting_create_zoom"
  | "transcript_fetch_teams"
  | "transcript_fetch_google"
  | "transcript_fetch_zoom"
  | "whisper_transcribe"
  | "assemblyai_transcribe";

export interface TokenTrackingResult {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  budgetRemaining: number | null;
  budgetWarning: boolean;
  budgetExceeded: boolean;
}

export interface BudgetCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
  percentUsed: number;
  warning: boolean;
  degradeToMini: boolean;
}

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING["gpt-4o"];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

function getMonthResetDate(): Date {
  const now = new Date();
  const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return resetDate;
}

async function getUserPlanSlug(userId: string): Promise<string> {
  try {
    const result = await db
      .select({ slug: subscriptionPlans.slug })
      .from(users)
      .leftJoin(subscriptionPlans, eq(users.planId, subscriptionPlans.id))
      .where(eq(users.id, userId));
    return result[0]?.slug || "free";
  } catch {
    return "free";
  }
}

/**
 * Resolve the monthly token limit for a plan. Reads from the
 * subscription_plans table first (source of truth) and falls back to the
 * hardcoded PLAN_LIMITS map if the row is missing or the column is null.
 */
async function getPlanTokenLimit(planSlug: string): Promise<number> {
  try {
    const rows = await db
      .select({ limit: subscriptionPlans.monthlyTokenLimit })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.slug, planSlug));
    const dbLimit = rows[0]?.limit;
    if (typeof dbLimit === "number" && dbLimit > 0) return dbLimit;
  } catch {
    // fall through to hardcoded fallback
  }
  return PLAN_LIMITS[planSlug] ?? PLAN_LIMITS.free;
}

export async function ensureTokenBudget(userId: string, planSlug?: string): Promise<void> {
  try {
    const resolvedSlug = planSlug || await getUserPlanSlug(userId);
    const limit = await getPlanTokenLimit(resolvedSlug);
    await db.execute(sql`
      INSERT INTO token_budgets (user_id, monthly_limit, tokens_used_this_month, reset_date)
      VALUES (${userId}, ${limit}, 0, ${getMonthResetDate().toISOString()})
      ON CONFLICT (user_id) DO NOTHING
    `);

    const existing = await db.select().from(tokenBudgets).where(eq(tokenBudgets.userId, userId));
    if (existing.length > 0) {
      const budget = existing[0];
      const updates: Record<string, any> = {};
      if (new Date() >= new Date(budget.resetDate)) {
        updates.tokensUsedThisMonth = 0;
        updates.resetDate = getMonthResetDate();
        updates.degradedMode = false;
      }
      // Only raise the budget toward the plan limit; never lower a user that
      // has already been granted (or backfilled to) more than the current
      // plan-derived limit. This preserves custom over-allocations and means
      // existing Free users are automatically lifted to the new 100K ceiling
      // on their next request (no migration needed).
      if (budget.monthlyLimit < limit) {
        updates.monthlyLimit = limit;
      }
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        await db.update(tokenBudgets).set(updates).where(eq(tokenBudgets.userId, userId));
      }
    }
  } catch (error) {
    console.error("Error ensuring token budget:", error);
  }
}

export async function checkTokenBudget(userId: string): Promise<BudgetCheckResult> {
  try {
    await ensureTokenBudget(userId);
    const budgets = await db.select().from(tokenBudgets).where(eq(tokenBudgets.userId, userId));

    if (budgets.length === 0) {
      return { allowed: true, remaining: 100000, limit: 100000, used: 0, percentUsed: 0, warning: false, degradeToMini: false };
    }

    const budget = budgets[0];
    const remaining = budget.monthlyLimit - budget.tokensUsedThisMonth;
    const percentUsed = (budget.tokensUsedThisMonth / budget.monthlyLimit) * 100;

    return {
      allowed: remaining > 0,
      remaining: Math.max(0, remaining),
      limit: budget.monthlyLimit,
      used: budget.tokensUsedThisMonth,
      percentUsed: Math.round(percentUsed * 10) / 10,
      warning: percentUsed >= 80,
      // Degrade to gpt-4o-mini once 75% of the monthly budget is used so the
      // remaining budget stretches further (mini is ~17x cheaper per token).
      degradeToMini: percentUsed >= 75,
    };
  } catch (error) {
    console.error("Error checking token budget:", error);
    return { allowed: true, remaining: 100000, limit: 100000, used: 0, percentUsed: 0, warning: false, degradeToMini: false };
  }
}

export async function trackTokenUsage(
  userId: string,
  feature: string,
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null | undefined,
  extraMetadata?: Record<string, any>,
): Promise<TokenTrackingResult> {
  const inputTokens = usage?.prompt_tokens || 0;
  const outputTokens = usage?.completion_tokens || 0;
  const totalTokens = usage?.total_tokens || inputTokens + outputTokens;
  const estimatedCost = calculateCost(model, inputTokens, outputTokens);

  try {
    await ensureTokenBudget(userId);

    await db.insert(tokenUsage).values({
      userId,
      feature,
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCost: estimatedCost.toFixed(6),
      metadata: extraMetadata || null,
    });

    await db.update(tokenBudgets).set({
      tokensUsedThisMonth: sql`tokens_used_this_month + ${totalTokens}`,
      updatedAt: new Date(),
    }).where(eq(tokenBudgets.userId, userId));

    const budgetCheck = await checkTokenBudget(userId);

    return {
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCost,
      budgetRemaining: budgetCheck.remaining,
      budgetWarning: budgetCheck.warning,
      budgetExceeded: !budgetCheck.allowed,
    };
  } catch (error) {
    console.error("Error tracking token usage:", error);
    return {
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCost,
      budgetRemaining: null,
      budgetWarning: false,
      budgetExceeded: false,
    };
  }
}

export async function getTokenUsageSummary(userId: string) {
  try {
    const budgetCheck = await checkTokenBudget(userId);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthlyUsage = await db
      .select({
        feature: tokenUsage.feature,
        model: tokenUsage.model,
        totalInput: sql<number>`SUM(${tokenUsage.inputTokens})`.as("total_input"),
        totalOutput: sql<number>`SUM(${tokenUsage.outputTokens})`.as("total_output"),
        totalTokens: sql<number>`SUM(${tokenUsage.totalTokens})`.as("total_tokens"),
        totalCost: sql<string>`SUM(CAST(${tokenUsage.estimatedCost} AS DECIMAL(12,6)))`.as("total_cost"),
        callCount: sql<number>`COUNT(*)`.as("call_count"),
      })
      .from(tokenUsage)
      .where(
        and(
          eq(tokenUsage.userId, userId),
          gte(tokenUsage.createdAt, monthStart),
        ),
      )
      .groupBy(tokenUsage.feature, tokenUsage.model);

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayUsage = await db
      .select({
        totalTokens: sql<number>`COALESCE(SUM(${tokenUsage.totalTokens}), 0)`.as("total_tokens"),
        totalCost: sql<string>`COALESCE(SUM(CAST(${tokenUsage.estimatedCost} AS DECIMAL(12,6))), 0)`.as("total_cost"),
        callCount: sql<number>`COUNT(*)`.as("call_count"),
      })
      .from(tokenUsage)
      .where(
        and(
          eq(tokenUsage.userId, userId),
          gte(tokenUsage.createdAt, todayStart),
        ),
      );

    const recentCalls = await db
      .select()
      .from(tokenUsage)
      .where(eq(tokenUsage.userId, userId))
      .orderBy(sql`${tokenUsage.createdAt} DESC`)
      .limit(20);

    return {
      budget: {
        limit: budgetCheck.limit,
        used: budgetCheck.used,
        remaining: budgetCheck.remaining,
        percentUsed: budgetCheck.percentUsed,
        warning: budgetCheck.warning,
        exceeded: !budgetCheck.allowed,
      },
      today: {
        totalTokens: Number(todayUsage[0]?.totalTokens || 0),
        totalCost: parseFloat(String(todayUsage[0]?.totalCost || "0")),
        callCount: Number(todayUsage[0]?.callCount || 0),
      },
      monthly: {
        byFeature: monthlyUsage.map((row) => ({
          feature: row.feature,
          model: row.model,
          inputTokens: Number(row.totalInput),
          outputTokens: Number(row.totalOutput),
          totalTokens: Number(row.totalTokens),
          estimatedCost: parseFloat(String(row.totalCost)),
          callCount: Number(row.callCount),
        })),
      },
      recentCalls: recentCalls.map((r) => ({
        id: r.id,
        feature: r.feature,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        totalTokens: r.totalTokens,
        estimatedCost: parseFloat(r.estimatedCost),
        createdAt: r.createdAt,
      })),
    };
  } catch (error) {
    console.error("Error getting token usage summary:", error);
    return {
      budget: { limit: 0, used: 0, remaining: 0, percentUsed: 0, warning: false, exceeded: false },
      today: { totalTokens: 0, totalCost: 0, callCount: 0 },
      monthly: { byFeature: [] },
      recentCalls: [],
    };
  }
}

export async function getModelForBudget(userId: string, preferredModel: string): Promise<string> {
  const budget = await checkTokenBudget(userId);
  if (budget.degradeToMini && preferredModel === "gpt-4o") {
    return "gpt-4o-mini";
  }
  return preferredModel;
}

/**
 * Charge a flat number of tokens against the user's budget for a non-AI action
 * (meeting create, transcript fetch, whisper transcription).
 * Returns whether the action should proceed and the budget snapshot.
 */
export async function consumeMeetingTokens(
  userId: string,
  feature: MeetingFeature,
  tokens: number,
  metadata?: Record<string, any>,
): Promise<{ allowed: boolean; budget: BudgetCheckResult; cost: number }> {
  const pre = await checkTokenBudget(userId);
  if (!pre.allowed || pre.remaining < tokens) {
    return { allowed: false, budget: pre, cost: tokens };
  }

  await trackTokenUsage(
    userId,
    feature,
    "system",
    { prompt_tokens: tokens, completion_tokens: 0, total_tokens: tokens },
    { ...(metadata || {}), unit: "flat_meeting_charge" },
  );

  const post = await checkTokenBudget(userId);
  return { allowed: true, budget: post, cost: tokens };
}

/**
 * Build the standard 402 payload the frontend uses to open the upgrade modal.
 */
export function buildBudgetExceededPayload(
  feature: MeetingFeature,
  budget: BudgetCheckResult,
  cost: number,
) {
  const featureLabels: Record<MeetingFeature, string> = {
    meeting_create_teams: "create a Microsoft Teams meeting",
    meeting_create_google: "create a Google Meet meeting",
    meeting_create_zoom: "create a Zoom meeting",
    transcript_fetch_teams: "fetch a Teams transcript",
    transcript_fetch_google: "fetch a Google Meet transcript",
    transcript_fetch_zoom: "fetch a Zoom transcript",
    whisper_transcribe: "transcribe audio",
    assemblyai_transcribe: "transcribe audio with speaker diarization",
  };
  return {
    error: "token_limit_exceeded",
    reason: "meeting_limit",
    feature,
    message: `You've used ${budget.used.toLocaleString()} of your ${budget.limit.toLocaleString()} monthly tokens. To ${featureLabels[feature]} you need ${cost.toLocaleString()} tokens. Upgrade your plan to continue.`,
    cost,
    budget,
  };
}

export async function updateUserTokenLimit(userId: string, planSlug: string): Promise<void> {
  const limit = await getPlanTokenLimit(planSlug);
  try {
    await db.update(tokenBudgets).set({
      monthlyLimit: limit,
      updatedAt: new Date(),
    }).where(eq(tokenBudgets.userId, userId));
  } catch (error) {
    console.error("Error updating user token limit:", error);
  }
}

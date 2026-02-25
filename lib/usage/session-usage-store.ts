/**
 * Token usage and cost store per chat session.
 * Persists to .openpaw/usage.json for local dev (survives restarts).
 * In-memory fallback for serverless where filesystem is ephemeral.
 */

import {
  extractTokenUsageFromResponseBody,
  calculateRequestCost,
} from "llm-cost-utils";
import type { LanguageModelUsage } from "ai";
import * as fs from "node:fs";
import * as path from "node:path";

export interface UsageRecord {
  timestamp: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  cacheHitTokens?: number;
  cacheSavingsUsd?: number;
}

const USAGE_FILE = path.join(process.cwd(), ".openpaw", "usage.json");

function loadStore(): Map<string, UsageRecord[]> {
  try {
    if (!fs.existsSync(USAGE_FILE)) return new Map();
    const data = fs.readFileSync(USAGE_FILE, "utf-8");
    const obj = JSON.parse(data) as Record<string, UsageRecord[]>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function saveStore(store: Map<string, UsageRecord[]>) {
  try {
    const dir = path.dirname(USAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj = Object.fromEntries(store);
    fs.writeFileSync(USAGE_FILE, JSON.stringify(obj, null, 0), "utf-8");
  } catch (err) {
    console.warn("[OpenPaw] Failed to persist usage:", err);
  }
}

let store = loadStore();

/** Reload store from disk (in case another route instance wrote to file). */
function reloadStoreIfNeeded() {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      const data = fs.readFileSync(USAGE_FILE, "utf-8");
      const obj = JSON.parse(data) as Record<string, UsageRecord[]>;
      store = new Map(Object.entries(obj));
    }
  } catch {
    // ignore
  }
}

/**
 * Convert AI SDK LanguageModelUsage to format llm-cost-utils expects.
 */
function toCostUtilsFormat(
  modelId: string,
  usage: LanguageModelUsage,
  providerMetadata?: unknown
): { model: string; usage: Record<string, unknown>; providerMetadata?: unknown } {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cacheRead = usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? 0;

  return {
    model: modelId,
    usage: {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: usage.totalTokens ?? inputTokens + outputTokens,
    },
    providerMetadata: providerMetadata ?? {
      anthropic: {
        cacheReadInputTokens: cacheRead,
        cacheCreationInputTokens: usage.inputTokenDetails?.cacheWriteTokens ?? 0,
      },
      openai: {
        cachedPromptTokens: cacheRead,
        reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens ?? 0,
      },
    },
  };
}

/**
 * Record usage from a completed stream/generation. Call from onFinish.
 */
export function recordUsage(
  sessionId: string | undefined,
  modelId: string,
  totalUsage: LanguageModelUsage,
  providerMetadata?: unknown
): void {
  if (!sessionId) {
    console.log("[OpenPaw] recordUsage: skipped (no sessionId)");
    return;
  }

  try {
    const body = toCostUtilsFormat(modelId, totalUsage, providerMetadata);
    let tokenUsage;
    try {
      tokenUsage = extractTokenUsageFromResponseBody(body);
    } catch (extractErr) {
      // Fallback: store raw AI SDK usage when llm-cost-utils extraction fails
      const inputTokens = totalUsage.inputTokens ?? 0;
      const outputTokens = totalUsage.outputTokens ?? 0;
      if (inputTokens === 0 && outputTokens === 0) {
        console.warn("[OpenPaw] recordUsage: extraction failed and no tokens", {
          sessionId,
          err: extractErr instanceof Error ? extractErr.message : String(extractErr),
        });
        return;
      }
      const record: UsageRecord = {
        timestamp: Date.now(),
        model: modelId,
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
        costUsd: 0,
      };
      const list = store.get(sessionId) ?? [];
      list.push(record);
      store.set(sessionId, list);
      saveStore(store);
      console.log("[OpenPaw] recordUsage: recorded (fallback, no cost)", {
        sessionId,
        promptTokens: record.promptTokens,
        completionTokens: record.completionTokens,
      });
      return;
    }
    const modelForPricing = tokenUsage.model ?? modelId;
    // Strip provider prefix for pricing lookup (e.g. anthropic/claude-sonnet-4-5 -> claude-sonnet-4-5)
    const modelKey = modelForPricing.includes("/")
      ? modelForPricing.split("/").pop()!
      : modelForPricing;

    let costUsd = 0;
    let cacheSavingsUsd: number | undefined;
    try {
      const costAnalysis = calculateRequestCost(
        modelKey,
        tokenUsage.promptCacheMissTokens,
        tokenUsage.totalOutputTokens,
        tokenUsage.promptCacheHitTokens,
        tokenUsage.promptCacheWriteTokens
      );
      costUsd = costAnalysis.actualCost.totalCost;
      cacheSavingsUsd =
        costAnalysis.savings.totalSavings > 0
          ? costAnalysis.savings.totalSavings
          : undefined;
    } catch (pricingErr) {
      // Model not in pricing table - record tokens but $0 cost
    }

    const record: UsageRecord = {
      timestamp: Date.now(),
      model: modelForPricing,
      promptTokens: tokenUsage.totalInputTokens,
      completionTokens: tokenUsage.totalOutputTokens,
      totalTokens: tokenUsage.totalInputTokens + tokenUsage.totalOutputTokens,
      costUsd,
      cacheHitTokens: tokenUsage.promptCacheHitTokens || undefined,
      cacheSavingsUsd,
    };

    const list = store.get(sessionId) ?? [];
    list.push(record);
    store.set(sessionId, list);
    saveStore(store);
    console.log("[OpenPaw] recordUsage: recorded", {
      sessionId,
      promptTokens: record.promptTokens,
      completionTokens: record.completionTokens,
      costUsd: record.costUsd,
    });
  } catch (err) {
    console.warn("[OpenPaw] Failed to record usage:", err);
  }
}

/**
 * Get all usage records for a session.
 */
export function getSessionUsage(sessionId: string): UsageRecord[] {
  reloadStoreIfNeeded();
  return store.get(sessionId) ?? [];
}

/**
 * Get aggregated usage summary for a session.
 */
export function getSessionUsageSummary(sessionId: string): {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: number;
  requestCount: number;
} {
  const records = getSessionUsage(sessionId);
  return {
    totalPromptTokens: records.reduce((s, r) => s + r.promptTokens, 0),
    totalCompletionTokens: records.reduce((s, r) => s + r.completionTokens, 0),
    totalCostUsd: records.reduce((s, r) => s + r.costUsd, 0),
    requestCount: records.length,
  };
}

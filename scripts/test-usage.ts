/**
 * Test script to inspect AI SDK response usage format.
 * Run: npx tsx scripts/test-usage.ts
 * Or:  node --env-file=.env --import tsx scripts/test-usage.ts
 *
 * Requires ANTHROPIC_API_KEY or OPENAI_API_KEY in .env
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Load .env manually (no dotenv dep)
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const idx = line.indexOf("=");
    if (idx > 0 && !line.startsWith("#")) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}
import { generateText, streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
  extractTokenUsageFromResponseBody,
  calculateRequestCost,
} from "llm-cost-utils";
import { recordUsage, getSessionUsageSummary } from "@/lib/usage/session-usage-store";
import { handleChatStreaming } from "@/lib/chat/handler";
import { DEFAULT_MODEL_ID } from "@/lib/models/providers";

async function testGenerateText() {
  console.log("\n=== generateText (blocking) ===\n");

  const provider = process.env.OPENAI_API_KEY
    ? "openai"
    : process.env.GOOGLE_GENERATIVE_AI_API_KEY
      ? "google"
      : "anthropic";

  const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
  const model =
    provider === "openai"
      ? createOpenAI()("gpt-4o-mini")
      : provider === "google"
        ? createGoogleGenerativeAI()("gemini-2.5-flash")
        : createAnthropic()("claude-sonnet-4-20250514");

  const result = await generateText({
    model,
    prompt: "Say 'hello' in one word.",
  });

  console.log("Result text:", result.text);
  console.log("\n--- result.usage (raw) ---");
  console.log(JSON.stringify(result.usage, null, 2));
  console.log("\n--- result.usage keys ---", Object.keys(result.usage));

  // Try llm-cost-utils extraction
  const modelName =
    provider === "openai"
      ? "gpt-4o-mini"
      : provider === "google"
        ? "gemini-2.5-flash"
        : "claude-sonnet-4-20250514";
  const body = {
    model: modelName,
    usage: {
      promptTokens: result.usage.inputTokens ?? 0,
      completionTokens: result.usage.outputTokens ?? 0,
      totalTokens: result.usage.totalTokens,
    },
    providerMetadata: result.providerMetadata,
  };
  console.log("\n--- Body we'd pass to extractTokenUsageFromResponseBody ---");
  console.log(JSON.stringify(body, null, 2));

  try {
    const tokenUsage = extractTokenUsageFromResponseBody(body);
    console.log("\n--- extractTokenUsageFromResponseBody result ---");
    console.log(JSON.stringify(tokenUsage, null, 2));

    const cost = calculateRequestCost(
      tokenUsage.model ?? "gpt-4o-mini",
      tokenUsage.promptCacheMissTokens,
      tokenUsage.totalOutputTokens,
      tokenUsage.promptCacheHitTokens,
      tokenUsage.promptCacheWriteTokens
    );
    console.log("\n--- calculateRequestCost result ---");
    console.log("totalCost:", cost.actualCost.totalCost);
  } catch (err) {
    console.error("\n--- extractTokenUsageFromResponseBody ERROR ---", err);
  }
}

async function testStreamText() {
  console.log("\n\n=== streamText (with onFinish) ===\n");

  const provider = process.env.OPENAI_API_KEY
    ? "openai"
    : process.env.GOOGLE_GENERATIVE_AI_API_KEY
      ? "google"
      : "anthropic";

  const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
  const model =
    provider === "openai"
      ? createOpenAI()("gpt-4o-mini")
      : provider === "google"
        ? createGoogleGenerativeAI()("gemini-2.5-flash")
        : createAnthropic()("claude-sonnet-4-20250514");

  let onFinishCalled = false;
  let onFinishData: unknown = null;

  const result = streamText({
    model,
    prompt: "Say 'world' in one word.",
    onFinish(event) {
      onFinishCalled = true;
      onFinishData = {
        totalUsage: event.totalUsage,
        providerMetadata: event.providerMetadata,
        usage: event.usage,
        steps: event.steps?.length,
      };
      console.log("--- onFinish event (totalUsage) ---");
      console.log(JSON.stringify(event.totalUsage, null, 2));
      console.log("\n--- onFinish event (providerMetadata) ---");
      console.log(JSON.stringify(event.providerMetadata, null, 2));
    },
  });

  // Consume the stream so onFinish fires
  let fullText = "";
  for await (const chunk of result.textStream) {
    fullText += chunk;
  }
  console.log("Streamed text:", fullText);

  // Also wait for totalUsage promise
  const totalUsage = await result.totalUsage;
  console.log("\n--- result.totalUsage (Promise) ---");
  console.log(JSON.stringify(totalUsage, null, 2));

  console.log("\n--- onFinish was called? ---", onFinishCalled);
  if (onFinishData) {
    console.log("--- onFinish data ---");
    console.log(JSON.stringify(onFinishData, null, 2));
  }
}

/**
 * Integration test: streamText + recordUsage + getSessionUsageSummary.
 * Asserts that usage is recorded when the stream is consumed.
 */
async function testRecordUsageIntegration() {
  console.log("\n\n=== recordUsage integration (streamText + session store) ===\n");

  const provider = process.env.OPENAI_API_KEY
    ? "openai"
    : process.env.GOOGLE_GENERATIVE_AI_API_KEY
      ? "google"
      : "anthropic";

  const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
  const model =
    provider === "openai"
      ? createOpenAI()("gpt-4o-mini")
      : provider === "google"
        ? createGoogleGenerativeAI()("gemini-2.5-flash")
        : createAnthropic()("claude-sonnet-4-20250514");

  const modelId =
    provider === "openai"
      ? "openai/gpt-4o-mini"
      : provider === "google"
        ? "google/gemini-2.5-flash"
        : "anthropic/claude-sonnet-4-20250514";

  const sessionId = `test-usage-${Date.now()}`;

  const result = streamText({
    model,
    prompt: "Reply with exactly: ok",
    onFinish({ totalUsage, providerMetadata }) {
      recordUsage(sessionId, modelId, totalUsage, providerMetadata);
    },
  });

  // Consume the stream so onFinish fires
  for await (const _chunk of result.textStream) {
    // consume
  }

  const summary = getSessionUsageSummary(sessionId);
  console.log("Session usage summary:", JSON.stringify(summary, null, 2));

  const ok =
    summary.totalPromptTokens > 0 &&
    summary.totalCompletionTokens > 0 &&
    summary.requestCount === 1;

  if (!ok) {
    throw new Error(
      `Usage not recorded: expected promptTokens>0, completionTokens>0, requestCount=1; got ${JSON.stringify(summary)}`
    );
  }
  console.log("PASS: usage recorded correctly");
}

/**
 * Tests the actual handleChatStreaming path (same as API route).
 * Uses sessionId so recordUsage is called.
 */
async function testHandleChatStreamingUsage() {
  console.log("\n\n=== handleChatStreaming + usage (API path) ===\n");

  const modelId =
    process.env.OPENAI_API_KEY
      ? "openai/gpt-4o-mini"
      : process.env.GOOGLE_GENERATIVE_AI_API_KEY
        ? "google/gemini-2.5-flash"
        : DEFAULT_MODEL_ID;

  const sessionId = `test-handler-${Date.now()}`;
  const messages = [
    {
      id: "1",
      role: "user" as const,
      parts: [{ type: "text" as const, text: "Say hello in one word." }],
    },
  ];

  const result = await handleChatStreaming(
    messages,
    modelId,
    undefined,
    sessionId
  );

  // Consume the stream so onFinish fires (same as client consuming the response)
  for await (const _chunk of result.textStream) {
    // consume
  }

  const summary = getSessionUsageSummary(sessionId);
  console.log("Session usage summary:", JSON.stringify(summary, null, 2));

  const ok =
    summary.totalPromptTokens > 0 &&
    summary.totalCompletionTokens > 0 &&
    summary.requestCount === 1;

  if (!ok) {
    throw new Error(
      `Usage not recorded from handleChatStreaming: expected promptTokens>0, completionTokens>0, requestCount=1; got ${JSON.stringify(summary)}`
    );
  }
  console.log("PASS: handleChatStreaming records usage correctly");
}

/**
 * Simulates the API route: handleChatStreaming -> toUIMessageStreamResponse.
 * Consumes the response stream to verify onFinish fires (same as client consuming).
 */
async function testToUIMessageStreamResponseUsage() {
  console.log("\n\n=== toUIMessageStreamResponse + usage (API route simulation) ===\n");

  const modelId =
    process.env.OPENAI_API_KEY
      ? "openai/gpt-4o-mini"
      : process.env.GOOGLE_GENERATIVE_AI_API_KEY
        ? "google/gemini-2.5-flash"
        : DEFAULT_MODEL_ID;

  const sessionId = `test-stream-response-${Date.now()}`;
  const messages = [
    {
      id: "1",
      role: "user" as const,
      parts: [{ type: "text" as const, text: "Reply with: ok" }],
    },
  ];

  const result = await handleChatStreaming(
    messages,
    modelId,
    undefined,
    sessionId
  );

  const response = result.toUIMessageStreamResponse();
  if (!response.body) throw new Error("No response body");
  const reader = response.body.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }

  const summary = getSessionUsageSummary(sessionId);
  console.log("Session usage summary:", JSON.stringify(summary, null, 2));

  const ok =
    summary.totalPromptTokens > 0 &&
    summary.totalCompletionTokens > 0 &&
    summary.requestCount === 1;

  if (!ok) {
    throw new Error(
      `Usage not recorded after consuming toUIMessageStreamResponse: got ${JSON.stringify(summary)}`
    );
  }
  console.log("PASS: toUIMessageStreamResponse path records usage correctly");
}

async function main() {
  if (
    !process.env.ANTHROPIC_API_KEY &&
    !process.env.OPENAI_API_KEY &&
    !process.env.GOOGLE_GENERATIVE_AI_API_KEY
  ) {
    console.error(
      "\nSet ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY in .env\n"
    );
    process.exit(1);
  }

  const provider = process.env.OPENAI_API_KEY
    ? "OpenAI"
    : process.env.GOOGLE_GENERATIVE_AI_API_KEY
      ? "Google"
      : "Anthropic";
  console.log("Testing with:", provider);

  await testGenerateText();
  await testStreamText();
  await testRecordUsageIntegration();
  await testHandleChatStreamingUsage();
  await testToUIMessageStreamResponseUsage();

  console.log("\n\nDone.\n");
}

main().catch(console.error);

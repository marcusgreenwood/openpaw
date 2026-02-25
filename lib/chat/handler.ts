/**
 * Shared chat handler used by both the streaming frontend route
 * and the blocking webhook channels.
 *
 * - `handleChatStreaming`  → returns a streamText result (for the React UI)
 * - `handleChatBlocking`   → returns the final assistant text (for webhooks)
 */

import {
  streamText,
  generateText,
  type UIMessage,
  type ModelMessage,
  convertToModelMessages,
  stepCountIs,
  hasToolCall,
} from "ai";
import { resolveModel, PROVIDER_REGISTRY } from "@/lib/models/providers";
import {
  ensureApiKeysLoaded,
  getApiKey,
} from "@/lib/chat/api-keys-store";
import { allTools } from "@/lib/tools";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { getSkills } from "@/lib/skills/manager";
import * as path from "node:path";
import {
  CHAT_BLOCKING_TIMEOUT_MS,
  MAX_TOOL_STEPS,
  DEFAULT_WORKSPACE,
} from "./config";
import { mkdir } from "node:fs/promises";
import { recordUsage } from "@/lib/usage/session-usage-store";

/* ------------------------------------------------------------------ */
/*  Shared setup                                                      */
/* ------------------------------------------------------------------ */

export async function buildContext(modelId: string, workspacePath?: string) {
  const projectRoot = process.cwd();
  const raw = (workspacePath || "").trim() || DEFAULT_WORKSPACE;
  let workspace = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(projectRoot, raw);
  // Never use project root as workspace — avoid writing into Next.js public/
  if (path.resolve(workspace) === path.resolve(projectRoot)) {
    workspace = path.join(projectRoot, "workspace");
  }
  // Ensure workspace directory exists
  await mkdir(workspace, { recursive: true }).catch(() => {});

  await ensureApiKeysLoaded();
  const apiKeys: Record<string, string> = {};
  for (const p of Object.keys(PROVIDER_REGISTRY)) {
    const k = getApiKey(p);
    if (k) apiKeys[p] = k;
  }
  const model = resolveModel(modelId, apiKeys);
  const skills = await getSkills(workspace);
  const systemPrompt = await buildSystemPrompt(skills, workspace);
  const tools = allTools(workspace);
  return { model, systemPrompt, tools, workspace };
}

/* ------------------------------------------------------------------ */
/*  Streaming handler (React frontend)                                */
/* ------------------------------------------------------------------ */

export async function handleChatStreaming(
  messages: UIMessage[],
  modelId = "anthropic/claude-sonnet-4-5",
  workspacePath?: string,
  sessionId?: string,
  maxToolSteps?: number
) {
  const { model, systemPrompt, tools } = await buildContext(
    modelId,
    workspacePath
  );

  const modelMessages = await convertToModelMessages(messages);
  const steps = maxToolSteps ?? MAX_TOOL_STEPS;

  return streamText({
    model,
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: [stepCountIs(steps), hasToolCall("askChoice")],
    onStepFinish({ toolCalls, finishReason }) {
      console.log(
        `[OpenPaw] reason=${finishReason} tools=${toolCalls.length}`
      );
    },
    onFinish({ totalUsage, providerMetadata }) {
      console.log("[OpenPaw] onFinish", {
        sessionId: sessionId ?? "(missing)",
        inputTokens: totalUsage.inputTokens,
        outputTokens: totalUsage.outputTokens,
      });
      recordUsage(sessionId, modelId, totalUsage, providerMetadata);
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Blocking handler (webhooks: Telegram, Slack, WhatsApp)            */
/* ------------------------------------------------------------------ */

export interface BlockingChatResult {
  text: string;
  toolCalls: number;
  finishReason: string;
  durationMs: number;
}

export async function handleChatBlocking(
  messages: ModelMessage[],
  modelId = "anthropic/claude-sonnet-4-5",
  workspacePath?: string
): Promise<BlockingChatResult> {
  const { model, systemPrompt, tools } = await buildContext(
    modelId,
    workspacePath
  );

  const start = Date.now();

  // Race between generateText and a hard timeout
  const result = await Promise.race([
    generateText({
      model,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: [stepCountIs(MAX_TOOL_STEPS), hasToolCall("askChoice")],
      onStepFinish({ toolCalls, finishReason }) {
        console.log(
          `[OpenPaw:blocking] reason=${finishReason} tools=${toolCalls.length}`
        );
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Chat timed out after ${CHAT_BLOCKING_TIMEOUT_MS}ms`)),
        CHAT_BLOCKING_TIMEOUT_MS
      )
    ),
  ]);

  return {
    text: result.text || "(no response)",
    toolCalls: result.steps.reduce(
      (n, step) => n + (step.toolCalls?.length ?? 0),
      0
    ),
    finishReason: result.finishReason,
    durationMs: Date.now() - start,
  };
}

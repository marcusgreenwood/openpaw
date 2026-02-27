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
import { searchWorkspaceContext } from "@/lib/context/search";
import * as path from "node:path";
import {
  CHAT_BLOCKING_TIMEOUT_MS,
  MAX_TOOL_STEPS,
  DEFAULT_WORKSPACE,
} from "./config";
import { mkdir } from "node:fs/promises";
import { recordUsage } from "@/lib/usage/session-usage-store";
import { isMemoryEnabled, recallMemories, recordChatEvent } from "@/lib/memory";

/* ------------------------------------------------------------------ */
/*  Shared setup                                                      */
/* ------------------------------------------------------------------ */

export async function buildContext(
  modelId: string,
  workspacePath?: string,
  sessionId?: string,
  lastUserMessage?: string,
) {
  const projectRoot = process.cwd();
  const raw = (workspacePath || "").trim() || DEFAULT_WORKSPACE;
  let workspace = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(projectRoot, raw);
  if (path.resolve(workspace) === path.resolve(projectRoot)) {
    workspace = path.join(projectRoot, "workspace");
  }
  await mkdir(workspace, { recursive: true }).catch(() => {});

  await ensureApiKeysLoaded();
  const apiKeys: Record<string, string> = {};
  for (const p of Object.keys(PROVIDER_REGISTRY)) {
    const k = getApiKey(p);
    if (k) apiKeys[p] = k;
  }
  const model = resolveModel(modelId, apiKeys);
  const skills = await getSkills(workspace);
  let systemPrompt = await buildSystemPrompt(skills, workspace);
  const tools = allTools(workspace, sessionId);

  if (lastUserMessage && await isMemoryEnabled()) {
    try {
      const recall = await recallMemories(lastUserMessage);
      const sections: string[] = [];

      if (recall.claims.length > 0) {
        sections.push("### Known Facts");
        for (const c of recall.claims.slice(0, 5)) {
          const text = (c as { claim_text?: string }).claim_text ?? JSON.stringify(c);
          sections.push(`- ${text}`);
        }
      }
      if (recall.memories.length > 0) {
        sections.push("### Past Experiences");
        for (const m of recall.memories.slice(0, 3)) {
          const summary = (m as { summary?: string }).summary ?? JSON.stringify(m);
          sections.push(`- ${summary}`);
        }
      }
      if (recall.strategies.length > 0) {
        sections.push("### Learned Strategies");
        for (const s of recall.strategies.slice(0, 2)) {
          const summary = (s as { summary?: string }).summary ?? JSON.stringify(s);
          sections.push(`- ${summary}`);
        }
      }

      if (sections.length > 0) {
        systemPrompt += `\n\n---\n\n## Memory Context\n\nThe following relevant information was recalled from long-term memory. Use it to provide more personalized and context-aware responses.\n\n${sections.join("\n")}`;
      }
    } catch {
      // Memory recall failed — continue without memory context
    }
  }

  // Auto-inject workspace context for code-related queries
  if (lastUserMessage && looksCodeRelated(lastUserMessage)) {
    try {
      const contextResults = await searchWorkspaceContext(
        lastUserMessage,
        workspace,
        3,
        200
      );
      if (contextResults.length > 0) {
        const snippets = contextResults.map((r) => {
          const lines =
            r.relevantLines.length > 0
              ? "\n```\n" + r.relevantLines.join("\n") + "\n```"
              : "";
          return `- **${r.relativePath}** (relevance: ${r.score})${lines}`;
        });
        systemPrompt += `\n\n---\n\n## Workspace Context\n\nRelevant files found in the workspace:\n\n${snippets.join("\n\n")}`;
      }
    } catch {
      // Context search failed — continue without it
    }
  }

  return { model, systemPrompt, tools, workspace };
}

const CODE_KEYWORDS = [
  "function",
  "class",
  "import",
  "export",
  "const",
  "let",
  "var",
  "return",
  "async",
  "await",
  "component",
  "hook",
  "api",
  "route",
  "handler",
  "module",
  "package",
  "file",
  "code",
  "bug",
  "error",
  "fix",
  "refactor",
  "test",
  "type",
  "interface",
  "config",
  "setup",
  "build",
  "deploy",
  "database",
  "schema",
  "migration",
  "implement",
  "create",
  "update",
  "delete",
  "add",
  "remove",
  "change",
  "modify",
  "debug",
  "lint",
  "compile",
  "typescript",
  "javascript",
  "python",
  "react",
  "next",
  "node",
  "npm",
  "src",
  "lib",
  "utils",
  "helper",
  "service",
  "controller",
  "middleware",
  "endpoint",
  "server",
  "client",
];

function looksCodeRelated(message: string): boolean {
  const lower = message.toLowerCase();
  return CODE_KEYWORDS.some((kw) => lower.includes(kw));
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
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const lastUserText = lastUserMsg?.parts
    ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ") ?? "";

  const { model, systemPrompt, tools } = await buildContext(
    modelId,
    workspacePath,
    sessionId,
    lastUserText,
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
    onFinish({ text, totalUsage, providerMetadata, steps: finishedSteps }) {
      console.log("[OpenPaw] onFinish", {
        sessionId: sessionId ?? "(missing)",
        inputTokens: totalUsage.inputTokens,
        outputTokens: totalUsage.outputTokens,
      });
      recordUsage(sessionId, modelId, totalUsage, providerMetadata);

      if (sessionId && lastUserText && text) {
        const toolNames = finishedSteps
          ?.flatMap((s) => s.toolCalls?.map((tc) => tc.toolName) ?? [])
          .filter(Boolean) ?? [];
        recordChatEvent(sessionId, "openpaw", lastUserText, text, toolNames).catch(() => {});
      }
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

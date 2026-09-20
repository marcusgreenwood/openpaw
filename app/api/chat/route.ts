/**
 * Main chat endpoint.
 * POST /api/chat — streams an agentic model response as a UI message stream.
 *
 * Accepts `{ messages, modelId, workspacePath, sessionId, maxToolSteps }` and
 * delegates to `handleChatStreaming`, which assembles the system prompt, skills,
 * tools, and (when configured) memory/workspace context before streaming.
 */

import { type UIMessage } from "ai";
import { handleChatStreaming } from "@/lib/chat/handler";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json();
  const {
    messages,
    modelId = "anthropic/claude-sonnet-4-5",
    workspacePath,
    sessionId,
    maxToolSteps,
  } = body as {
    messages?: UIMessage[];
    modelId?: string;
    workspacePath?: string;
    sessionId?: string;
    maxToolSteps?: number;
  };

  console.log("[OpenPaw] POST /api/chat", {
    bodyKeys: Object.keys(body),
    sessionId: sessionId ?? "(missing)",
    messageCount: Array.isArray(messages) ? messages.length : 0,
  });

  const messagesArray = Array.isArray(messages) ? messages : [];

  const result = await handleChatStreaming(
    messagesArray,
    modelId,
    workspacePath,
    sessionId,
    maxToolSteps
  );
  return result.toUIMessageStreamResponse();
}

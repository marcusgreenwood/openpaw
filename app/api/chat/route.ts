/**
 * Primary streaming chat endpoint used by the browser UI.
 * POST /api/chat — accepts { messages, modelId, workspacePath, sessionId, maxToolSteps }
 * and returns an AI SDK UI message stream. All model, skill, tool and memory wiring
 * lives in lib/chat/handler.ts; this route only parses the body and streams the result.
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

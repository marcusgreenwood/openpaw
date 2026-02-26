import { type UIMessage } from "ai";
import { handleChatStreaming } from "@/lib/chat/handler";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/chat
 *
 * Streams an AI chat response using the Vercel AI SDK.
 * Delegates to `handleChatStreaming` which manages the tool-call loop,
 * system prompt assembly, and per-session usage recording.
 *
 * @param req - JSON body:
 *   - `messages` — conversation history as UIMessage[]
 *   - `modelId` — provider-qualified model ID (default: "anthropic/claude-sonnet-4-5")
 *   - `workspacePath` — absolute path to the agent's working directory
 *   - `sessionId` — client-generated session ID for usage tracking
 *   - `maxToolSteps` — cap on consecutive tool-call steps before pausing
 * @returns UI message stream response (text/event-stream)
 */
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

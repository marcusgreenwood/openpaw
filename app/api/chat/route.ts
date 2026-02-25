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
  } = body as {
    messages?: UIMessage[];
    modelId?: string;
    workspacePath?: string;
    sessionId?: string;
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
    sessionId
  );
  return result.toUIMessageStreamResponse();
}

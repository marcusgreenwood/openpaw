"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { MessageList } from "./MessageList";
import { InputBar } from "./InputBar";
import { useSessionsStore } from "@/lib/store/sessions";
import { consumePendingMessage } from "@/lib/store/pending-message";
import {
  loadMessages,
  saveMessages,
} from "@/lib/chat/client-messages";

export { clearSessionMessages } from "@/lib/chat/client-messages";

/** Extract text from message parts for title generation */
function getMessageText(message: UIMessage): string {
  if (!message.parts) return "";
  const texts: string[] = [];
  for (const part of message.parts) {
    if (part.type === "text" && "text" in part && typeof part.text === "string") {
      texts.push(part.text);
    }
  }
  return texts.join(" ").trim();
}

/** Generate chat title from first 5 messages (prefer first user message) */
function deriveTitleFromMessages(messages: UIMessage[]): string | null {
  const firstFive = messages.slice(0, 5);
  const firstUser = firstFive.find((m) => m.role === "user");
  const fallback = firstFive[0];
  const primary = firstUser ? getMessageText(firstUser) : (fallback ? getMessageText(fallback) : "");
  if (!primary) return null;
  return primary
    .replace(/\n/g, " ")
    .trim()
    .slice(0, 50)
    .replace(/\s+\S*$/, "") || null;
}

/* ── Component ──────────────────────────────────────────────── */

export function ChatInterface() {
  const { modelId, workspacePath, activeSessionId, createSession, updateSessionTitle } =
    useSessionsStore();
  const [input, setInput] = useState("");

  // Load persisted messages for current session
  const initialMessages = useMemo(
    () => (activeSessionId ? loadMessages(activeSessionId) : []),
    [activeSessionId]
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => {
          const state = useSessionsStore.getState();
          return {
            modelId: state.modelId,
            workspacePath: state.workspacePath,
            sessionId: state.activeSessionId ?? undefined,
          };
        },
      }),
    []
  );

  const { messages, sendMessage, status, stop, error } = useChat({
    id: activeSessionId ?? undefined,
    transport,
    messages: initialMessages,
  });

  // Send pending message from command palette (cmd+k) or cron run now
  useEffect(() => {
    if (!activeSessionId) return;
    const pending = consumePendingMessage();
    if (pending) {
      const title =
        pending.title ??
        pending.text
          .replace(/\n/g, " ")
          .trim()
          .slice(0, 50)
          .replace(/\s+\S*$/, "");
      updateSessionTitle(activeSessionId, title || "New Chat");
      sendMessage({ text: pending.text });
    }
  }, [activeSessionId, sendMessage, updateSessionTitle]);

  // Persist messages when:
  //  1. message count changes (new user/assistant message)
  //  2. status transitions to "ready" (tool results finished, stream complete)
  const prevLenRef = useRef(0);
  const prevStatusRef = useRef(status);

  useEffect(() => {
    if (!activeSessionId || messages.length === 0) return;

    const lengthChanged = messages.length !== prevLenRef.current;
    const justFinished =
      status === "ready" && prevStatusRef.current !== "ready";

    prevLenRef.current = messages.length;
    prevStatusRef.current = status;

    if (lengthChanged || justFinished) {
      saveMessages(activeSessionId, messages);
      if (justFinished) {
        // Re-generate title from first 5 messages when chat completes
        if (messages.length >= 1 && messages.length <= 5) {
          const derived = deriveTitleFromMessages(messages);
          if (derived && derived.length > 2) {
            updateSessionTitle(activeSessionId, derived);
          }
        }
        window.dispatchEvent(
          new CustomEvent("openpaw-chat-complete", {
            detail: { sessionId: activeSessionId },
          })
        );
      }
    }
  }, [activeSessionId, messages, status, updateSessionTitle]);

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    const text = input;
    setInput("");

    // Ensure we have a session before sending (for usage tracking)
    let sid = activeSessionId;
    if (!sid) {
      sid = createSession();
    }

    // Auto-name the chat from the first user message
    if (sid && messages.length === 0) {
      const title = text
        .replace(/\n/g, " ")
        .trim()
        .slice(0, 50)
        .replace(/\s+\S*$/, ""); // trim to last full word
      updateSessionTitle(sid, title || "New Chat");
    }

    sendMessage({ text });
  }, [input, activeSessionId, createSession, messages.length, sendMessage, updateSessionTitle]);

  return (
    <div className="flex flex-col h-full">
      <MessageList
        messages={messages}
        status={status}
        error={error}
        onSuggestion={(text) => sendMessage({ text })}
        onChoiceSelect={(option) => sendMessage({ text: option })}
      />
      <InputBar
        input={input}
        onChange={setInput}
        onSend={handleSend}
        onStop={stop}
        isStreaming={status === "streaming"}
        disabled={status === "submitted"}
      />
    </div>
  );
}

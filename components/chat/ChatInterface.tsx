"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { MessageList } from "./MessageList";
import { InputBar } from "./InputBar";
import { useSessionsStore } from "@/lib/store/sessions";

/* ── localStorage helpers for message persistence ───────────── */

const STORAGE_PREFIX = "openpaw-messages-";

function loadMessages(sessionId: string): UIMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + sessionId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMessages(sessionId: string, messages: UIMessage[]) {
  try {
    localStorage.setItem(STORAGE_PREFIX + sessionId, JSON.stringify(messages));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function clearSessionMessages(sessionId: string) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + sessionId);
  } catch {
    // ignore
  }
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
        window.dispatchEvent(
          new CustomEvent("openpaw-chat-complete", {
            detail: { sessionId: activeSessionId },
          })
        );
      }
    }
  }, [activeSessionId, messages, status]);

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

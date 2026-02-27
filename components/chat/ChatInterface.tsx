"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { MessageList } from "./MessageList";
import { InputBar } from "./InputBar";
import { FileDropZone } from "./FileDropZone";
import { CompareMode } from "./CompareMode";
import { ModelPickerDialog } from "./ModelPickerDialog";
import { useSessionsStore } from "@/lib/store/sessions";
import { useCompareStore, type CompareResult } from "@/lib/store/compare";
import { consumePendingMessage } from "@/lib/store/pending-message";
import { useFileAttachments } from "@/lib/hooks/useFileAttachments";
import {
  loadMessages,
  saveMessages,
  getMessagesForBranch,
  saveMessagesForBranch,
  forkMessagesIntoBranch,
} from "@/lib/chat/client-messages";
import { useBranchStore } from "@/lib/store/branches";
import { BranchSelector } from "./BranchSelector";

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
  const {
    modelId,
    workspacePath,
    maxToolSteps,
    activeSessionId,
    createSession,
    updateSessionTitle,
  } = useSessionsStore();
  const [input, setInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const compareActive = useCompareStore((s) => s.active);
  const compareActivate = useCompareStore((s) => s.activate);
  const compareSetResults = useCompareStore((s) => s.setResults);
  const compareDeactivate = useCompareStore((s) => s.deactivate);

  const activeBranchId = useBranchStore(
    (s) => (activeSessionId ? s.activeBranch[activeSessionId] ?? null : null)
  );
  const hasBranches = useBranchStore(
    (s) => (activeSessionId ? (s.branches[activeSessionId]?.length ?? 0) > 0 : false)
  );
  const createBranch = useBranchStore((s) => s.createBranch);

  const comparePromptRef = useRef("");

  // Listen for compare trigger from command palette
  useEffect(() => {
    const handler = () => setPickerOpen(true);
    window.addEventListener("openpaw-open-compare", handler);
    return () => window.removeEventListener("openpaw-open-compare", handler);
  }, []);

  const {
    files: attachedFiles,
    errors: fileErrors,
    clearErrors: clearFileErrors,
    addFiles,
    removeFile,
    clearFiles,
    formatForMessage,
  } = useFileAttachments();

  // Show errors as brief toasts then auto-clear
  useEffect(() => {
    if (fileErrors.length === 0) return;
    const msgs = fileErrors.map((e) => `${e.name}: ${e.reason}`).join("\n");
    console.warn("[FileAttachment]", msgs);
    // Auto-clear errors after 4s
    const timer = setTimeout(clearFileErrors, 4000);
    return () => clearTimeout(timer);
  }, [fileErrors, clearFileErrors]);

  // Load persisted messages for current session (branch-aware)
  const initialMessages = useMemo(
    () => {
      if (!activeSessionId) return [];
      return activeBranchId
        ? getMessagesForBranch(activeSessionId, activeBranchId)
        : loadMessages(activeSessionId);
    },
    [activeSessionId, activeBranchId]
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
            maxToolSteps: state.maxToolSteps ?? 15,
          };
        },
      }),
    []
  );

  const { messages, sendMessage, setMessages, status, stop, error } = useChat({
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
      if (activeBranchId) {
        saveMessagesForBranch(activeSessionId, activeBranchId, messages);
      } else {
        saveMessages(activeSessionId, messages);
      }
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
  }, [activeSessionId, activeBranchId, messages, status, updateSessionTitle]);

  const handleSend = useCallback(() => {
    const fileContext = formatForMessage();
    const trimmedInput = input.trim();

    if (!trimmedInput && !fileContext) return;

    const text = fileContext
      ? `${fileContext}\n\n${trimmedInput}`
      : trimmedInput;

    setInput("");
    clearFiles();

    // Ensure we have a session before sending (for usage tracking)
    let sid = activeSessionId;
    if (!sid) {
      sid = createSession();
    }

    // Auto-name the chat from the first user message (use user's typed text for title)
    if (sid && messages.length === 0) {
      const titleSource = trimmedInput || text;
      const title = titleSource
        .replace(/\n/g, " ")
        .trim()
        .slice(0, 50)
        .replace(/\s+\S*$/, "");
      updateSessionTitle(sid, title || "New Chat");
    }

    sendMessage({ text });
  }, [input, activeSessionId, createSession, messages.length, sendMessage, updateSessionTitle, formatForMessage, clearFiles]);

  const handleFork = useCallback(
    (messageId: string) => {
      if (!activeSessionId) return;
      const branchId = createBranch(activeSessionId, messageId);
      forkMessagesIntoBranch(
        activeSessionId,
        branchId,
        messageId,
        activeBranchId
      );
    },
    [activeSessionId, activeBranchId, createBranch]
  );

  const handleFileDrop = useCallback(
    (fileList: FileList) => {
      addFiles(fileList);
    },
    [addFiles]
  );

  const handleCompareStart = useCallback(
    async (modelIds: string[]) => {
      setPickerOpen(false);

      const text = input.trim();
      if (!text) return;

      comparePromptRef.current = text;
      setInput("");

      let sid = activeSessionId;
      if (!sid) {
        sid = createSession();
      }
      if (sid && messages.length === 0) {
        const title = text
          .replace(/\n/g, " ")
          .trim()
          .slice(0, 50)
          .replace(/\s+\S*$/, "");
        updateSessionTitle(sid, title || "New Chat");
      }

      compareActivate(modelIds);

      const userMsg: UIMessage = {
        id: Date.now().toString(36),
        role: "user" as const,
        parts: [{ type: "text" as const, text }],
      };

      try {
        const res = await fetch("/api/chat/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...messages, userMsg],
            modelIds,
            workspacePath,
            sessionId: sid,
          }),
        });
        const data = await res.json();
        const results: CompareResult[] = (data as Array<{
          modelId: string;
          text: string;
          usage: { inputTokens: number; outputTokens: number };
          durationMs: number;
          error?: string;
        }>).map((r) => ({
          modelId: r.modelId,
          text: r.text,
          inputTokens: r.usage?.inputTokens ?? 0,
          outputTokens: r.usage?.outputTokens ?? 0,
          durationMs: r.durationMs,
          error: r.error,
        }));
        compareSetResults(results);
      } catch (err) {
        compareSetResults([
          {
            modelId: "error",
            text: "",
            inputTokens: 0,
            outputTokens: 0,
            durationMs: 0,
            error: err instanceof Error ? err.message : "Compare request failed",
          },
        ]);
      }
    },
    [input, messages, activeSessionId, createSession, updateSessionTitle, workspacePath, compareActivate, compareSetResults]
  );

  const handlePickWinner = useCallback(
    (result: CompareResult) => {
      const promptText = comparePromptRef.current;
      compareDeactivate();

      if (promptText) {
        const ts = Date.now().toString(36);
        const userMsg: UIMessage = {
          id: `cmp-u-${ts}`,
          role: "user" as const,
          parts: [{ type: "text" as const, text: promptText }],
        };
        const assistantMsg: UIMessage = {
          id: `cmp-a-${ts}`,
          role: "assistant" as const,
          parts: [{ type: "text" as const, text: result.text }],
        };
        setMessages((prev) => [...prev, userMsg, assistantMsg]);
        comparePromptRef.current = "";
      }
    },
    [compareDeactivate, setMessages]
  );

  return (
    <FileDropZone onDrop={handleFileDrop}>
      {compareActive ? (
        <CompareMode onPickWinner={handlePickWinner} />
      ) : (
        <>
          {activeSessionId && hasBranches && (
            <BranchSelector sessionId={activeSessionId} />
          )}
          <MessageList
            messages={messages}
            status={status}
            error={error}
            onSuggestion={(text) => sendMessage({ text })}
            onChoiceSelect={(option) => sendMessage({ text: option })}
            onContinue={() =>
              sendMessage({ text: "Please continue from where you left off." })
            }
            onFork={handleFork}
          />
        </>
      )}
      {!compareActive && (
        <InputBar
          input={input}
          onChange={setInput}
          onSend={handleSend}
          onStop={stop}
          isStreaming={status === "streaming"}
          disabled={status === "submitted"}
          files={attachedFiles}
          onAddFiles={addFiles}
          onRemoveFile={removeFile}
        />
      )}

      <ModelPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onCompare={handleCompareStart}
      />

      {fileErrors.length > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-error/90 text-white text-sm px-4 py-2 rounded-lg shadow-lg backdrop-blur-sm">
            {fileErrors.map((e, i) => (
              <div key={i}>
                {e.name}: {e.reason}
              </div>
            ))}
          </div>
        </div>
      )}
    </FileDropZone>
  );
}

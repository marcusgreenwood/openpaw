"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { UIMessage } from "ai";
import { MessageBubble } from "./MessageBubble";
import { CatFace } from "@/components/cat/CatFace";
import { TemplatesGrid } from "@/components/layout/TemplatesGrid";

interface MessageListProps {
  messages: UIMessage[];
  status: "ready" | "submitted" | "streaming" | "error";
  error?: Error;
  onSuggestion?: (text: string) => void;
  onChoiceSelect?: (option: string) => void;
  onContinue?: () => void;
  onFork?: (messageId: string) => void;
}

/**
 * Threshold in pixels — if the user is within this distance of the bottom
 * we consider them "at the bottom" and will auto-scroll on new content.
 */
const SCROLL_THRESHOLD = 120;

/** Check if the last assistant message likely hit the tool-step limit (ends with tool calls, not askChoice) */
function lastMessageEndsWithToolCalls(messages: UIMessage[]): boolean {
  if (messages.length === 0) return false;
  const last = messages[messages.length - 1];
  if (last.role !== "assistant" || !last.parts?.length) return false;
  const lastPart = last.parts[last.parts.length - 1];
  if (typeof lastPart?.type !== "string" || !lastPart.type.startsWith("tool-"))
    return false;
  const toolName = lastPart.type.slice(5);
  if (toolName === "askChoice") return false;
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function MessageList({ messages, status, error, onSuggestion, onChoiceSelect, onContinue, onFork }: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  /* ── Track whether user is near the bottom ─────────────────── */
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distanceFromBottom <= SCROLL_THRESHOLD);
  }, []);

  /* ── Scroll to bottom helper ───────────────────────────────── */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  /* ── Auto-scroll when messages change or during streaming ──── */
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom("smooth");
    }
  }, [messages, status, isAtBottom, scrollToBottom]);

  /* ── Always snap to bottom on first load or new conversation ─ */
  const prevMessageCountRef = useRef(0);
  useEffect(() => {
    // If messages went from 0 → N, or user just sent a message (count increased by 1+),
    // snap to bottom instantly
    const prev = prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (prev === 0 && messages.length > 0) {
      // New conversation loaded — snap immediately
      requestAnimationFrame(() => scrollToBottom("instant"));
    } else if (messages.length > prev) {
      // New message added (user or assistant) — scroll down
      requestAnimationFrame(() => scrollToBottom("smooth"));
    }
  }, [messages.length, scrollToBottom]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4 px-6">
          <div className="flex items-center justify-center gap-3">
            <CatFace size={52} />
            <h1 className="text-4xl font-bold gradient-text">OpenPaw</h1>
          </div>
          <p className="text-text-secondary text-sm max-w-md mx-auto">
            AI agent with full system access. Execute commands, write
            code, manage files — all from a single chat interface.
          </p>
          <TemplatesGrid />
        </div>
      </div>
    );
  }

  // Only show the dots indicator when waiting for first content
  // (status is submitted but no assistant message started yet)
  const lastMsg = messages[messages.length - 1];
  const showWaiting =
    status === "submitted" &&
    lastMsg?.role === "user";

  const showContinueBanner =
    status === "ready" &&
    onContinue &&
    lastMessageEndsWithToolCalls(messages);

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 md:px-6 py-4"
    >
      <div className="max-w-4xl mx-auto">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} onChoiceSelect={onChoiceSelect} onFork={onFork} />
        ))}

        {/* Waiting indicator — only when we haven't started receiving yet */}
        {showWaiting && (
          <div className="flex justify-start mb-4">
            <div className="glass-bubble-assistant">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse-glow" />
                <div
                  className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse-glow"
                  style={{ animationDelay: "0.3s" }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse-glow"
                  style={{ animationDelay: "0.6s" }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Continue banner — shown when response stopped at tool-step limit */}
        {showContinueBanner && (
          <div className="flex justify-start mb-4">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 max-w-xl">
              <p className="text-sm text-amber-200/90 mb-2">
                The agent reached the maximum number of tool steps. Would you like to continue?
              </p>
              <button
                onClick={onContinue}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-200 hover:bg-amber-500/30 transition-colors cursor-pointer"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="flex justify-start mb-4">
            <div className="rounded-lg bg-error/10 border border-error/20 px-4 py-3 max-w-xl">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-error text-xs font-semibold">Error</span>
              </div>
              <p className="text-sm text-error/80">
                {error.message || "Something went wrong. Please try again."}
              </p>
            </div>
          </div>
        )}

        {/* Scroll anchor — MUST be inside the scrollable container */}
        <div ref={bottomRef} className="h-px" />
      </div>

      {/* Scroll-to-bottom button — shown when user has scrolled up */}
      {!isAtBottom && (
        <button
          onClick={() => {
            setIsAtBottom(true);
            scrollToBottom("smooth");
          }}
          className="sticky bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-2/90 border border-white/10 text-text-secondary text-xs backdrop-blur-sm hover:bg-surface-2 hover:text-text-primary transition-all cursor-pointer shadow-lg"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          Scroll to bottom
        </button>
      )}
    </div>
  );
}

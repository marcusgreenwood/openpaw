"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { UIMessage } from "ai";
import { MessageBubble } from "./MessageBubble";
import { PresenceIndicator } from "./PresenceIndicator";
import { useSessionsStore } from "@/lib/store/sessions";
import { saveMessages } from "@/lib/chat/client-messages";

interface SharedSessionViewProps {
  sessionId: string;
  initialMessages: UIMessage[];
  sharedAt: number;
  viewerCount: number;
}

function generateViewerId() {
  if (typeof window === "undefined") return "anon";
  let id = sessionStorage.getItem("openpaw-viewer-id");
  if (!id) {
    id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem("openpaw-viewer-id", id);
  }
  return id;
}

export function SharedSessionView({
  sessionId,
  initialMessages,
  sharedAt,
  viewerCount: initialViewerCount,
}: SharedSessionViewProps) {
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages);
  const [viewerCount, setViewerCount] = useState(initialViewerCount);
  const [forked, setForked] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const viewerId = useRef(generateViewerId());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/sessions/share?id=${encodeURIComponent(sessionId)}&presence=true&viewerId=${encodeURIComponent(viewerId.current)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.messages)) {
        setMessages(data.messages);
      }
      if (typeof data.viewerCount === "number") {
        setViewerCount(data.viewerCount);
      }
    } catch {
      // silently ignore refresh errors
    }
  }, [sessionId]);

  useEffect(() => {
    const interval = setInterval(refresh, 10_000);
    refresh();
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const createSession = useSessionsStore((s) => s.createSession);

  const handleFork = useCallback(() => {
    const newId = createSession();
    saveMessages(newId, messages);
    setForked(true);
    setToastMsg("Session forked! Switch to Sessions tab to view it.");
    setTimeout(() => setToastMsg(null), 3000);
  }, [messages, createSession]);

  return (
    <div className="flex flex-col h-full">
      {/* Banner */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-accent-cyan/10 border-b border-accent-cyan/20">
        <div className="flex items-center gap-3">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-accent-cyan"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          <span className="text-sm font-medium text-accent-cyan">
            Viewing shared session
          </span>
          <span className="text-xs text-text-muted">
            Shared {new Date(sharedAt).toLocaleDateString()}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <PresenceIndicator viewerCount={viewerCount} />
          <button
            onClick={handleFork}
            disabled={forked}
            className="text-xs px-3 py-1.5 rounded-lg bg-accent-cyan/20 border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/30 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {forked ? "Forked!" : "Fork to my sessions"}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
        <div className="max-w-4xl mx-auto">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          <div ref={bottomRef} className="h-px" />
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-accent-cyan/90 text-white text-sm px-4 py-2 rounded-lg shadow-lg backdrop-blur-sm">
            {toastMsg}
          </div>
        </div>
      )}
    </div>
  );
}

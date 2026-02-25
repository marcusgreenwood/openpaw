"use client";

import { useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

interface InputBarProps {
  input: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

export function InputBar({
  input,
  onChange,
  onSend,
  onStop,
  isStreaming,
  disabled,
}: InputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus the textarea when streaming stops
  useEffect(() => {
    if (!isStreaming && !disabled) {
      textareaRef.current?.focus();
    }
  }, [isStreaming, disabled]);

  // Focus when a new chat is initiated (e.g. "+ New Chat" or Cmd+K → New Chat)
  useEffect(() => {
    const onNewChat = () => {
      setTimeout(() => {
        if (!disabled) textareaRef.current?.focus();
      }, 0);
    };
    window.addEventListener("openpaw-new-chat", onNewChat);
    return () => window.removeEventListener("openpaw-new-chat", onNewChat);
  }, [disabled]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (input.trim() && !disabled) {
          onSend();
          // Reset textarea height after sending
          if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
          }
        }
      }
      if (e.key === "Escape" && isStreaming) {
        onStop();
      }
    },
    [input, disabled, isStreaming, onSend, onStop]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      const target = e.target;
      target.style.height = "auto";
      target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
    },
    [onChange]
  );

  return (
    <div className="sticky bottom-0 bg-gradient-to-t from-bg-base via-bg-base to-transparent pt-6 pb-4 px-4 md:px-6">
      <div className="max-w-4xl mx-auto">
        <div className="glass-card glow-cyan p-3 flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask OpenPaw anything..."
            disabled={disabled}
            rows={1}
            className={cn(
              "flex-1 bg-transparent text-text-primary text-sm resize-none outline-none",
              "placeholder:text-text-muted min-h-[24px] max-h-[200px]",
              "disabled:opacity-50"
            )}
          />

          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-error/20 border border-error/30 text-error hover:bg-error/30 transition-colors cursor-pointer"
              title="Stop generation (Escape)"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="currentColor"
              >
                <rect width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!input.trim() || disabled}
              className={cn(
                "shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer",
                "disabled:opacity-30 disabled:cursor-not-allowed",
                input.trim()
                  ? "bg-accent-cyan/20 border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/30"
                  : "bg-white/5 border border-white/8 text-text-muted"
              )}
              title="Send message (Enter)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 mt-2">
          <span className="text-[11px] text-text-muted">
            Enter to send · Shift+Enter for newline · Esc to stop
          </span>
        </div>
      </div>
    </div>
  );
}

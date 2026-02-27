"use client";

import { useEffect, useState, useRef } from "react";
import { Command } from "cmdk";
import { cn } from "@/lib/utils";
import { useConfiguredProviders } from "@/lib/hooks/use-configured-providers";
import { useSessionsStore } from "@/lib/store/sessions";
import type { SessionTemplate } from "@/lib/store/sessions";
import { setPendingMessage } from "@/lib/store/pending-message";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const {
    sessions,
    cronSessions,
    modelId,
    activeSessionId,
    setModelId,
    setActiveSession,
    createSession,
    setWorkspacePath,
    addTemplate,
  } = useSessionsStore();

  const allSessions = [
    ...cronSessions.map((c) => c.session),
    ...sessions,
  ].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const { configuredModels } = useConfiguredProviders();

  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      // Focus input when palette opens (requestAnimationFrame ensures DOM is ready)
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Palette */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg">
        <div className="bg-bg-elevated border border-white/10 rounded-xl glow-cyan shadow-2xl shadow-black/40 overflow-hidden">
          <Command
            label="Command palette"
            shouldFilter={true}
            className="flex flex-col"
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/6">
              <svg
                className="w-4 h-4 text-text-muted shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <Command.Input
                ref={inputRef}
                value={search}
                onValueChange={setSearch}
                placeholder="Type a command, search chats, or send as new message..."
                className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
              />
              <kbd className="text-[10px] font-mono text-text-muted bg-white/5 px-1.5 py-0.5 rounded border border-white/8">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <Command.List className="max-h-72 overflow-y-auto p-2">
              <Command.Empty className="py-6 text-center text-sm text-text-muted">
                No results found.
              </Command.Empty>

              {/* Send as new chat - when search doesn't match commands/sessions */}
              {search.trim() && (
                <Command.Group
                  heading="Quick send"
                  className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5"
                >
                  <Command.Item
                    value={`send ${search}`}
                    forceMount
                    onSelect={() => {
                      const text = search.trim();
                      if (!text) return;
                      const sid = createSession();
                      setActiveSession(sid);
                      setPendingMessage(text);
                      onOpenChange(false);
                      window.dispatchEvent(new CustomEvent("openpaw-new-chat"));
                    }}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer",
                      "text-text-secondary data-[selected=true]:bg-accent-cyan/10 data-[selected=true]:text-accent-cyan"
                    )}
                  >
                    <span className="text-xs">↩</span>
                    <span className="flex-1 truncate">
                      Send as new chat: {search.length > 40 ? search.slice(0, 40) + "…" : search}
                    </span>
                  </Command.Item>
                </Command.Group>
              )}

              {/* Sessions */}
              <Command.Group
                heading="Sessions"
                className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5"
              >
                <Command.Item
                  onSelect={() => {
                    createSession();
                    onOpenChange(false);
                    window.dispatchEvent(new CustomEvent("openpaw-new-chat"));
                  }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer",
                    "text-text-secondary data-[selected=true]:bg-accent-cyan/10 data-[selected=true]:text-accent-cyan"
                  )}
                >
                  <span className="text-xs">+</span>
                  New Chat Session
                </Command.Item>
                {allSessions.slice(0, 5).map((session) => (
                  <Command.Item
                    key={session.id}
                    value={`session ${session.title}`}
                    onSelect={() => {
                      setActiveSession(session.id);
                      onOpenChange(false);
                    }}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer",
                      "text-text-secondary data-[selected=true]:bg-accent-cyan/10 data-[selected=true]:text-accent-cyan"
                    )}
                  >
                    <span className="text-xs opacity-50">#</span>
                    <span className="truncate">{session.title}</span>
                  </Command.Item>
                ))}
              </Command.Group>

              {/* Models */}
              <Command.Group
                heading="Switch Model"
                className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5"
              >
                {configuredModels.map((model) => (
                  <Command.Item
                    key={model.id}
                    value={`model ${model.name} ${model.provider}`}
                    onSelect={() => {
                      setModelId(model.id);
                      onOpenChange(false);
                    }}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer",
                      "text-text-secondary data-[selected=true]:bg-accent-cyan/10 data-[selected=true]:text-accent-cyan"
                    )}
                  >
                    <div
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        model.id === modelId
                          ? "bg-terminal-green"
                          : "bg-white/20"
                      )}
                    />
                    <span className="flex-1">{model.name}</span>
                    <span className="text-[10px] text-text-muted">
                      {model.provider}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>

              {/* Actions */}
              <Command.Group
                heading="Actions"
                className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5"
              >
                <Command.Item
                  value="compare models side by side"
                  onSelect={() => {
                    onOpenChange(false);
                    window.dispatchEvent(new CustomEvent("openpaw-open-compare"));
                  }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer",
                    "text-text-secondary data-[selected=true]:bg-accent-cyan/10 data-[selected=true]:text-accent-cyan"
                  )}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                  </svg>
                  Compare Models
                </Command.Item>
                <Command.Item
                  value="browse skill marketplace"
                  onSelect={() => {
                    onOpenChange(false);
                    window.dispatchEvent(new CustomEvent("openpaw-open-marketplace"));
                  }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer",
                    "text-text-secondary data-[selected=true]:bg-accent-cyan/10 data-[selected=true]:text-accent-cyan"
                  )}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  Browse Skill Marketplace
                </Command.Item>
                <Command.Item
                  value="set workspace directory"
                  onSelect={() => {
                    const path = prompt("Enter workspace path:");
                    if (path) {
                      setWorkspacePath(path);
                    }
                    onOpenChange(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer",
                    "text-text-secondary data-[selected=true]:bg-accent-cyan/10 data-[selected=true]:text-accent-cyan"
                  )}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  Set Workspace Directory
                </Command.Item>
                <Command.Item
                  value="save current chat as template"
                  onSelect={() => {
                    const activeSession = sessions.find(
                      (s) => s.id === activeSessionId
                    );
                    const name = prompt(
                      "Template name:",
                      activeSession?.title ?? "My Template"
                    );
                    if (!name) {
                      onOpenChange(false);
                      return;
                    }
                    const description =
                      prompt("Short description:") ?? "";
                    const icon = prompt("Emoji icon:", "💬") ?? "💬";
                    const template: SessionTemplate = {
                      id:
                        "user-" +
                        Date.now().toString(36) +
                        Math.random().toString(36).slice(2, 6),
                      name,
                      description,
                      icon,
                    };
                    addTemplate(template);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer",
                    "text-text-secondary data-[selected=true]:bg-accent-cyan/10 data-[selected=true]:text-accent-cyan"
                  )}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                  </svg>
                  Save Current Chat as Template
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </div>
      </div>
    </div>
  );
}

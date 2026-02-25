"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { cn } from "@/lib/utils";
import { useConfiguredProviders } from "@/lib/hooks/use-configured-providers";
import { useSessionsStore } from "@/lib/store/sessions";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const {
    sessions,
    modelId,
    setModelId,
    setActiveSession,
    createSession,
    setWorkspacePath,
  } = useSessionsStore();
  const { configuredModels } = useConfiguredProviders();

  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) setSearch("");
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
                value={search}
                onValueChange={setSearch}
                placeholder="Type a command or search..."
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
                {sessions.slice(0, 5).map((session) => (
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
              </Command.Group>
            </Command.List>
          </Command>
        </div>
      </div>
    </div>
  );
}

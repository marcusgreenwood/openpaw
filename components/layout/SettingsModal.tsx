"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChannelsPanel } from "@/components/channels/ChannelsPanel";
import { ProviderKeysPanel } from "@/components/settings/ProviderKeysPanel";
import { MemorySettings } from "@/components/settings/MemorySettings";
import { useSessionsStore } from "@/lib/store/sessions";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type SettingsTab = "workspace" | "providers" | "memory" | "channels";

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>("workspace");
  const { workspacePath, setWorkspacePath, maxToolSteps, setMaxToolSteps, toolApprovalMode, setToolApprovalMode } =
    useSessionsStore();
  const [tempPath, setTempPath] = useState(workspacePath);
  const [tempMaxSteps, setTempMaxSteps] = useState(String(maxToolSteps ?? 15));
  const [defaultWorkspace, setDefaultWorkspace] = useState<string | null>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
      setTimeout(() => {
        setTempPath(workspacePath);
        setTempMaxSteps(String(maxToolSteps ?? 15));
      }, 0);
      fetch("/api/config")
        .then((r) => r.json())
        .then((d) => setDefaultWorkspace(d.defaultWorkspace ?? null))
        .catch(() => setDefaultWorkspace(null));
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, onClose, workspacePath, maxToolSteps]);

  if (!open) return null;

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    {
      id: "workspace",
      label: "Workspace",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      ),
    },
    {
      id: "providers",
      label: "API Keys",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      ),
    },
    {
      id: "memory",
      label: "Memory",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
    },
    {
      id: "channels",
      label: "Channels",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className={cn(
          "relative w-full max-w-lg h-[85vh] flex flex-col",
          "bg-bg-elevated border border-white/10 rounded-xl shadow-2xl",
          "overflow-hidden"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/8">
          <h2 id="settings-title" className="text-base font-semibold text-text-primary">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
            aria-label="Close settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex gap-1 px-4 pt-2 pb-0 border-b border-white/8">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors cursor-pointer",
                tab === t.id
                  ? "bg-white/8 text-text-primary"
                  : "text-text-muted hover:text-text-secondary hover:bg-white/5"
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {tab === "workspace" && (
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Workspace directory
                </label>
                <p className="text-xs text-text-muted mb-3">
                  All file operations and bash commands run in this directory.
                </p>
                <input
                  type="text"
                  value={tempPath}
                  onChange={(e) => setTempPath(e.target.value)}
                  onBlur={() => setWorkspacePath(tempPath)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setWorkspacePath(tempPath);
                    if (e.key === "Escape") setTempPath(workspacePath);
                  }}
                  placeholder="Leave empty for default"
                  className="w-full h-10 px-3 rounded-lg text-sm font-mono bg-white/5 border border-white/10 text-text-primary outline-none placeholder:text-text-muted focus:border-accent-cyan/40"
                />
                {!tempPath.trim() && defaultWorkspace && (
                  <p className="mt-2 text-xs text-text-muted font-mono truncate" title={defaultWorkspace}>
                    Using: {defaultWorkspace}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Max tool steps
                </label>
                <p className="text-xs text-text-muted mb-3">
                  Maximum number of tool-call steps before the agent stops. When
                  the limit is reached, you&apos;ll be asked if you want to
                  continue.
                </p>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={tempMaxSteps}
                  onChange={(e) => setTempMaxSteps(e.target.value)}
                  onBlur={() => {
                    const n = parseInt(tempMaxSteps, 10);
                    if (Number.isFinite(n) && n >= 5 && n <= 100) {
                      setMaxToolSteps(n);
                    } else {
                      setTempMaxSteps(String(maxToolSteps ?? 15));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const n = parseInt(tempMaxSteps, 10);
                      if (Number.isFinite(n) && n >= 5 && n <= 100) {
                        setMaxToolSteps(n);
                      }
                    }
                    if (e.key === "Escape") setTempMaxSteps(String(maxToolSteps ?? 15));
                  }}
                  className="w-full h-10 px-3 rounded-lg text-sm font-mono bg-white/5 border border-white/10 text-text-primary outline-none focus:border-accent-cyan/40"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Tool Approval Mode
                    </label>
                    <p className="text-xs text-text-muted">
                      Require manual approval before executing tools like bash commands and file writes.
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={toolApprovalMode}
                    onClick={() => setToolApprovalMode(!toolApprovalMode)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer",
                      toolApprovalMode
                        ? "bg-amber-500/60"
                        : "bg-white/10"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                        toolApprovalMode ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}
          {tab === "providers" && (
            <div className="min-h-0">
              <ProviderKeysPanel />
            </div>
          )}
          {tab === "memory" && (
            <div className="min-h-0">
              <MemorySettings />
            </div>
          )}
          {tab === "channels" && (
            <div className="p-4">
              <ChannelsPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

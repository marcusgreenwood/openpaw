"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useSessionsStore } from "@/lib/store/sessions";
import {
  clearSessionMessages,
  saveMessages,
} from "@/lib/chat/client-messages";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CronsPanel } from "@/components/layout/CronsPanel";
import { ToolAuditLog } from "@/components/layout/ToolAuditLog";
import { GitStatus } from "@/components/layout/GitStatus";
import { SkillMarketplace } from "@/components/skills/SkillMarketplace";
import { useAuditLogStore } from "@/lib/store/audit-log";
import type { Skill } from "@/types";

interface UsageSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: number;
  requestCount: number;
}

/** Format a timestamp as a relative string (e.g. "2m ago", "3h ago") */
function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function Sidebar() {
  const {
    sessions,
    cronSessions,
    activeSessionId,
    sidebarOpen,
    workspacePath,
    createSession,
    setActiveSession,
    deleteSession,
    setCronSessions,
    setSidebarOpen,
  } = useSessionsStore();

  const [skills, setSkills] = useState<Skill[]>([]);
  const [cronsCount, setCronsCount] = useState(0);
  const [tab, setTab] = useState<"sessions" | "crons" | "skills" | "audit">("sessions");
  const auditEntryCount = useAuditLogStore((s) => s.entries.length);

  useEffect(() => {
    const onSwitch = () => setTab("sessions");
    window.addEventListener("openpaw-switch-to-sessions", onSwitch);
    return () => window.removeEventListener("openpaw-switch-to-sessions", onSwitch);
  }, []);
  const [installInput, setInstallInput] = useState("");
  const [installing, setInstalling] = useState(false);
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const [usageBySession, setUsageBySession] = useState<Record<string, UsageSummary>>({});

  useEffect(() => {
    const url = workspacePath
      ? `/api/skills?workspace=${encodeURIComponent(workspacePath)}`
      : "/api/skills";
    fetch(url)
      .then((r) => r.json())
      .then((d) => setSkills(d.skills ?? []))
      .catch(() => {});
  }, [workspacePath]);

  useEffect(() => {
    fetch("/api/crons")
      .then((r) => r.json())
      .then((d) => setCronsCount((d.jobs ?? []).length))
      .catch(() => {});
  }, [tab]);

  const fetchCronSessions = useCallback(() => {
    fetch("/api/cron-sessions", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list = d.sessions ?? [];
        setCronSessions(list);
        for (const { session, messages } of list) {
          if (session?.id && messages?.length) {
            saveMessages(session.id, messages);
          }
        }
      })
      .catch(() => {});
  }, [setCronSessions]);

  useEffect(() => {
    fetchCronSessions();
  }, [fetchCronSessions]);

  useEffect(() => {
    const onCronSessionCreated = () => fetchCronSessions();
    window.addEventListener("openpaw-cron-session-created", onCronSessionCreated);
    return () =>
      window.removeEventListener("openpaw-cron-session-created", onCronSessionCreated);
  }, [fetchCronSessions]);

  // Fetch usage for sessions when tab or active session changes
  const fetchUsage = (ids: string[]) => {
    ids.forEach((id) => {
      fetch(`/api/sessions/${id}/usage`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (d.totalCostUsd !== undefined) {
            setUsageBySession((prev) => ({ ...prev, [id]: d }));
          }
        })
        .catch(() => {});
    });
  };

  const allSessions = [
    ...cronSessions.map((c) => ({ ...c.session, _source: "cron" as const })),
    ...sessions.map((s) => ({ ...s, _source: "user" as const })),
  ].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  // Fetch usage for all sessions when app loads and when sessions tab is shown
  useEffect(() => {
    if (tab !== "sessions") return;
    const ids = [
      ...cronSessions.map((c) => c.session.id),
      ...sessions.map((s) => s.id),
    ];
    if (ids.length === 0) return;
    fetchUsage(ids);
  }, [tab, sessions, cronSessions]);

  // Refetch usage when chat completes (immediate) and poll as fallback
  useEffect(() => {
    const onComplete = (e: CustomEvent<{ sessionId: string }>) => {
      fetchUsage([e.detail.sessionId]);
    };
    window.addEventListener(
      "openpaw-chat-complete",
      onComplete as EventListener
    );
    return () =>
      window.removeEventListener(
        "openpaw-chat-complete",
        onComplete as EventListener
      );
  }, []);

  useEffect(() => {
    if (tab !== "sessions" || !activeSessionId) return;
    const interval = setInterval(
      () => fetchUsage([activeSessionId]),
      5000
    );
    return () => clearInterval(interval);
  }, [tab, activeSessionId]);

  const refreshSkills = useCallback(() => {
    const url = workspacePath
      ? `/api/skills?workspace=${encodeURIComponent(workspacePath)}`
      : "/api/skills";
    fetch(url)
      .then((r) => r.json())
      .then((d) => setSkills(d.skills ?? []))
      .catch(() => {});
  }, [workspacePath]);

  useEffect(() => {
    const onOpen = () => setMarketplaceOpen(true);
    window.addEventListener("openpaw-open-marketplace", onOpen);
    return () => window.removeEventListener("openpaw-open-marketplace", onOpen);
  }, []);

  const handleInstallSkill = async () => {
    if (!installInput.trim()) return;
    setInstalling(true);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillName: installInput.trim() }),
      });
      const result = await res.json();
      if (result.success) {
        setInstallInput("");
        // Refresh skills
        const url = workspacePath
          ? `/api/skills?workspace=${encodeURIComponent(workspacePath)}`
          : "/api/skills";
        const r = await fetch(url);
        const d = await r.json();
        setSkills(d.skills ?? []);
      }
    } finally {
      setInstalling(false);
    }
  };

  // Mobile: bottom sheet, Desktop: left sidebar
  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          // Mobile: bottom sheet
          "fixed md:relative z-50 md:z-auto",
          "bottom-0 left-0 right-0 md:bottom-auto md:left-auto md:right-auto md:top-0",
          "md:w-80 md:h-full md:shrink-0",
          "transition-transform duration-300 ease-out",
          // Mobile show/hide
          sidebarOpen
            ? "translate-y-0 md:translate-x-0"
            : "translate-y-full md:translate-y-0 md:-translate-x-full md:hidden",
          "bg-bg-elevated md:bg-transparent",
          "rounded-t-2xl md:rounded-none",
          "max-h-[70vh] md:max-h-full",
          "border-t border-white/8 md:border-t-0 md:border-r md:border-white/6"
        )}
      >
        <div className="flex flex-col h-full p-4">
          {/* Mobile drag handle */}
          <div className="flex md:hidden justify-center mb-3">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-white/[0.03] rounded-lg p-1">
            <button
              onClick={() => setTab("sessions")}
              className={cn(
                "flex-1 text-xs py-1.5 rounded-md transition-colors cursor-pointer flex items-center justify-center gap-1.5",
                tab === "sessions"
                  ? "bg-white/8 text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              Sessions
              {allSessions.length > 0 && (
                <span className="text-[10px] opacity-60">
                  {allSessions.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("crons")}
              className={cn(
                "flex-1 text-xs py-1.5 rounded-md transition-colors cursor-pointer flex items-center justify-center gap-1.5",
                tab === "crons"
                  ? "bg-white/8 text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              Crons
              {cronsCount > 0 && (
                <span className="text-[10px] opacity-60">
                  {cronsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("skills")}
              className={cn(
                "flex-1 text-xs py-1.5 rounded-md transition-colors cursor-pointer flex items-center justify-center gap-1.5",
                tab === "skills"
                  ? "bg-white/8 text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              Skills
              {skills.length > 0 && (
                <span className="text-[10px] opacity-60">
                  {skills.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("audit")}
              className={cn(
                "flex-1 text-xs py-1.5 rounded-md transition-colors cursor-pointer flex items-center justify-center gap-1.5",
                tab === "audit"
                  ? "bg-white/8 text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              Audit
              {auditEntryCount > 0 && (
                <span className="text-[10px] opacity-60">
                  {auditEntryCount}
                </span>
              )}
            </button>
          </div>

          {tab === "sessions" ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto space-y-1">
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full mb-3"
                  onClick={() => {
                    createSession();
                    window.dispatchEvent(new CustomEvent("openpaw-new-chat"));
                  }}
                >
                  + New Chat
                </Button>

                {allSessions.map((session) => (
                  <div
                    key={session.id}
                    className={cn(
                      "group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer",
                      session.id === activeSessionId
                        ? "bg-accent-cyan/10 text-accent-cyan"
                        : "text-text-secondary hover:bg-white/5"
                    )}
                    onClick={() => setActiveSession(session.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="block truncate">{session.title}</span>
                        {session._source === "cron" && (
                          <Badge variant="default" className="shrink-0 text-[9px]">
                            cron
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] text-text-muted block">
                        {timeAgo(session.updatedAt ?? 0)}
                      </span>
                      {usageBySession[session.id]?.requestCount ? (
                        <span className="text-[10px] text-accent-cyan/90 font-mono">
                          ${usageBySession[session.id].totalCostUsd.toFixed(4)}
                        </span>
                      ) : null}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        clearSessionMessages(session.id);
                        if (session._source === "cron") {
                          fetch(`/api/cron-sessions?sessionId=${encodeURIComponent(session.id)}`, {
                            method: "DELETE",
                          }).catch(() => {});
                        }
                        deleteSession(session.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-opacity cursor-pointer text-xs shrink-0"
                    >
                      x
                    </button>
                  </div>
                ))}

                {allSessions.length === 0 && (
                  <p className="text-text-muted text-xs text-center py-4">
                    No sessions yet
                  </p>
                )}
              </div>

              {/* Git status at bottom of sessions tab */}
              <div className="shrink-0 border-t border-white/6 mt-2 pt-1">
                <GitStatus />
              </div>
            </div>
          ) : tab === "crons" ? (
            <CronsPanel />
          ) : tab === "audit" ? (
            <ToolAuditLog />
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2">
              {/* Browse Skills button */}
              <Button
                variant="primary"
                size="sm"
                className="w-full mb-2"
                onClick={() => setMarketplaceOpen(true)}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                Browse Skills
              </Button>

              {/* Install skill */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={installInput}
                  onChange={(e) => setInstallInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInstallSkill()}
                  placeholder="e.g. vercel-labs/agent-skills"
                  className="flex-1 h-8 px-3 rounded-lg text-xs font-mono bg-white/5 border border-white/8 text-text-primary outline-none placeholder:text-text-muted"
                />
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleInstallSkill}
                  disabled={installing}
                >
                  {installing ? "..." : "+"}
                </Button>
              </div>

              {skills.map((skill) => (
                <div
                  key={skill.name}
                  className="glass-card p-3 space-y-1"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text-primary">
                      {skill.name}
                    </span>
                    {skill.source === "user" ? (
                      <Badge variant="success">user</Badge>
                    ) : (
                      <Badge variant="default">built-in</Badge>
                    )}
                    {skill.tags?.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="default">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-text-muted line-clamp-2">
                    {skill.description}
                  </p>
                </div>
              ))}

              {skills.length === 0 && (
                <p className="text-text-muted text-xs text-center py-4">
                  No skills installed. Try installing from skills.sh
                </p>
              )}
            </div>
          )}
        </div>
      </aside>

      <SkillMarketplace
        open={marketplaceOpen}
        onOpenChange={setMarketplaceOpen}
        installedSkills={skills}
        onSkillInstalled={refreshSkills}
      />
    </>
  );
}

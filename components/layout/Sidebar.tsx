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
import { SkillEditor } from "@/components/skills/SkillEditor";
import { WorkflowsPanel } from "@/components/workflows/WorkflowsPanel";
import { useAuditLogStore } from "@/lib/store/audit-log";
import { useWorkflowsStore, BUILT_IN_WORKFLOWS } from "@/lib/store/workflows";
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
  const [tab, setTab] = useState<"sessions" | "crons" | "workflows" | "skills" | "audit">("sessions");
  const auditEntryCount = useAuditLogStore((s) => s.entries.length);
  const workflowCount = useWorkflowsStore((s) => s.workflows.length) + BUILT_IN_WORKFLOWS.length;

  useEffect(() => {
    const onSwitch = () => setTab("sessions");
    window.addEventListener("openpaw-switch-to-sessions", onSwitch);
    return () => window.removeEventListener("openpaw-switch-to-sessions", onSwitch);
  }, []);
  const [installInput, setInstallInput] = useState("");
  const [installing, setInstalling] = useState(false);
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [deletingSkill, setDeletingSkill] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ name: string; owner: string; repo: string; description: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [usageBySession, setUsageBySession] = useState<Record<string, UsageSummary>>({});
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);

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

  const handleSearchSkills = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/skills/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      setSearchResults(data.results ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleDeleteSkill = async (name: string) => {
    setDeletingSkill(name);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(name)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        refreshSkills();
      }
    } catch {
      // silently fail
    } finally {
      setDeletingSkill(null);
    }
  };

  const handleShareSession = async (sessionId: string) => {
    setSharingId(sessionId);
    try {
      const { loadMessages: loadMsgs } = await import("@/lib/chat/client-messages");
      const messages = loadMsgs(sessionId);
      const res = await fetch("/api/sessions/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, messages }),
      });
      const data = await res.json();
      if (data.shareUrl) {
        const fullUrl = `${window.location.origin}${data.shareUrl}`;
        await navigator.clipboard.writeText(fullUrl);
        setShareToast("Link copied!");
        setTimeout(() => setShareToast(null), 2500);
      }
    } catch {
      setShareToast("Failed to share");
      setTimeout(() => setShareToast(null), 2500);
    } finally {
      setSharingId(null);
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
              onClick={() => setTab("workflows")}
              className={cn(
                "flex-1 text-xs py-1.5 rounded-md transition-colors cursor-pointer flex items-center justify-center gap-1.5",
                tab === "workflows"
                  ? "bg-white/8 text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              Flows
              {workflowCount > 0 && (
                <span className="text-[10px] opacity-60">
                  {workflowCount}
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
                        handleShareSession(session.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent-cyan transition-opacity cursor-pointer text-xs shrink-0"
                      title="Share session"
                      disabled={sharingId === session.id}
                    >
                      {sharingId === session.id ? (
                        <span className="animate-pulse">...</span>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="18" cy="5" r="3" />
                          <circle cx="6" cy="12" r="3" />
                          <circle cx="18" cy="19" r="3" />
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                        </svg>
                      )}
                    </button>
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
          ) : tab === "workflows" ? (
            <WorkflowsPanel />
          ) : tab === "audit" ? (
            <ToolAuditLog />
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden space-y-2">
              {/* Search skills using find-skills (npx skills find) */}
              <div className="shrink-0 space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21l-4.35-4.35" />
                    </svg>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchSkills(e.target.value)}
                      placeholder="Search skills (npx skills find)..."
                      className="w-full h-8 pl-8 pr-3 rounded-lg text-xs bg-white/5 border border-white/8 text-text-primary outline-none placeholder:text-text-muted focus:border-accent-cyan/40"
                    />
                  </div>
                </div>

                {/* Install from repo */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={installInput}
                    onChange={(e) => setInstallInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleInstallSkill()}
                    placeholder="Install: owner/repo"
                    className="flex-1 h-7 px-2.5 rounded-md text-[11px] font-mono bg-white/5 border border-white/8 text-text-primary outline-none placeholder:text-text-muted"
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handleInstallSkill}
                    disabled={installing}
                    className="h-7 px-2 text-[11px]"
                  >
                    {installing ? "..." : "Install"}
                  </Button>
                </div>
              </div>

              {/* Search results */}
              {searchQuery.trim() && (
                <div className="shrink-0 border-b border-white/6 pb-2">
                  {searching ? (
                    <p className="text-text-muted text-[11px] text-center py-2 animate-pulse">Searching...</p>
                  ) : searchResults.length > 0 ? (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      <p className="text-[10px] text-text-muted uppercase tracking-wider">Search Results</p>
                      {searchResults.slice(0, 6).map((r) => {
                        const isInstalled = skills.some((s) => s.name === r.name);
                        return (
                          <div key={`${r.owner}/${r.repo}/${r.name}`} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/[0.02] hover:bg-white/5">
                            <div className="flex-1 min-w-0">
                              <span className="text-xs text-text-primary block truncate">{r.name}</span>
                              <span className="text-[10px] text-text-muted block truncate">{r.description}</span>
                            </div>
                            {isInstalled ? (
                              <Badge variant="success" className="text-[9px] shrink-0">Installed</Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="primary"
                                className="h-6 px-2 text-[10px] shrink-0"
                                onClick={async () => {
                                  setInstalling(true);
                                  try {
                                    await fetch("/api/skills", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ skillName: `${r.owner}/${r.repo}` }),
                                    });
                                    refreshSkills();
                                  } finally {
                                    setInstalling(false);
                                  }
                                }}
                                disabled={installing}
                              >
                                Install
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-text-muted text-[11px] text-center py-2">No skills found for &quot;{searchQuery}&quot;</p>
                  )}
                </div>
              )}

              {/* Installed skills list */}
              <div className="flex-1 overflow-y-auto space-y-1.5">
                <p className="text-[10px] text-text-muted uppercase tracking-wider">Installed Skills ({skills.length})</p>

                {skills.map((skill) => (
                  <div
                    key={skill.name}
                    className="group glass-card p-2.5 space-y-1 hover:border-white/12 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-text-primary flex-1 truncate">
                        {skill.name}
                      </span>
                      {skill.source === "user" ? (
                        <Badge variant="success" className="text-[9px]">user</Badge>
                      ) : (
                        <Badge variant="default" className="text-[9px]">built-in</Badge>
                      )}
                      {/* Edit button */}
                      <button
                        onClick={() => setEditingSkill(skill.name)}
                        className={cn(
                          "w-6 h-6 flex items-center justify-center rounded text-text-muted transition-all cursor-pointer",
                          skill.source === "built-in"
                            ? "hover:bg-white/5 hover:text-text-secondary"
                            : "hover:bg-accent-cyan/10 hover:text-accent-cyan"
                        )}
                        title={skill.source === "built-in" ? "View skill (read-only)" : "Edit skill"}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      {/* Delete button (user skills only) */}
                      {skill.source === "user" && (
                        <button
                          onClick={() => handleDeleteSkill(skill.name)}
                          disabled={deletingSkill === skill.name}
                          className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:bg-error/10 hover:text-error transition-all cursor-pointer"
                          title="Delete skill"
                        >
                          {deletingSkill === skill.name ? (
                            <span className="text-[10px] animate-pulse">...</span>
                          ) : (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-text-muted line-clamp-2">
                      {skill.description}
                    </p>
                    {skill.tags && skill.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {skill.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-text-muted">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {skills.length === 0 && (
                  <p className="text-text-muted text-xs text-center py-4">
                    No skills installed. Search above or install from skills.sh
                  </p>
                )}
              </div>
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

      {editingSkill && (
        <SkillEditor
          skillName={editingSkill}
          workspace={workspacePath || undefined}
          onClose={() => setEditingSkill(null)}
          onSaved={() => {
            refreshSkills();
            setEditingSkill(null);
          }}
        />
      )}

      {/* Share toast */}
      {shareToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60]">
          <div className="bg-accent-cyan/90 text-white text-sm px-4 py-2 rounded-lg shadow-lg backdrop-blur-sm">
            {shareToast}
          </div>
        </div>
      )}
    </>
  );
}

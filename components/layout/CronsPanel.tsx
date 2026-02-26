"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useSessionsStore } from "@/lib/store/sessions";
import { setPendingMessage } from "@/lib/store/pending-message";

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  type: "command" | "prompt";
  command?: string;
  prompt?: string;
  modelId?: string;
  workspacePath?: string;
  enabled: boolean;
  lastRunAt?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Panel for managing scheduled cron jobs within the sidebar.
 *
 * Features:
 *   - Lists all configured cron jobs fetched from `/api/crons`
 *   - Inline edit form for name, schedule, type (command/prompt), and enabled state
 *   - Delete button with a confirmation dialog
 *   - "Run now" button that creates a new chat session pre-seeded with the job's
 *     prompt or a bash run instruction, then switches to the Sessions tab
 *
 * Edit and delete operations POST/DELETE to `/api/crons` and re-fetch the list
 * on completion.
 */
export function CronsPanel() {
  const {
    workspacePath,
    createSession,
    setActiveSession,
    setModelId,
    setWorkspacePath,
  } = useSessionsStore();
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CronJob>>({});
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  const fetchCrons = useCallback(async () => {
    try {
      const res = await fetch("/api/crons");
      const data = await res.json();
      setCrons(data.jobs ?? []);
    } catch {
      setCrons([]);
    }
  }, []);

  useEffect(() => {
    fetchCrons();
  }, [fetchCrons]);

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/crons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          name: editForm.name,
          schedule: editForm.schedule,
          type: editForm.type ?? "command",
          command: editForm.command,
          prompt: editForm.prompt,
          modelId: editForm.modelId,
          workspacePath: editForm.workspacePath ?? workspacePath ?? undefined,
          enabled: editForm.enabled,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        setEditForm({});
        await fetchCrons();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this scheduled task?")) return;
    setSaving(true);
    try {
      await fetch(`/api/crons?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (editingId === id) {
        setEditingId(null);
        setEditForm({});
      }
      await fetchCrons();
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (job: CronJob) => {
    setEditingId(job.id);
    setEditForm({
      name: job.name,
      schedule: job.schedule,
      type: job.type ?? "command",
      command: job.command,
      prompt: job.prompt,
      modelId: job.modelId,
      workspacePath: job.workspacePath,
      enabled: job.enabled,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleRunNow = (job: CronJob) => {
    const isPrompt = (job.type ?? "command") === "prompt";
    const promptText = isPrompt
      ? (job.prompt ?? "").trim()
      : `Run this command in the workspace and show me the output:\n\`\`\`bash\n${job.command ?? ""}\n\`\`\``;

    if (!promptText) return;

    if (job.modelId) setModelId(job.modelId);
    if (job.workspacePath?.trim()) setWorkspacePath(job.workspacePath.trim());

    setPendingMessage(promptText, job.name);
    const newId = createSession();
    setActiveSession(newId);

    window.dispatchEvent(new CustomEvent("openpaw-switch-to-sessions"));
    window.dispatchEvent(new CustomEvent("openpaw-new-chat"));

    setRunningId(job.id);
    setTimeout(() => setRunningId(null), 500);
  };

  function formatLastRun(ts?: number): string {
    if (!ts) return "never";
    const d = new Date(ts);
    const diff = Date.now() - ts;
    if (diff < 60_000) return "just now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-text-muted px-1 mb-2">
        Scheduled tasks run via /api/crons/run (call every minute)
      </p>

      {crons.map((job) => (
        <div
          key={job.id}
          className={cn(
            "glass-card p-3 space-y-2",
            editingId === job.id && "ring-1 ring-accent-cyan/30"
          )}
        >
          {editingId === job.id ? (
            <>
              <input
                type="text"
                value={editForm.name ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Name"
                className="w-full h-8 px-3 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-text-primary outline-none"
              />
              <input
                type="text"
                value={editForm.schedule ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, schedule: e.target.value }))}
                placeholder="Cron (e.g. 0 * * * *)"
                className="w-full h-8 px-3 rounded-lg text-xs font-mono bg-white/5 border border-white/10 text-text-primary outline-none"
              />
              <div className="flex gap-2">
                <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                  <input
                    type="radio"
                    name={`type-${job.id}`}
                    checked={(editForm.type ?? "command") === "command"}
                    onChange={() => setEditForm((f) => ({ ...f, type: "command" as const }))}
                    className="rounded border-white/20"
                  />
                  Command
                </label>
                <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                  <input
                    type="radio"
                    name={`type-${job.id}`}
                    checked={(editForm.type ?? "command") === "prompt"}
                    onChange={() => setEditForm((f) => ({ ...f, type: "prompt" as const }))}
                    className="rounded border-white/20"
                  />
                  Prompt
                </label>
              </div>
              {(editForm.type ?? "command") === "command" ? (
                <textarea
                  value={editForm.command ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, command: e.target.value }))}
                  placeholder="Bash command"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-white/5 border border-white/10 text-text-primary outline-none resize-none"
                />
              ) : (
                <textarea
                  value={editForm.prompt ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, prompt: e.target.value }))}
                  placeholder="Detailed AI prompt (creates new chat session each run)"
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-white/5 border border-white/10 text-text-primary outline-none resize-none"
                />
              )}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.enabled ?? true}
                    onChange={(e) => setEditForm((f) => ({ ...f, enabled: e.target.checked }))}
                    className="rounded border-white/20"
                  />
                  Enabled
                </label>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="primary" onClick={handleSave} disabled={saving}>
                  {saving ? "..." : "Save"}
                </Button>
                <button
                  onClick={cancelEdit}
                  className="h-7 px-3 rounded-lg text-xs text-text-muted hover:text-text-secondary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(job.id)}
                  className="h-7 px-3 rounded-lg text-xs text-terminal-red/80 hover:text-terminal-red cursor-pointer ml-auto"
                >
                  Delete
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-text-primary truncate">
                  {job.name}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(job.type ?? "command") === "prompt" && (
                    <Badge variant="default">prompt</Badge>
                  )}
                  {job.enabled ? (
                    <Badge variant="success">on</Badge>
                  ) : (
                    <Badge variant="default">off</Badge>
                  )}
                </div>
              </div>
              <code className="block text-[10px] font-mono text-text-muted truncate">
                {job.schedule}
              </code>
              <p className="text-[11px] text-text-secondary line-clamp-2 font-mono">
                {(job.type ?? "command") === "prompt"
                  ? (job.prompt ?? "").slice(0, 80) + ((job.prompt?.length ?? 0) > 80 ? "…" : "")
                  : job.command ?? ""}
              </p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-text-muted">
                  Last run: {formatLastRun(job.lastRunAt)}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRunNow(job)}
                  disabled={runningId !== null}
                  className="text-[10px] h-6 px-2"
                >
                  {runningId === job.id ? "Opening…" : "Run now"}
                </Button>
              </div>
              <button
                onClick={() => startEdit(job)}
                className="text-[10px] text-accent-cyan/90 hover:text-accent-cyan cursor-pointer"
              >
                Edit
              </button>
            </>
          )}
        </div>
      ))}

      {crons.length === 0 && (
        <p className="text-text-muted text-xs text-center py-4">
          No scheduled tasks. Ask the agent to create one (e.g. &quot;schedule a daily backup at 2am&quot;).
        </p>
      )}
    </div>
  );
}

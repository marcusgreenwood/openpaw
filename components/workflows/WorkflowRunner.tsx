"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import type { WorkflowRun } from "@/lib/workflows/types";

const STATUS_ICONS: Record<string, string> = {
  pending: "⏳",
  running: "🔄",
  success: "✅",
  failure: "❌",
  skipped: "⏭️",
};

interface WorkflowRunnerProps {
  run: WorkflowRun;
  onCancel: () => void;
  onClose: () => void;
}

export function WorkflowRunner({ run, onCancel, onClose }: WorkflowRunnerProps) {
  const totalSteps = run.stepResults.length;
  const completedSteps = run.stepResults.filter(
    (r) => r.status === "success" || r.status === "failure" || r.status === "skipped"
  ).length;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
  const isFinished = run.status !== "running";

  const currentResult = run.stepResults[run.currentStepIndex];
  const displayOutput =
    currentResult?.output || currentResult?.error || "";

  return (
    <div className="flex flex-col gap-3 overflow-y-auto">
      {/* Progress bar */}
      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            run.status === "failed"
              ? "bg-terminal-red"
              : run.status === "cancelled"
                ? "bg-terminal-yellow"
                : "bg-accent-cyan"
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Status header */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-xs font-medium",
            run.status === "running" && "text-accent-cyan",
            run.status === "completed" && "text-terminal-green",
            run.status === "failed" && "text-terminal-red",
            run.status === "cancelled" && "text-terminal-yellow"
          )}
        >
          {run.status === "running"
            ? `Running step ${run.currentStepIndex + 1}/${totalSteps}...`
            : run.status === "completed"
              ? "Workflow completed"
              : run.status === "failed"
                ? "Workflow failed"
                : "Workflow cancelled"}
        </span>

        {run.status === "running" ? (
          <Button variant="danger" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      {/* Step list */}
      <div className="space-y-0">
        {run.stepResults.map((result, index) => {
          const isCurrent = index === run.currentStepIndex && run.status === "running";
          return (
            <div key={result.stepId} className="flex items-start gap-2 relative">
              {/* Connecting line */}
              {index < totalSteps - 1 && (
                <div className="absolute left-[11px] top-6 w-0.5 h-[calc(100%-8px)] bg-white/6" />
              )}

              {/* Circle indicator */}
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[11px] shrink-0 relative z-10",
                  isCurrent && "ring-2 ring-accent-cyan/40 animate-pulse",
                  result.status === "success" && "bg-green-500/10",
                  result.status === "failure" && "bg-red-500/10",
                  result.status === "running" && "bg-accent-cyan/10",
                  result.status === "pending" && "bg-white/5",
                  result.status === "skipped" && "bg-white/5"
                )}
              >
                {STATUS_ICONS[result.status] ?? "⏳"}
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0 pb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-xs font-medium truncate",
                      isCurrent
                        ? "text-accent-cyan"
                        : result.status === "success"
                          ? "text-terminal-green"
                          : result.status === "failure"
                            ? "text-terminal-red"
                            : "text-text-secondary"
                    )}
                  >
                    {result.stepId}
                  </span>
                  {result.durationMs !== undefined && (
                    <span className="text-[10px] text-text-muted font-mono shrink-0">
                      {result.durationMs < 1000
                        ? `${result.durationMs}ms`
                        : `${(result.durationMs / 1000).toFixed(1)}s`}
                    </span>
                  )}
                </div>

                {/* Expandable output for completed steps */}
                {(result.output || result.error) && (
                  <pre className="mt-1 p-2 rounded bg-white/[0.02] border border-white/5 text-[10px] font-mono text-text-muted max-h-24 overflow-auto whitespace-pre-wrap">
                    {result.error ? (
                      <span className="text-terminal-red">{result.error}</span>
                    ) : null}
                    {result.output ?? ""}
                  </pre>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Output panel */}
      {displayOutput && (
        <div className="glass-card p-3 space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            {isFinished ? "Last Output" : "Current Output"}
          </span>
          <pre className="text-[11px] font-mono text-text-secondary max-h-40 overflow-auto whitespace-pre-wrap">
            {displayOutput}
          </pre>
        </div>
      )}
    </div>
  );
}

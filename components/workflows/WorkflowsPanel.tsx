"use client";

import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { WorkflowEditor } from "@/components/workflows/WorkflowEditor";
import { WorkflowRunner } from "@/components/workflows/WorkflowRunner";
import {
  useWorkflowsStore,
  BUILT_IN_WORKFLOWS,
} from "@/lib/store/workflows";
import { useSessionsStore } from "@/lib/store/sessions";
import type { Workflow, WorkflowRun, WorkflowStepResult } from "@/lib/workflows/types";

export function WorkflowsPanel() {
  const { workflows, activeRun, addWorkflow, updateWorkflow, deleteWorkflow, startRun, updateRun, cancelRun } =
    useWorkflowsStore();
  const workspacePath = useSessionsStore((s) => s.workspacePath);

  const [mode, setMode] = useState<"list" | "edit" | "run">("list");
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | undefined>();
  const abortRef = useRef<AbortController | null>(null);

  const allWorkflows = [...BUILT_IN_WORKFLOWS, ...workflows];

  const handleNewWorkflow = () => {
    setEditingWorkflow(undefined);
    setMode("edit");
  };

  const handleEditWorkflow = (workflow: Workflow) => {
    setEditingWorkflow(workflow);
    setMode("edit");
  };

  const handleSaveWorkflow = useCallback(
    (data: Omit<Workflow, "id" | "createdAt" | "updatedAt">) => {
      if (editingWorkflow && !editingWorkflow.id.startsWith("builtin-")) {
        updateWorkflow(editingWorkflow.id, data);
      } else {
        addWorkflow(data);
      }
      setMode("list");
      setEditingWorkflow(undefined);
    },
    [editingWorkflow, addWorkflow, updateWorkflow]
  );

  const handleDeleteWorkflow = (id: string) => {
    if (id.startsWith("builtin-")) return;
    deleteWorkflow(id);
  };

  const processSSEEvent = (event: string, data: Record<string, unknown>) => {
    const currentRun = useWorkflowsStore.getState().activeRun;
    if (!currentRun) return;

    if (event === "step-start") {
      const stepIndex = data.stepIndex as number;
      const results = [...currentRun.stepResults];
      if (results[stepIndex]) {
        results[stepIndex] = { ...results[stepIndex], status: "running" };
      }
      updateRun({
        currentStepIndex: stepIndex,
        stepResults: results,
      });
    } else if (event === "step-complete") {
      const result = data as unknown as WorkflowStepResult;
      const results = [...currentRun.stepResults];
      const idx = results.findIndex((r) => r.stepId === result.stepId);
      if (idx >= 0) {
        results[idx] = result;
      }
      updateRun({ stepResults: results });
    } else if (event === "run-complete") {
      updateRun({
        status: data.status as WorkflowRun["status"],
        completedAt: Date.now(),
      });
    }
  };

  const handleRunWorkflow = useCallback(
    async (workflow: Workflow) => {
      startRun(workflow.id, workflow.steps);
      setMode("run");

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/workflows/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workflowId: workflow.id,
            workspacePath: workspacePath || undefined,
            steps: workflow.steps,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          updateRun({
            status: "failed",
            completedAt: Date.now(),
          });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ") && eventType) {
              try {
                const data = JSON.parse(line.slice(6));
                processSSEEvent(eventType, data);
              } catch {
                // skip malformed JSON
              }
              eventType = "";
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          updateRun({ status: "cancelled", completedAt: Date.now() });
        } else {
          updateRun({ status: "failed", completedAt: Date.now() });
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startRun, updateRun, workspacePath]
  );

  const handleCancelRun = () => {
    abortRef.current?.abort();
    cancelRun();
  };

  const handleCloseRun = () => {
    setMode("list");
  };

  if (mode === "edit") {
    return (
      <WorkflowEditor
        workflow={editingWorkflow}
        onSave={handleSaveWorkflow}
        onCancel={() => {
          setMode("list");
          setEditingWorkflow(undefined);
        }}
      />
    );
  }

  if (mode === "run" && activeRun) {
    return (
      <WorkflowRunner
        run={activeRun}
        onCancel={handleCancelRun}
        onClose={handleCloseRun}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-2">
      <Button
        variant="primary"
        size="sm"
        className="w-full mb-3"
        onClick={handleNewWorkflow}
      >
        + New Workflow
      </Button>

      <p className="text-[10px] uppercase tracking-wider text-text-muted px-1 mb-2">
        Workflows execute sequential steps (commands, prompts, conditions)
      </p>

      {allWorkflows.map((workflow) => {
        const isBuiltIn = workflow.id.startsWith("builtin-");
        return (
          <div key={workflow.id} className="glass-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">{workflow.icon}</span>
                <span className="text-sm font-medium text-text-primary truncate">
                  {workflow.name}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant="default">
                  {workflow.steps.length} step{workflow.steps.length !== 1 ? "s" : ""}
                </Badge>
                {isBuiltIn && <Badge variant="cyan">built-in</Badge>}
              </div>
            </div>

            {workflow.description && (
              <p className="text-[11px] text-text-muted line-clamp-2">
                {workflow.description}
              </p>
            )}

            <div className="flex items-center gap-1.5 pt-1">
              <Button
                size="sm"
                variant="primary"
                className="text-[10px] h-6 px-2"
                onClick={() => handleRunWorkflow(workflow)}
              >
                ▶️ Run
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-[10px] h-6 px-2"
                onClick={() => handleEditWorkflow(workflow)}
              >
                ✏️ Edit
              </Button>
              {!isBuiltIn && (
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn("text-[10px] h-6 px-2 text-terminal-red/70 hover:text-terminal-red")}
                  onClick={() => handleDeleteWorkflow(workflow.id)}
                >
                  🗑️ Delete
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {allWorkflows.length === 0 && (
        <p className="text-text-muted text-xs text-center py-4">
          No workflows yet. Create one to automate multi-step tasks.
        </p>
      )}
    </div>
  );
}

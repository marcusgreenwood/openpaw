/**
 * Client store for workflow definitions and the currently executing run.
 *
 * Persisted to localStorage under `openpaw-workflows`, but only `workflows` is saved —
 * `activeRun` is intentionally dropped, so a run does not appear to resume after a reload.
 *
 * Note this is a separate store from the server-side definitions in
 * lib/workflows/workflow-store.ts (`.claw/workflows.json`); the two are not synchronized.
 */

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Workflow,
  WorkflowStep,
  WorkflowRun,
} from "@/lib/workflows/types";

/** Generates a short id from the current time plus random suffix. */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Example workflows shipped with the app.
 *
 * Their `createdAt` / `updatedAt` are `0` to mark them as built-in rather than authored.
 */
export const BUILT_IN_WORKFLOWS: Workflow[] = [
  {
    id: "builtin-test-fix",
    name: "Test & Fix",
    description: "Run tests → if fail, send error to AI → fix → re-run tests",
    icon: "🧪",
    steps: [
      {
        id: "step-run-tests",
        type: "command",
        name: "Run Tests",
        command: "npm test",
        continueOnError: true,
      },
      {
        id: "step-check-result",
        type: "condition",
        name: "Tests Passed?",
        condition: "!output.includes('FAIL') && !output.includes('Error')",
        onTrue: "step-done",
        onFalse: "step-send-error",
      },
      {
        id: "step-send-error",
        type: "prompt",
        name: "Send Error to AI",
        prompt:
          "The following test output contains failures. Please analyze and suggest fixes:\n\n{{previousOutput}}",
      },
      {
        id: "step-rerun-tests",
        type: "command",
        name: "Re-run Tests",
        command: "npm test",
      },
      {
        id: "step-done",
        type: "command",
        name: "Done",
        command: "echo 'All tests passed!'",
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "builtin-build-deploy",
    name: "Build & Deploy",
    description: "Lint → Build → Run tests → Deploy",
    icon: "📦",
    steps: [
      {
        id: "step-lint",
        type: "command",
        name: "Lint",
        command: "npm run lint",
      },
      {
        id: "step-build",
        type: "command",
        name: "Build",
        command: "npm run build",
      },
      {
        id: "step-test",
        type: "command",
        name: "Run Tests",
        command: "npm test",
      },
      {
        id: "step-deploy",
        type: "command",
        name: "Deploy",
        command: "echo 'Deploying...' && npm run deploy",
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "builtin-daily-report",
    name: "Daily Report",
    description: "Git log → Summarize changes → Send to chat",
    icon: "📊",
    steps: [
      {
        id: "step-git-log",
        type: "command",
        name: "Git Log",
        command: "git log --oneline --since='1 day ago'",
      },
      {
        id: "step-summarize",
        type: "prompt",
        name: "Summarize Changes",
        prompt:
          "Summarize the following git log into a concise daily report with key changes and highlights:\n\n{{previousOutput}}",
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
];

interface WorkflowsState {
  workflows: Workflow[];
  activeRun: WorkflowRun | null;

  addWorkflow: (workflow: Omit<Workflow, "id" | "createdAt" | "updatedAt">) => string;
  updateWorkflow: (id: string, updates: Partial<Omit<Workflow, "id" | "createdAt">>) => void;
  deleteWorkflow: (id: string) => void;
  startRun: (workflowId: string, steps: WorkflowStep[]) => string;
  updateRun: (updates: Partial<WorkflowRun>) => void;
  cancelRun: () => void;
}

/**
 * Workflow state.
 *
 * - `addWorkflow(workflow)` — saves a definition with a generated `wf_` id and timestamps,
 *   returning the id
 * - `updateWorkflow(id, updates)` — merges changes and bumps `updatedAt`
 * - `deleteWorkflow(id)` — removes a definition
 * - `startRun(workflowId, steps)` — replaces `activeRun` with a fresh run whose step
 *   results are all seeded `pending`, and returns the `run_`-prefixed run id
 * - `updateRun(updates)` — merges progress into the active run; a no-op if none is active
 * - `cancelRun()` — marks the active run `cancelled` and stamps `completedAt`. This only
 *   updates local state; it does not abort the request to /api/workflows/run
 */
export const useWorkflowsStore = create<WorkflowsState>()(
  persist(
    (set) => ({
      workflows: [],
      activeRun: null,

      addWorkflow: (workflow) => {
        const id = `wf_${generateId()}`;
        const now = Date.now();
        const newWorkflow: Workflow = {
          ...workflow,
          id,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          workflows: [...state.workflows, newWorkflow],
        }));
        return id;
      },

      updateWorkflow: (id, updates) =>
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === id ? { ...w, ...updates, updatedAt: Date.now() } : w
          ),
        })),

      deleteWorkflow: (id) =>
        set((state) => ({
          workflows: state.workflows.filter((w) => w.id !== id),
        })),

      startRun: (workflowId, steps) => {
        const runId = `run_${generateId()}`;
        const run: WorkflowRun = {
          id: runId,
          workflowId,
          status: "running",
          currentStepIndex: 0,
          stepResults: steps.map((step) => ({
            stepId: step.id,
            status: "pending" as const,
          })),
          startedAt: Date.now(),
        };
        set({ activeRun: run });
        return runId;
      },

      updateRun: (updates) =>
        set((state) => {
          if (!state.activeRun) return state;
          return {
            activeRun: { ...state.activeRun, ...updates },
          };
        }),

      cancelRun: () =>
        set((state) => {
          if (!state.activeRun) return state;
          return {
            activeRun: {
              ...state.activeRun,
              status: "cancelled",
              completedAt: Date.now(),
            },
          };
        }),
    }),
    {
      name: "openpaw-workflows",
      partialize: (state) => ({
        workflows: state.workflows,
      }),
    }
  )
);

/**
 * @file Workflow domain types shared by the store, the UI, and the runner route.
 *
 * A {@link Workflow} is a saved, ordered list of {@link WorkflowStep}s. Executing
 * one produces a {@link WorkflowRun} whose `stepResults` are filled in as the
 * `/api/workflows/run` SSE stream reports progress.
 */

/**
 * A single unit of work in a workflow.
 *
 * The meaningful fields depend on `type`: `command` uses `command`, `prompt` uses
 * `prompt`, and `condition` uses `condition` plus the `onTrue`/`onFalse` step ids
 * it branches to. In `command` and `prompt` steps the placeholder
 * `{{previousOutput}}` is replaced with the previous step's output.
 */
export interface WorkflowStep {
  id: string;
  type: "prompt" | "command" | "condition";
  name: string;
  prompt?: string;
  command?: string;
  condition?: string;
  onTrue?: string;
  onFalse?: string;
  timeout?: number;
  continueOnError?: boolean;
}

/** A saved, named sequence of steps. */
export interface Workflow {
  id: string;
  name: string;
  description: string;
  icon: string;
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
}

/**
 * One execution of a workflow.
 *
 * `stepResults` is seeded with a `pending` entry per step and filled in as the
 * `/api/workflows/run` stream reports progress. Because `condition` steps can
 * jump backwards, `currentStepIndex` is not necessarily monotonic.
 */
export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  currentStepIndex: number;
  stepResults: WorkflowStepResult[];
  startedAt: number;
  completedAt?: number;
}

/** Outcome of a single step within a run. */
export interface WorkflowStepResult {
  stepId: string;
  status: "pending" | "running" | "success" | "failure" | "skipped";
  output?: string;
  error?: string;
  durationMs?: number;
}

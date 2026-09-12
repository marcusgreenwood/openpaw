/**
 * Shared types for workflows — multi-step automations that chain shell commands and AI
 * prompts together.
 *
 * Definitions are persisted server-side by lib/workflows/workflow-store.ts and executed by
 * POST /api/workflows/run; the browser-side run state lives in lib/store/workflows.ts.
 */

/**
 * One step in a workflow. Which optional fields apply depends on `type`.
 */
export interface WorkflowStep {
  /** Stable identifier, referenced by a condition's `onTrue` / `onFalse`. */
  id: string;
  /**
   * What the step does:
   * - `command` — run `command` as a shell command in the workspace; its combined
   *   stdout/stderr becomes the previous output for the next step
   * - `prompt` — interpolate `prompt` and pass it along. Note that the current executor
   *   in app/api/workflows/run/route.ts does not call a model: it echoes the resolved
   *   prompt back and uses that text as the previous output
   * - `condition` — evaluate `condition` and jump to `onTrue` or `onFalse`
   *
   * In both `command` and `prompt` text, `{{previousOutput}}` is replaced with the
   * preceding step's output.
   */
  type: "prompt" | "command" | "condition";
  /** Human-readable label shown in the workflow UI. */
  name: string;
  /** Prompt text for `prompt` steps. */
  prompt?: string;
  /** Shell command for `command` steps. */
  command?: string;
  /**
   * JavaScript expression evaluated for `condition` steps, coerced with `Boolean()`.
   * The preceding step's output is in scope as `output`, e.g. `!output.includes('FAIL')`.
   * An expression that throws is treated as `false`.
   */
  condition?: string;
  /** Step id to jump to when a `condition` evaluates truthy. */
  onTrue?: string;
  /** Step id to jump to when a `condition` evaluates falsy. */
  onFalse?: string;
  /**
   * Timeout for `command` steps, in milliseconds. Defaults to 60000.
   * Jump targets are resolved by id; an unknown or absent target falls through to the
   * next step in order.
   */
  timeout?: number;
  /** When true, a failing step does not abort the run. Otherwise the run ends as failed. */
  continueOnError?: boolean;
}

/** A saved workflow definition. */
export interface Workflow {
  /** Generated id, prefixed `wf_`. */
  id: string;
  /** Display name. */
  name: string;
  /** Short summary shown in the workflow list. */
  description: string;
  /** Emoji shown next to the name. */
  icon: string;
  /** Steps in declaration order; execution may jump between them via conditions. */
  steps: WorkflowStep[];
  /** Creation time, ms since epoch. */
  createdAt: number;
  /** Last modification time, ms since epoch. */
  updatedAt: number;
}

/** A single execution of a workflow, including its progress so far. */
export interface WorkflowRun {
  /** Generated id, prefixed `run_`. */
  id: string;
  /** The {@link Workflow} being executed. */
  workflowId: string;
  /** Current run state; terminal once it is anything other than `running`. */
  status: "running" | "completed" | "failed" | "cancelled";
  /** Index into the workflow's `steps` of the step currently executing. */
  currentStepIndex: number;
  /** One entry per step, seeded as `pending` when the run starts. */
  stepResults: WorkflowStepResult[];
  /** Start time, ms since epoch. */
  startedAt: number;
  /** Completion time, ms since epoch; unset while still running. */
  completedAt?: number;
}

/** The outcome of one step within a run. */
export interface WorkflowStepResult {
  /** The {@link WorkflowStep} this result belongs to. */
  stepId: string;
  /**
   * Step state. `pending` is the seeded value before the run reaches the step, and
   * `skipped` is emitted for a step whose `type` is not recognized. Steps that a
   * condition branches around simply never receive a result.
   */
  status: "pending" | "running" | "success" | "failure" | "skipped";
  /** Combined stdout/stderr for command steps, or the resolved text for prompt steps. */
  output?: string;
  /** Failure message when `status` is `failure`, e.g. `"Exit code: 1"`. */
  error?: string;
  /** Wall-clock duration in milliseconds. */
  durationMs?: number;
}

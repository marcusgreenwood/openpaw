# Workflows

Workflows are ordered lists of steps — shell commands, AI prompts, and conditional branches — run sequentially from the sidebar, with each step's output available to the next.

Open the **Workflows** panel in the sidebar (`components/workflows/WorkflowsPanel.tsx`).

> **Prompt steps do not call a model yet.** `POST /api/workflows/run` handles `type: "prompt"` by interpolating the template and returning it as `[Prompt sent to AI]\n\n<prompt>`. Nothing is sent to a provider. Command and condition steps execute for real.

---

## Data model

From `lib/workflows/types.ts`.

### `Workflow`

```ts
interface Workflow {
  id: string;          // "wf_<base36>_<rand>" (server) or "wf_<generated>" (client)
  name: string;
  description: string;
  icon: string;        // emoji, defaults to "⚡" server-side
  steps: WorkflowStep[];
  createdAt: number;   // epoch ms
  updatedAt: number;
}
```

### `WorkflowStep`

```ts
interface WorkflowStep {
  id: string;
  type: "prompt" | "command" | "condition";
  name: string;
  prompt?: string;          // type: "prompt"
  command?: string;         // type: "command"
  condition?: string;       // type: "condition" — JS expression over `output`
  onTrue?: string;          // step id to jump to when the condition is true
  onFalse?: string;         // step id to jump to when the condition is false
  timeout?: number;         // ms, default 60000 — command steps only
  continueOnError?: boolean;// keep going after a failed step
}
```

### `WorkflowRun` and `WorkflowStepResult`

```ts
interface WorkflowRun {
  id: string;
  workflowId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  currentStepIndex: number;
  stepResults: WorkflowStepResult[];
  startedAt: number;
  completedAt?: number;
}

interface WorkflowStepResult {
  stepId: string;
  status: "pending" | "running" | "success" | "failure" | "skipped";
  output?: string;
  error?: string;
  durationMs?: number;
}
```

`WorkflowRun` is a client-side concept: the runner builds it in the Zustand store and updates it from the SSE stream. The server never constructs one.

---

## Step types

### `command`

Runs via Node's `exec` with `cwd` set to `workspacePath` (falling back to `process.cwd()`), a 1 MiB output buffer, and `timeout` milliseconds (default 60 000).

- `output` is `stdout` plus `\n` + `stderr` when stderr is non-empty, trimmed
- `status` is `"success"` when the exit code is `0`, else `"failure"` with `error: "Exit code: <n>"`
- The trimmed output becomes `previousOutput` for the following step

Unlike `executeBash`, command steps are **not** filtered through `BLOCKED_PATTERNS` and do not get the workspace virtualenv on `PATH`.

### `prompt`

Interpolates `{{previousOutput}}` and returns the resulting text as the step output with `status: "success"`. `previousOutput` becomes the interpolated prompt. As noted above, no model call happens.

### `condition`

Evaluates `condition` as a JavaScript expression with the previous step's output bound to a variable named `output`:

```js
new Function("output", `return Boolean(${expression})`)
```

A thrown or malformed expression evaluates to `false`. The step always reports `status: "success"` with output `Condition evaluated to: <bool>`.

Branching: the runner looks up `onTrue` (or `onFalse`) as a **step id** and jumps to that index. If the target is missing or the id is not found, execution falls through to the next step. `previousOutput` is not modified by a condition step, so a branch target still sees the output of the last command.

Because branching is an arbitrary jump by id, backwards edges — and therefore infinite loops — are possible. There is no iteration cap.

### Templating

`{{previousOutput}}` is the only supported placeholder, substituted globally in `command` and `prompt` strings.

### `continueOnError`

After a step reports `failure`, the run stops and emits `run-complete: { status: "failed" }` unless the step sets `continueOnError: true`, in which case the runner advances to the next step.

---

## Execution and streaming

`POST /api/workflows/run` takes `{ workflowId, workspacePath?, steps }` — the caller supplies the steps, so the endpoint never reads the store — and streams `text/event-stream`:

| Event | Payload |
|---|---|
| `step-start` | `{ stepId, stepIndex, name, type }` |
| `step-complete` | `WorkflowStepResult` |
| `run-complete` | `{ status: "completed" }` or `{ status: "failed" }` |

`WorkflowsPanel` reads the stream with a manual `ReadableStream` reader and an `AbortController`, mapping each event onto the active run. Cancelling aborts the fetch and marks the run `"cancelled"` client-side; the server-side process is not signalled.

Unknown step types produce `status: "skipped"` with output `"Unknown step type"`, which does not halt the run.

---

## Where workflows are stored

There are two independent stores, and the UI uses only the first:

| | Client | Server |
|---|---|---|
| Location | `localStorage` key `openpaw-workflows` | `.claw/workflows.json` |
| Module | `lib/store/workflows.ts` (Zustand `persist`) | `lib/workflows/workflow-store.ts` |
| Written by | `WorkflowsPanel` add/update/delete | `POST`/`PUT`/`DELETE /api/workflows` only |
| Read by | `WorkflowsPanel` | `GET /api/workflows` only |

Nothing synchronises them. The `/api/workflows` CRUD endpoints are fully implemented but currently have no caller in the app — they are usable as an API, but a workflow created through them will not appear in the sidebar, and vice versa. `activeRun` is deliberately excluded from persistence via `partialize`, so an in-flight run does not survive a reload.

## Built-in workflows

`BUILT_IN_WORKFLOWS` in `lib/store/workflows.ts` ships three examples, prepended to the user's list. Their ids start with `builtin-`, which makes them non-deletable; editing one saves a copy as a new workflow rather than mutating it.

| Workflow | Steps |
|---|---|
| 🧪 **Test & Fix** | `npm test` (continueOnError) → condition on `output` → prompt with the failure → re-run tests → done |
| 📦 **Build & Deploy** | `npm run lint` → `npm run build` → `npm test` → deploy |
| 📊 **Daily Report** | `git log --oneline --since='1 day ago'` → summarise via prompt |

These reference `npm test` and `npm run deploy`, which are **not** defined in this repo's `package.json` — they are illustrative templates, not runnable as-is here.

---

## UI components

| Component | Role |
|---|---|
| `components/workflows/WorkflowsPanel.tsx` | Sidebar entry point: lists workflows, owns run state, drives the SSE stream |
| `components/workflows/WorkflowEditor.tsx` | Create/edit form for a workflow and its steps |
| `components/workflows/WorkflowRunner.tsx` | Live per-step progress view for the active run |

The panel is mounted from `components/layout/Sidebar.tsx`.

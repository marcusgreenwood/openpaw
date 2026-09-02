# Agent Tools

The tools the model can call during a chat turn. They are assembled by `allTools(workspacePath, sessionId)` in `lib/tools/index.ts` and passed to `streamText` / `generateText` by `lib/chat/handler.ts`.

`allTools()` returns **15** tools: 12 defined directly plus the 3 spread from `memoryTools(sessionId ?? "default")`.

| Tool | Module | Purpose |
|---|---|---|
| `askChoice` | `lib/tools/ask-choice.ts` | Present clickable options to the user |
| `executeBash` | `lib/tools/bash.ts` | Run a shell command in the workspace |
| `readFile` | `lib/tools/filesystem.ts` | Read a workspace file |
| `writeFile` | `lib/tools/filesystem.ts` | Write/overwrite a workspace file |
| `listDirectory` | `lib/tools/filesystem.ts` | List a workspace directory |
| `createDirectory` | `lib/tools/filesystem.ts` | Create a workspace directory |
| `executeCode` | `lib/tools/execute-code.ts` | Run a JS/TS/Python snippet |
| `createCron` | `lib/tools/cron.ts` | Create a scheduled task |
| `updateCron` | `lib/tools/cron.ts` | Update a scheduled task |
| `deleteCron` | `lib/tools/cron.ts` | Delete a scheduled task |
| `listCrons` | `lib/tools/cron.ts` | List scheduled tasks |
| `searchContext` | `lib/tools/context.ts` | Keyword-search the workspace |
| `saveMemory` | `lib/tools/memory.ts` | Write a fact to long-term memory |
| `recallMemory` | `lib/tools/memory.ts` | Search long-term memory |
| `listMemories` | `lib/tools/memory.ts` | List stored memories |

Most tools are factories closed over the resolved workspace path, so the workspace is never part of the model-visible schema. `askChoice`, `recallMemory` and `listMemories` are plain tool objects with no workspace binding.

## Path semantics

Every filesystem tool takes a path **relative to the workspace root**. `lib/tools/filesystem.ts` resolves it with `path.resolve(workspacePath, filePath)` and throws `Path traversal blocked: <path>` if the result escapes the workspace. `executeBash` instead prefixes the command with `cd '<workspace>' &&`, so relative paths in shell commands resolve the same way.

## Step limits

The agent loop stops at `MAX_TOOL_STEPS` (default 15, override per request with `maxToolSteps`, or globally with `CLAW_MAX_TOOL_STEPS`) or as soon as `askChoice` is called — `askChoice` deliberately ends the turn so the user can answer.

---

## `askChoice`

Presents multiple-choice buttons. Calling it ends the agent turn.

| Parameter | Type | Notes |
|---|---|---|
| `question` | `string` | Short prompt |
| `options` | `string[]` | 1–10 entries, each one clickable choice |

Returns `{ question, options }` — the UI renders it (`components/generative-ui/MultipleChoice.tsx`).

---

## `executeBash`

Runs a command with `bash -c` in the workspace directory.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `command` | `string` | — | The shell command |
| `timeout` | `number` | `BASH_TIMEOUT_MS` (30000) | Milliseconds |
| `streaming` | `boolean` | `false` | Signals the UI to show a live terminal; does not change the tool's return value |

Returns `{ stdout, stderr, exitCode, timedOut, durationMs }`, plus `blocked: true` when a safety pattern matched. `stdout` is truncated to 50 000 characters and `stderr` to 10 000. A timeout kills the whole process group and reports `exitCode: 124`.

The command runs with the workspace Python virtualenv on `PATH` (`ensureVenv` / `getVenvEnv` from `lib/python-sandbox.ts`) and `TERM=dumb`, so `pip install` lands in `<workspace>/.venv`.

The tool's parameter description mentions a `CLAW_BASH_TIMEOUT_MS` env var; that variable is read in `lib/chat/config.ts` and does set the default, so it applies to this tool as documented.

### Blocked patterns

`BLOCKED_PATTERNS` in `lib/tools/bash.ts` is a regex denylist checked before execution. A match returns immediately with `blocked: true`, `exitCode: 1` and no process spawned. The same list gates `POST /api/terminal`, which returns `403` instead.

| Pattern | Blocks |
|---|---|
| `/rm\s+-rf\s+\//` | `rm -rf /…` |
| `/sudo\s+rm/` | `sudo rm …` |
| `/mkfs/` | filesystem creation |
| `/dd\s+if=/` | raw device writes via `dd` |
| `/>\s*\/dev\/sd/` | redirecting onto a block device |
| `/chmod\s+-R\s+777\s+\//` | recursive world-writable on `/` |

This is a coarse guard against obvious footguns, not a sandbox. The tool otherwise runs arbitrary commands with the server process's privileges.

### Output-path rewriting

Some CLI tools resolve relative output paths from the project root rather than the working directory. `OUTPUT_PATH_REWRITE_PATTERNS` rewrites those arguments to absolute workspace paths before execution. It currently covers `agent-browser screenshot` and `agent-browser pdf`.

---

## `readFile`

| Parameter | Type | Notes |
|---|---|---|
| `path` | `string` | Relative to workspace root |

Returns `{ path, content, size }`. `content` is truncated to 100 000 characters; `size` is the untruncated length.

## `writeFile`

| Parameter | Type | Notes |
|---|---|---|
| `path` | `string` | Relative to workspace root |
| `content` | `string` | Full file contents (overwrites) |

Creates parent directories automatically. Returns `{ path, written: true, previousContent, bytesWritten }`. `previousContent` is the prior text, or `null` for a new file — this is what drives the diff view in the UI.

## `listDirectory`

| Parameter | Type | Default |
|---|---|---|
| `path` | `string` | `"."` |

Returns `{ path, entries: [{ name, type: "file" | "directory", path }] }`, where each `entry.path` is joined onto the requested directory.

## `createDirectory`

| Parameter | Type |
|---|---|
| `path` | `string` |

Recursive `mkdir`. Returns `{ path, created: true }`.

---

## `executeCode`

Writes the snippet to a temp file and runs it.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `code` | `string` | — | Source to run |
| `language` | `"javascript" \| "typescript" \| "python"` | — | Required |
| `timeout` | `number` | `CODE_EXEC_TIMEOUT_MS` (15000) | Milliseconds |

Extensions used: `.py`, `.ts`, `.mjs`. Python runs against the workspace virtualenv. Returns `{ stdout, stderr, exitCode, language, timedOut, durationMs }`.

---

## Cron tools

These write to the same store as the Crons panel and `/api/crons` — see [api-reference.md](./api-reference.md#crons).

### `createCron`

| Parameter | Type | Notes |
|---|---|---|
| `name` | `string` | Short descriptive name |
| `schedule` | `string` | Cron expression, e.g. `0 * * * *` |
| `type` | `"command" \| "prompt"` | Optional; inferred as `"prompt"` when `prompt` is set, else `"command"` |
| `command` | `string` | Required when `type` is `"command"` |
| `prompt` | `string` | Required when `type` is `"prompt"` |
| `modelId` | `string` | Model for prompt crons |
| `workspacePath` | `string` | Defaults to the tool's bound workspace |
| `enabled` | `boolean` | Default `true` |

Returns `{ success: true, cron }` or `{ error: "…" }`. Validation failures are returned as `error` values, not thrown.

### `updateCron`

Same schema plus a required `id`. `type`, `command`, `prompt` and `modelId` are only applied when explicitly provided; `name`, `schedule`, `workspacePath` and `enabled` are always written. Returns `{ success: true, cron }`, or `{ error: "Cron not found" }`.

### `deleteCron`

`{ id: string }` → `{ success: true }` or `{ error: "Cron not found" }`.

### `listCrons`

No parameters. Returns `{ crons: CronJob[] }`.

---

## `searchContext`

Keyword search over the workspace using `searchWorkspaceContext`, capped at 5 files and 500 matched lines.

| Parameter | Type | Notes |
|---|---|---|
| `query` | `string` | Keywords, function names, file names, or concepts |

Returns `{ results, files }` where `results` is a Markdown digest (`## <path> (score: n)` followed by a fenced snippet, or `(filename match only)`) and `files` is `[{ path, score, lineCount }]`. No matches returns a plain message and an empty `files` array. Errors are returned in `results`, not thrown.

Directories skipped by the search: `node_modules`, `.git`, `.next`, `.claw`, `.openpaw`, `dist`, `build`, `.cache`, `__pycache__`, `.venv`, `venv`, `.turbo`, `coverage`.

The chat handler runs a smaller version of this search automatically (3 files / 200 lines) and injects the result into the system prompt when the user's message looks code-related.

---

## Memory tools

Available only when Minns is configured (see [configuration.md](./configuration.md)); otherwise the calls fail and the tools return the error string in their result. All three degrade gracefully rather than throwing.

### `saveMemory`

| Parameter | Type | Notes |
|---|---|---|
| `text` | `string` | The fact, preference, or context to remember |
| `type` | `string` | Optional category label, e.g. `user_preference` |

Bound to the chat's `sessionId` (or `"default"`). Returns `{ saved: true, text }` or `{ saved: false, error }`.

Note: `type` is accepted by the schema but not currently forwarded — `execute` destructures only `text` and calls `saveUserContext(text, sessionId)`.

### `recallMemory`

| Parameter | Type |
|---|---|
| `query` | `string` |

Runs a claim search and fetches up to 5 memories, returning `{ results }` — a Markdown string with `## Relevant Facts` (claim text plus confidence) and `## Memories` (summary plus takeaway) sections, or `"No relevant memories found."`.

### `listMemories`

| Parameter | Type | Default |
|---|---|---|
| `limit` | `number` | `10` |

Returns `{ memories }` — a Markdown list of `**[<tier>]** <summary>` entries with optional takeaway and causal-note lines, or `"No memories stored yet."`. `tier` defaults to `Episodic`.

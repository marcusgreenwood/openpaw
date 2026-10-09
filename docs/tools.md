# Agent Tools Reference

Every tool the agent can call, with its parameters, return shape, and limits.
Everything here comes from reading `lib/tools/`, `lib/chat/config.ts`,
`lib/python-sandbox.ts`, and the call sites in `lib/chat/handler.ts` and
`lib/bot.ts`.

---

## How tools are wired

`lib/tools/index.ts` exports `allTools(workspacePath, sessionId?)`. It returns
one flat record of tool instances. Workspace-scoped tools are bound to the
resolved workspace path, and the memory tools are bound to `sessionId`
(default `"default"`).

| Entry point | Function | Step limit | Stops early on |
|-------------|----------|------------|----------------|
| Web chat (`/api/chat`) | `streamText` in `lib/chat/handler.ts` | `maxToolSteps` from the request, otherwise `MAX_TOOL_STEPS` | `askChoice` |
| Telegram / WhatsApp webhooks | `generateText` in `handleChatBlocking` | `MAX_TOOL_STEPS` | `askChoice` |
| Chat SDK bot (Slack, Discord, Google Chat) | `streamText` in `lib/bot.ts` | `MAX_TOOL_STEPS` | none |

Every entry point gets the full tool set. No tool is enabled or disabled per channel.

### Limits configurable through the environment

Defined in `lib/chat/config.ts`. Non-numeric values fall back to the default.

| Variable | Default | Applies to |
|----------|---------|------------|
| `CLAW_BASH_TIMEOUT_MS` | `30000` | Default `timeout` for `executeBash` |
| `CLAW_CODE_EXEC_TIMEOUT_MS` | `15000` | Default `timeout` for `executeCode` |
| `CLAW_MAX_TOOL_STEPS` | `15` | Maximum tool-use steps per response |
| `CLAW_CHAT_BLOCKING_TIMEOUT_MS` | `90000` | Hard timeout for the blocking webhook handler |
| `CLAW_WORKSPACE_DIR` | `<cwd>/workspace` | Default workspace when the request doesn't name one |
| `OPENPAW_PYTHON_PATH` | unset | First interpreter tried when the workspace venv is created |

---

## `askChoice`

Shows the user clickable multiple-choice buttons. It has no side effects.

| Parameter | Type | Notes |
|-----------|------|-------|
| `question` | string | Short prompt |
| `options` | string[] | 1–10 entries |

**Returns:** `{ question, options }`, the input unchanged.

The web and webhook handlers stop the tool loop after this call
(`hasToolCall("askChoice")`), so the user's click becomes the next turn.
`components/chat/MessageBubble.tsx` renders the buttons inline. The Chat SDK
bot doesn't stop on this tool, and those platforms only get text.

---

## `executeBash`

Runs `bash -c "cd '<workspace>' && <command>"`.

| Parameter | Type | Default | Notes |
|-----------|------|---------|-------|
| `command` | string | required | |
| `timeout` | number (ms) | `CLAW_BASH_TIMEOUT_MS` | |
| `streaming` | boolean | `false` | Part of the schema, but `execute` ignores it (see caveats) |

**Returns:** `{ stdout, stderr, exitCode, timedOut, durationMs }`. Blocked
commands also include `blocked: true`.

- **Output caps:** `stdout` is trimmed and truncated to 50,000 characters, and
  `stderr` to 10,000.
- **Timeout:** the result has `exitCode: 124` and `timedOut: true`, and stderr is
  prefixed with `Command timed out after <n>ms.`
- **Blocklist:** `BLOCKED_PATTERNS` is checked before anything is spawned.
  `/api/terminal` reuses the same list:
  - `rm -rf /`
  - `sudo rm`
  - `mkfs`
  - `dd if=`
  - `> /dev/sd…`
  - `chmod -R 777 /`

  This is a short regex denylist and not a sandbox. Equivalent commands written
  differently still run.
- **Python venv:** `ensureVenv` creates `<workspace>/.venv` if it's missing.
  `VIRTUAL_ENV` and `PATH` are set so `pip install` goes into it. `TERM=dumb` is
  set too.
- **Output path rewrite:** relative paths in `agent-browser screenshot <path>`
  and `agent-browser pdf <path>` are rewritten to absolute workspace paths,
  because that CLI resolves them from the project root. To add more CLIs, edit
  `OUTPUT_PATH_REWRITE_PATTERNS`.

### Caveats

- **Commands may run twice in the web UI.** While the tool call is in progress
  (`input-streaming` / `input-available`), `MessageBubble` renders
  `LiveTerminal` with `autoRun` for every `executeBash` call, whatever
  `streaming` is set to. `LiveTerminal` POSTs the command to `/api/terminal`,
  which runs it separately from the tool's own execution, so side effects can
  happen twice. Webhook and bot channels aren't affected.
- **Timeouts may not kill child processes.** On timeout the code calls
  `process.kill(-pid)` to kill the whole process group. The process isn't
  spawned with `detached: true`, so it doesn't lead its own group. In that case
  the call throws and the code falls back to `proc.kill("SIGKILL")`, which kills
  only the top-level `bash`.

---

## Filesystem tools

`readFile`, `writeFile`, `listDirectory`, and `createDirectory` all resolve
paths through `safeResolve`. It throws `Path traversal blocked: <path>` when
the resolved path doesn't start with the workspace root.

The check is a plain string-prefix comparison with no trailing separator. That
means a sibling directory sharing the prefix passes: with workspace
`/srv/workspace`, the path `../workspace-other/x` is accepted.

| Tool | Parameters | Returns |
|------|------------|---------|
| `readFile` | `path` | `{ path, content, size }`. `content` is capped at 100,000 characters. `size` is the full length |
| `writeFile` | `path`, `content` | `{ path, written: true, previousContent, bytesWritten }`. Creates parent dirs. `previousContent` is `null` for new files |
| `listDirectory` | `path` (default `"."`) | `{ path, entries: [{ name, type: "file" \| "directory", path }] }`. Not recursive |
| `createDirectory` | `path` | `{ path, created: true }`. Same as `mkdir -p` |

Files are read and written as UTF-8. Errors such as a missing file are thrown,
not returned, and the AI SDK reports them to the model as a tool error.

---

## `executeCode`

Writes the snippet to a temp file (`$TMPDIR/claw-exec-*/script.<ext>`) and runs
it with the workspace as the working directory.

| Parameter | Type | Default | Notes |
|-----------|------|---------|-------|
| `code` | string | required | |
| `language` | `"javascript" \| "typescript" \| "python"` | required | |
| `timeout` | number (ms) | `CLAW_CODE_EXEC_TIMEOUT_MS` | |

| Language | Runner |
|----------|--------|
| `javascript` | `node script.mjs` (ES module) |
| `typescript` | `npx tsx script.ts` |
| `python` | `<workspace>/.venv/bin/python`, or `python3` if the venv can't be created |

**Returns:** `{ stdout, stderr, exitCode, language, timedOut, durationMs }`. The
output caps, timeout exit code `124`, and process-group caveat are the same as
for `executeBash`.

**Caveat:** `execute` returns the `runSpawn` promise from inside `try` without
`await`. The `finally` block that deletes the temp directory therefore starts as
soon as the child is spawned, not after it exits. If the interpreter hasn't
opened the file yet, it can fail with a "file not found" error.

---

## Cron tools

These persist jobs to `.claw/crons.json` through `lib/crons/cron-store.ts`. Jobs
only run when something calls `/api/crons/run` (see the README).

Shared fields:

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Required |
| `schedule` | string | Required, cron expression |
| `type` | `"command" \| "prompt"` | Optional. Inferred as `prompt` when `prompt` is set, otherwise `command` |
| `command` | string | Required when `type` is `command` |
| `prompt` | string | Required when `type` is `prompt`. Each run opens a new chat session |
| `modelId` | string | Model for prompt crons, e.g. `anthropic/claude-sonnet-4-6` |
| `workspacePath` | string | Defaults to the session workspace |
| `enabled` | boolean | Default `true` |

| Tool | Parameters | Returns |
|------|------------|---------|
| `createCron` | shared fields | `{ success: true, cron }` or `{ error }` |
| `updateCron` | `id` + shared fields | `{ success: true, cron }`, `{ error: "Cron not found" }`, or `{ error }` |
| `deleteCron` | `id` | `{ success: true }` or `{ error: "Cron not found" }` |
| `listCrons` | none | `{ crons: [...] }` or `{ error }` |

**`updateCron` behaviour:**

- The update schema extends the create schema without making fields optional,
  so `name` and `schedule` must be sent on every update.
- `enabled` defaults to `true`, so an update that leaves it out re-enables a
  disabled job.
- `workspacePath` falls back to the current session's workspace.

The cron tools catch their own errors and return `{ error }`.

---

## `searchContext`

Searches the workspace for files and lines matching a query. It uses
`searchWorkspaceContext` in `lib/context/search.ts`.

| Parameter | Type |
|-----------|------|
| `query` | string |

**How it works:**

- **Tokenizing:** the query is lowercased. Characters other than `a-z0-9_-`
  become separators, and single-character tokens are dropped.
- **Files searched:** files with code or doc extensions under 100 KB. These
  directories are skipped: `node_modules`, `.git`, `.next`, `.claw`, `.openpaw`,
  `dist`, `build`, `.cache`, `__pycache__`, `.venv`, `venv`, `.turbo`,
  `coverage`.
- **Scoring** is substring matching, not TF-IDF:
  - +10 for each token found in the file name
  - +5 for each token found in the relative path
  - +1 for each matching line
- **Snippets:** each matching line is returned with one line of context on
  either side. Lines are numbered, with at most 30 per file.
- **Limits:** the top 5 files are returned, with 500 snippet lines in total.

**Returns:** `{ results, files: [{ path, score, lineCount }] }`. `results` is a
Markdown string. On no match or on error, `results` holds a message and `files`
is `[]`.

---

## Memory tools

These are backed by Minns (`lib/memory/minns-client.ts`). They're always
registered, even when Minns isn't configured. In that case the client returns
empty results or does nothing.

| Tool | Parameters | Returns |
|------|------------|---------|
| `saveMemory` | `text`, `type` (optional) | `{ saved: true, text }` |
| `recallMemory` | `query` | `{ results }`, a Markdown string |
| `listMemories` | `limit` (default 10) | `{ memories }`, a Markdown string |

### `saveMemory`

It sends `text` as a semantic `user_preference` context event, tagged with a
hash of the session ID. The `type` parameter is accepted but not used. Without
Minns, or if Minns errors, the call does nothing and still returns
`saved: true`.

### `recallMemory`

It combines:

- claim search results for `query`, each with its confidence
- the first 5 episodic memories

The episodic memories don't depend on `query`. With no data, it returns
`"No relevant memories found."`

### `listMemories`

Lists stored memories with tier, takeaway, and causal note. With no data, it
returns `"No memories stored yet."`

Apart from these tools, `lib/chat/handler.ts` recalls memories into the system
prompt before each web response and records a chat event afterwards. Both
happen only when memory is enabled.

---

## Adding a tool

1. Create `lib/tools/<name>.ts` that exports either a `tool({...})` or a factory
   that takes `workspacePath`.
2. Add it to the object returned by `allTools` in `lib/tools/index.ts`.
3. If it needs custom rendering, add a branch on `toolName` in
   `components/chat/MessageBubble.tsx`.
4. Mention it in `lib/system-prompt.md` if the model needs guidance on when to
   use it.

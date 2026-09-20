# OpenPaw REST API Reference

Every route below lives under `app/api/` and is served by the Next.js App Router.
Unless noted otherwise, routes export `runtime = "nodejs"`, accept and return
`application/json`, and are unauthenticated — OpenPaw is designed to run as a
local or single-tenant app, so **do not expose it to the public internet without
putting your own auth in front of it**.

Two routes stream instead of returning JSON:

- `POST /api/chat` returns an AI SDK **UI message stream**.
- `POST /api/terminal` and `POST /api/workflows/run` return **Server-Sent Events**.

**Contents**

- [Chat](#chat)
- [Config & Providers](#config--providers)
- [Crons](#crons)
- [Workflows](#workflows)
- [Skills](#skills)
- [Memory](#memory)
- [Sessions & Sharing](#sessions--sharing)
- [Workspace & Files](#workspace--files)
- [Context](#context)
- [Git](#git)
- [Terminal](#terminal)
- [Notifications](#notifications)
- [Channels & Webhooks](#channels--webhooks)

---

## Chat

### `POST /api/chat`

Main streaming chat endpoint. Builds the system prompt (skills + optional memory
recall + optional auto-injected workspace context), assembles the tool set for the
workspace, and streams the model response back.

`runtime: "nodejs"`, `maxDuration: 120`.

**Request body**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `messages` | `UIMessage[]` | `[]` | Conversation history in AI SDK UI-message format. Non-arrays are coerced to `[]`. |
| `modelId` | `string` | `"anthropic/claude-sonnet-4-5"` | Provider-prefixed model id, e.g. `anthropic/claude-sonnet-4-6`. |
| `workspacePath` | `string` | `DEFAULT_WORKSPACE` | Absolute or project-relative workspace directory. Created if missing. |
| `sessionId` | `string` | — | Used for usage accounting and memory correlation. |
| `maxToolSteps` | `number` | `MAX_TOOL_STEPS` | Upper bound on agentic tool-use steps. |

**Response** — an AI SDK UI message stream (`toUIMessageStreamResponse()`), not
plain JSON. Consume it with `useChat` from `@ai-sdk/react`.

**Side effects**

- Creates the workspace directory if it does not exist.
- Records token usage via `recordUsage` (see `.openpaw/usage.json`).
- When Minns memory is configured, recalls memories before the call and records a
  chat event after it.

**Notes**

- Generation stops at `stepCountIs(maxToolSteps)` or as soon as the model calls
  `askChoice` (the UI needs a user decision at that point).
- If `workspacePath` resolves to the project root it is rewritten to
  `<projectRoot>/workspace` as a safety measure.

---

### `POST /api/chat/compare`

Runs the same conversation against 2–3 models in parallel and returns their
completions side by side. Non-streaming; each model is raced against a 30 s
timeout, and the whole route has `maxDuration: 60`.

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messages` | `UIMessage[]` | yes | Conversation history. |
| `modelIds` | `string[]` | yes | Must contain 2 or 3 model ids. |
| `workspacePath` | `string` | no | Workspace used to build the system prompt. |
| `sessionId` | `string` | no | Accepted but not currently used for accounting. |

**Response `200`** — an array, one entry per requested model:

```json
[
  {
    "modelId": "anthropic/claude-sonnet-4-6",
    "text": "…",
    "usage": { "inputTokens": 812, "outputTokens": 240 },
    "durationMs": 3120
  },
  {
    "modelId": "openai/gpt-5.2",
    "text": "",
    "usage": { "inputTokens": 0, "outputTokens": 0 },
    "durationMs": 30001,
    "error": "Timeout after 30000ms"
  }
]
```

A per-model failure is reported in that entry's `error` field — the request as a
whole still returns `200`.

**Errors**

| Status | Body | Cause |
|--------|------|-------|
| `400` | `{ "error": "modelIds must contain 2 or 3 model IDs" }` | Wrong `modelIds` length or type. |

**Notes** — compare mode uses `generateText` without tools, so models answer from
the system prompt and conversation only.

---

## Config & Providers

### `GET /api/config`

Returns the server's default workspace directory, used by the UI to pre-fill the
workspace setting.

```json
{ "defaultWorkspace": "/Users/you/projects/openpaw/workspace" }
```

---

### `GET /api/providers`

Reports which AI providers have an API key configured. Keys are never returned in
full — only a masked form.

**Response `200`**

```json
{
  "providers": {
    "anthropic": { "configured": true,  "source": "env",    "masked": "sk-a…9f2c" },
    "openai":    { "configured": true,  "source": "stored", "masked": "sk-p…41ab" },
    "google":    { "configured": false, "source": "none",   "masked": "" },
    "moonshotai":{ "configured": false, "source": "none",   "masked": "" }
  },
  "configuredProviders": ["anthropic", "openai"]
}
```

`source` is `"env"` when the key comes from an environment variable (which takes
precedence), `"stored"` when it comes from `.claw/api-keys.json`, else `"none"`.
The provider list is derived from `PROVIDER_REGISTRY`.

---

### `POST /api/providers`

Saves provider API keys to `.claw/api-keys.json` and invalidates the in-process
key cache.

**Request body** — an object keyed by provider name:

```json
{ "anthropic": "sk-ant-…", "openai": "" }
```

- A non-empty string sets the key.
- An explicit empty string **removes** the stored key.
- An omitted or non-string value leaves the stored key untouched.
- Unknown provider keys are ignored.

**Response `200`** — `{ "success": true }`.

---

## Crons

Cron jobs are stored server-side in `.claw/crons.json`.

### `GET /api/crons`

Lists all scheduled tasks.

```json
{ "jobs": [ { "id": "…", "name": "Nightly backup", "schedule": "0 3 * * *", "type": "command", "enabled": true } ] }
```

---

### `POST /api/crons`

Creates a cron, or updates one when `id` is present in the body.

**Request body**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Present → update that cron; absent → create a new one. |
| `name` | `string` | Required on create. |
| `schedule` | `string` | Required on create. Standard cron expression. |
| `type` | `"command" \| "prompt"` | Defaults to `"prompt"` when `prompt` is set, else `"command"`. |
| `command` | `string` | Required when `type` is `"command"`. |
| `prompt` | `string` | Required when `type` is `"prompt"`. |
| `modelId` | `string` | Model used for prompt crons. |
| `workspacePath` | `string` | Working directory for the job. |
| `enabled` | `boolean` | Defaults to `true` on create. |

**Response `200`** — the created or updated cron job object.

**Errors**

| Status | Body |
|--------|------|
| `400` | `{ "error": "name and schedule are required" }` |
| `400` | `{ "error": "command is required for type 'command'" }` |
| `400` | `{ "error": "prompt is required for type 'prompt'" }` |
| `404` | `{ "error": "Cron not found" }` (update path only) |

---

### `DELETE /api/crons?id=<id>`

Deletes a cron by id. Returns `{ "success": true }`, or `400`
`{ "error": "id is required" }` / `404` `{ "error": "Cron not found" }`.

---

### `GET /api/crons/run`

Runs every cron that is currently due. Intended for Vercel Cron or a system
crontab entry (`* * * * * curl https://your-app/api/crons/run`).

```json
{ "ran": 2, "results": [ … ] }
```

---

### `POST /api/crons/run`

Runs due crons, or one specific cron.

**Request body** (all optional; a missing or malformed body is treated as `{}`)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Run only this cron, regardless of schedule. |
| `workspacePath` | `string` | Override the working directory for this run. |

**Response `200`** — `{ "ran": <count>, "results": [ … ] }`. With `id`, `ran` is
always `1`. Returns `404` `{ "error": "Cron not found" }` if the id is unknown.

---

### `GET /api/cron-sessions`

Lists chat sessions created by prompt crons (stored in
`.claw/cron-sessions.json`).

```json
{ "sessions": [ { "session": { "id": "…", "title": "…" }, "messages": [ … ] } ] }
```

---

### `DELETE /api/cron-sessions?sessionId=<id>`

Removes one cron session. Returns `{ "deleted": true | false }`, or `400`
`{ "error": "Missing sessionId" }`.

---

## Workflows

Workflows are stored server-side in `.claw/workflows.json`.

### `GET /api/workflows`

Lists all saved workflows: `{ "workflows": [ … ] }`.

---

### `POST /api/workflows`

Creates a workflow.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `name` | `string` | yes | — |
| `steps` | `WorkflowStep[]` | yes (non-empty) | — |
| `description` | `string` | no | `""` |
| `icon` | `string` | no | `"⚡"` |

Returns the created `Workflow`, or `400`
`{ "error": "name and steps are required" }`.

---

### `PUT /api/workflows`

Updates a workflow. Body must include `id`; `name`, `description`, `icon`, and
`steps` are all optional. Returns the updated workflow, `400`
`{ "error": "id is required" }`, or `404` `{ "error": "Workflow not found" }`.

---

### `DELETE /api/workflows?id=<id>`

Deletes a workflow. Returns `{ "success": true }`, `400`
`{ "error": "id is required" }`, or `404` `{ "error": "Workflow not found" }`.

---

### `POST /api/workflows/run`

Executes a list of steps sequentially and streams progress over SSE.

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `steps` | `WorkflowStep[]` | yes (non-empty) | Steps to execute. |
| `workflowId` | `string` | no | Echoed for the caller's bookkeeping. |
| `workspacePath` | `string` | no | Working directory; defaults to `process.cwd()`. |

**Response** — `text/event-stream` with three named events:

| Event | Payload |
|-------|---------|
| `step-start` | `{ stepId, stepIndex, name, type }` |
| `step-complete` | `WorkflowStepResult` — `{ stepId, status, output?, error?, durationMs }` |
| `run-complete` | `{ "status": "completed" \| "failed" }` |

**Step semantics**

- `command` — runs via `exec` in `workspacePath`; `{{previousOutput}}` in the
  command is substituted with the previous step's output. Non-zero exit sets
  `status: "failure"` and `error: "Exit code: <n>"`. Per-step `timeout` defaults
  to 60 000 ms.
- `prompt` — does **not** call a model server-side. It substitutes
  `{{previousOutput}}` and emits the resolved prompt as output for the client to
  forward into a chat session.
- `condition` — evaluates the step's `condition` expression with `output` bound
  to the previous step's output, then jumps to the step id in `onTrue`/`onFalse`.
  An unknown or missing target falls through to the next step.

A failing step aborts the run (emitting `run-complete` with `status: "failed"`)
unless that step sets `continueOnError: true`.

**Errors** — `400` `{ "error": "steps are required" }` (returned as JSON, before
the stream opens).

---

## Skills

### `GET /api/skills?workspace=<path>`

Lists all loaded skills — built-in ones from `skills/` plus any installed under
`<workspace>/user-skills/`.

| Query param | Required | Description |
|-------------|----------|-------------|
| `workspace` | no | Workspace to load user skills from. |

Returns `{ "skills": [ { "name": "…", "description": "…", "source": "built-in" \| "user", "filePath": "…", "body": "…" } ] }`.

---

### `POST /api/skills`

Installs a skill via the `skills` CLI.

**Request body** — `{ "skillName": "owner/repo" }`.

Returns the installer result object, or `400`
`{ "error": "skillName is required" }`.

---

### `GET /api/skills/<name>?workspace=<path>`

Returns a single skill plus the raw markdown of its source file. `rawContent` is
`""` if the file cannot be read.

```json
{ "skill": { "name": "coding", "source": "built-in", "filePath": "…" }, "rawContent": "---\nname: coding\n---\n…" }
```

`404` `{ "error": "Skill not found" }` if no skill matches `name`.

---

### `PUT /api/skills/<name>?workspace=<path>`

Overwrites a skill's markdown file and invalidates the skills cache.

**Request body** — `{ "content": "<full markdown>" }`.

| Status | Body |
|--------|------|
| `200` | `{ "success": true }` |
| `403` | `{ "error": "Cannot edit built-in skills" }` |
| `404` | `{ "error": "Skill not found" }` |
| `500` | `{ "error": "Failed to save: …" }` |

---

### `DELETE /api/skills/<name>`

Recursively removes the skill's directory and invalidates the cache. Same status
codes as `PUT`, with `{ "error": "Cannot delete built-in skills" }` for `403` and
`{ "error": "Failed to delete: …" }` for `500`.

Note: unlike `GET`/`PUT`, this handler does not read a `workspace` query param —
it resolves skills from the default workspace.

---

### `GET /api/skills/search?q=<query>`

Searches the skills ecosystem. Shells out to `npx skills find <query>` (15 s
timeout) and parses its output; if the CLI produces nothing usable, it falls back
to filtering a built-in featured list by name, description, owner, repo, or tag.
Results are cached in-process for 60 s per query.

With no `q`, returns the full featured list.

```json
{
  "results": [
    {
      "name": "agent-browser",
      "owner": "nicepkg",
      "repo": "agent-skills",
      "description": "Browser automation: navigate, fill forms, click, screenshot, scrape data",
      "tags": ["browser", "automation", "scraping"]
    }
  ]
}
```

---

## Memory

Long-term memory is provided by [Minns](https://minns.ai) and is optional — when
it is not configured, these endpoints report `enabled: false` rather than failing.

### `GET /api/memory`

Lists recent memories, or searches memory claims when `q` is supplied.

| Query param | Default | Description |
|-------------|---------|-------------|
| `q` | — | When present, searches claims instead of listing memories. |
| `limit` | `10` | Page size for the memory listing (page 1). |

**Response when memory is disabled**

```json
{ "enabled": false, "memories": [], "stats": null }
```

**Response with `q`** — `{ "enabled": true, "claims": [ … ] }`.

**Response without `q`** — `{ "enabled": true, "memories": [ … ], "stats": { … } }`.
`stats` is `null` if the stats call fails.

---

### `GET /api/memory/config`

Reports the Minns configuration state without exposing the key.

```json
{
  "enabled": true,
  "source": "env",
  "hasApiKey": true,
  "maskedKey": "****9f2c",
  "projectId": "proj_123"
}
```

`source` is `"env"` (`MINNS_API_KEY`), `"stored"` (`.claw/minns-config.json`), or
`"none"`. Environment variables take precedence over stored values.

---

### `POST /api/memory/config`

Writes `{ apiKey, projectId }` to `.claw/minns-config.json`, creating `.claw/` if
needed.

**Request body** — `{ "apiKey": "…", "projectId": "…" }` (`projectId` optional,
stored as `""` when omitted).

Returns `{ "success": true }`, or `400` `{ "error": "API key is required" }`.

---

### `DELETE /api/memory/config`

Deletes `.claw/minns-config.json`. Always returns `{ "success": true }`, even if
the file was already absent.

---

## Sessions & Sharing

### `GET /api/sessions/<id>/usage`

Returns the aggregated token usage and cost for a session, read from
`.openpaw/usage.json`.

```json
{
  "totalPromptTokens": 18240,
  "totalCompletionTokens": 5120,
  "totalCostUsd": 0.0912,
  "requestCount": 7
}
```

`400` `{ "error": "Missing session id" }` when the path segment is empty. Unknown
session ids return zeroed totals rather than a 404.

---

### `POST /api/sessions/share`

Publishes a snapshot of a session to `.claw/shared-sessions/<sessionId>.json` so
it can be viewed at `/shared/<sessionId>`. Re-posting the same `sessionId`
overwrites the messages and refreshes `updatedAt` while preserving the original
`sharedAt` and the current presence list.

**Request body** — `{ "sessionId": "…", "messages": [ … ] }`.

**Response `200`** — `{ "shareUrl": "/shared/<sessionId>", "sessionId": "…" }`.

**Errors** — `400` `{ "error": "sessionId and messages[] are required" }`,
`500` `{ "error": "Failed to share session" }`.

The session id is sanitised to `[A-Za-z0-9_-]` before it is used as a filename.

---

### `GET /api/sessions/share?id=<id>`

Reads a shared session, optionally registering the caller as a live viewer.

| Query param | Description |
|-------------|-------------|
| `id` | Required. Shared session id. |
| `presence` | `"true"` to record presence (requires `viewerId`). |
| `viewerId` | Opaque per-viewer id used for the presence list. |

**Response `200`**

```json
{
  "sessionId": "…",
  "messages": [ … ],
  "sharedAt": 1740000000000,
  "updatedAt": 1740000600000,
  "viewerCount": 2
}
```

Presence entries expire after 30 s without a refresh; `viewerCount` counts only
entries seen within that window. Passing `presence=true` writes the updated
presence list back to disk.

**Errors** — `400` `{ "error": "id query param is required" }`, `404`
`{ "error": "Session not found" }`.

---

## Workspace & Files

### `GET /api/workspace?path=<absolute path>`

Validates a directory and lists its immediate entries. Used by the workspace
picker in Settings.

| Query param | Default | Description |
|-------------|---------|-------------|
| `path` | `DEFAULT_WORKSPACE` | Must be an **absolute** path. |

**Response `200`**

```json
{
  "path": "/Users/you/projects/openpaw/workspace",
  "valid": true,
  "entries": [
    { "name": "public", "type": "directory" },
    { "name": "notes.md", "type": "file" }
  ]
}
```

Dotfiles are filtered out; directories sort before files, then alphabetically.

**Errors**

| Status | Body |
|--------|------|
| `400` | `{ "error": "Path must be absolute" }` |
| `400` | `{ "error": "Path is not a directory" }` |
| `404` | `{ "error": "Directory not found or not accessible" }` |

---

### `GET /api/files/<...path>?workspace=<path>`

Serves a file from `<workspace>/public/`. This is how agent-produced artefacts
(screenshots, PDFs, exports) become viewable in chat: a tool writes
`public/shot.png` inside the workspace and the UI links `/api/files/shot.png`.

| Query param | Default | Description |
|-------------|---------|-------------|
| `workspace` | `DEFAULT_WORKSPACE` | Workspace whose `public/` directory is served. |

**Response `200`** — the raw file bytes with `Cache-Control: public, max-age=3600`
and a `Content-Type` looked up from the extension (`.png`, `.jpg`, `.jpeg`,
`.gif`, `.webp`, `.svg`, `.pdf`, `.json`, `.txt`, `.html`, `.css`, `.js`),
falling back to `application/octet-stream`.

**Errors**

| Status | Body | Cause |
|--------|------|-------|
| `403` | `{ "error": "Forbidden" }` | Resolved path escapes `<workspace>/public` (path traversal). |
| `400` | `{ "error": "Not a file" }` | Target is a directory. |
| `404` | `{ "error": "Not found" }` | No such file. |

This route does not set `runtime`, so it uses the App Router default.

---

## Context

### `GET /api/context?q=<query>&workspace=<path>`

Keyword-searches the workspace and returns the most relevant files with matching
lines. Backed by `searchWorkspaceContext` (see `lib/context/search.ts`) — the same
search the chat handler uses to auto-inject workspace context.

| Query param | Required | Default | Description |
|-------------|----------|---------|-------------|
| `q` | yes | — | Search query; tokenised on non-alphanumerics. |
| `workspace` | no | `DEFAULT_WORKSPACE` | Directory to search. |

**Response `200`**

```json
{
  "files": [
    {
      "path": "lib/chat/handler.ts",
      "relevantLines": ["41: export async function buildContext(", "…"],
      "score": 26
    }
  ]
}
```

`path` is relative to the searched workspace. Results are capped at 5 files, 30
lines per file, and 500 lines total.

**Errors** — `400` `{ "error": "q query param is required" }`, `500`
`{ "error": "Search failed" }`.

---

## Git

### `GET /api/git?workspace=<path>`

Reports the git status of a directory by shelling out to `git branch
--show-current` and `git status --porcelain` (5 s timeout each). Drives the
GitStatus indicator in the header.

| Query param | Default |
|-------------|---------|
| `workspace` | `process.cwd()` |

**Response — not a repository (or git failed)**

```json
{ "isRepo": false }
```

**Response — repository**

```json
{
  "isRepo": true,
  "branch": "main",
  "status": "dirty",
  "modified": ["lib/utils.ts"],
  "staged": ["docs/API.md"],
  "untracked": ["scratch.txt"]
}
```

`status` is `"clean"` when porcelain output is empty, else `"dirty"`. A file with
both index and worktree changes appears in **both** `staged` and `modified`.
Detached HEAD yields an empty branch name and is therefore reported as
`isRepo: false`.

---

## Terminal

### `POST /api/terminal`

Runs a bash command in the workspace and streams stdout/stderr over SSE. Powers
the LiveTerminal component that renders output while an `executeBash` tool call is
still in flight.

`runtime: "nodejs"`, `maxDuration: 120`, hard command timeout 60 s.

**Request body**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `command` | `string` | yes | — |
| `workspacePath` | `string` | no | `DEFAULT_WORKSPACE` |

**Response** — `text/event-stream` (`Cache-Control: no-cache, no-transform`,
`X-Accel-Buffering: no`). Each SSE `data:` line is one JSON object:

```
data: {"type":"stdout","text":"hello\n"}
data: {"type":"stderr","text":"warning: …"}
data: {"type":"exit","code":0,"duration":142}
```

| `type` | Fields |
|--------|--------|
| `stdout` / `stderr` | `text` |
| `exit` | `code`, `duration` (ms) |

**Exit codes of note** — `124` on the 60 s timeout, `1` on spawn error.

**Errors** (JSON, before the stream opens)

| Status | Body |
|--------|------|
| `400` | `{ "error": "command is required" }` |
| `403` | `{ "error": "Command matches dangerous pattern" }` |

**Notes**

- Commands are screened against `BLOCKED_PATTERNS` from `lib/tools/bash.ts`, the
  same blocklist the `executeBash` tool uses.
- The Python virtualenv for the workspace is ensured and activated, and `TERM` is
  forced to `dumb` to suppress ANSI control sequences.
- Aborting the HTTP request sends `SIGINT` to the process group, then `SIGKILL`
  after 3 s.

---

## Notifications

Notifications are held in a **module-level in-memory array**, capped at 100
entries. They do not survive a server restart and are not shared across serverless
instances. The browser keeps its own copy in the Zustand notifications store.

### `GET /api/notifications?since=<timestamp>`

Returns up to 50 notifications, newest first.

| Query param | Description |
|-------------|-------------|
| `since` | Epoch ms; only notifications with `timestamp > since` are returned. |

```json
{
  "notifications": [
    {
      "id": "m4k2…",
      "type": "cron_success",
      "title": "Nightly backup finished",
      "message": "Exit code 0",
      "timestamp": 1740000000000,
      "read": false,
      "cronJobName": "Nightly backup",
      "sessionId": "abc123"
    }
  ]
}
```

---

### `POST /api/notifications`

Pushes a notification to the front of the list.

| Field | Type | Default |
|-------|------|---------|
| `type` | `"cron_success" \| "cron_failure" \| "info"` | `"info"` |
| `title` | `string` | `"Notification"` |
| `message` | `string` | `""` |
| `id` | `string` | generated |
| `timestamp` | `number` | `Date.now()` |
| `cronJobName` | `string` | — |
| `sessionId` | `string` | — |

Returns `{ "ok": true, "notification": { … } }` (always stored with
`read: false`), or `400` `{ "error": "Invalid request body" }` for unparseable
JSON.

---

### `DELETE /api/notifications`

Clears every stored notification. Returns `{ "ok": true }`.

---

## Channels & Webhooks

### `GET /api/channels`

Returns per-channel enablement, the webhook URL to register (derived from the
request origin), active session counts, field-level config status, and the
server's timeout configuration.

```json
{
  "channels": {
    "slack":    { "enabled": true,  "webhookUrl": "https://host/api/webhooks/slack",    "activeSessions": 0, "fields": { … } },
    "discord":  { "enabled": false, "webhookUrl": "https://host/api/webhooks/discord",  "activeSessions": 0, "fields": { … } },
    "gchat":    { "enabled": false, "webhookUrl": "https://host/api/webhooks/gchat",    "activeSessions": 0, "fields": { … } },
    "telegram": { "enabled": true,  "webhookUrl": "https://host/api/webhooks/telegram", "activeSessions": 3, "fields": { … } },
    "whatsapp": { "enabled": false, "webhookUrl": "https://host/api/webhooks/whatsapp", "activeSessions": 0, "fields": { … } }
  },
  "timeouts": {
    "chatBlocking": 90000,
    "bashCommand": 30000,
    "codeExecution": 15000,
    "maxToolSteps": 15
  },
  "totalActiveSessions": 3
}
```

`activeSessions` is always `0` for the Chat SDK platforms (Slack, Discord, Google
Chat) because their conversation state lives in the Chat SDK state adapter rather
than OpenPaw's session store.

---

### `POST /api/channels`

Saves credentials for one channel to `.claw/channels.json` and invalidates the
config cache.

**Request body** — `{ "channel": "telegram", "config": { "token": "…", "secret": "…" } }`.

`channel` must be one of `telegram`, `slack`, `whatsapp`, `discord`, `gchat`.

Returns `{ "success": true }`, or `400` `{ "error": "Invalid channel" }`.

---

### `DELETE /api/channels`

Clears stored credentials for one channel. Takes a JSON **body**
`{ "channel": "telegram" }` (not a query param). Same responses as `POST`.

---

### `POST /api/webhooks/<platform>`

Dynamic webhook route for all Chat SDK-managed platforms (Slack, Discord, Teams,
Google Chat, GitHub, Linear — whichever adapters are configured in `lib/bot`).
The request is handed to the matching adapter handler with a `waitUntil` backed by
`next/server`'s `after`.

`runtime: "nodejs"`, `maxDuration: 120`.

Returns `404` with the plain-text body `Unknown platform: <platform>` when no
adapter is registered.

Next.js static routes take precedence, so `/api/webhooks/telegram` and
`/api/webhooks/whatsapp` are handled by their own custom routes below, not here.

---

### `GET /api/webhooks/<platform>`

Health check for an adapter.

- `200` — `{ "status": "active", "platform": "slack" }`
- `404` — `{ "status": "not_configured", "platform": "slack" }`

---

### `POST /api/webhooks/telegram`

Receives Telegram Bot API updates, runs them through `handleChatBlocking`, and
replies via `sendMessage`.

`runtime: "nodejs"`, `maxDuration: 120`.

**Verification** — the `x-telegram-bot-api-secret-token` header is checked against
the configured secret.

**Behaviour**

- Non-text updates are acknowledged with `{ "ok": true }` and ignored.
- `/start` replies with a greeting; `/clear` wipes the caller's session.
- A typing indicator is sent while the model works.
- Replies are formatted as MarkdownV2 and split into Telegram-sized chunks, with a
  plain-text retry if MarkdownV2 is rejected.
- Timeouts produce a user-facing message referencing
  `CHAT_BLOCKING_TIMEOUT_MS`; other failures produce a generic error message.

**Responses** — `{ "ok": true }` for handled updates (including errors, which are
reported in-chat), `401` `{ "error": "Invalid secret" }`, `503`
`{ "error": "Telegram not configured" }`.

Register the webhook with:

```bash
curl https://api.telegram.org/bot<TOKEN>/setWebhook \
  -d url=https://<YOUR_DOMAIN>/api/webhooks/telegram \
  -d secret_token=<WEBHOOK_SECRET>
```

---

### `GET /api/webhooks/whatsapp`

Meta webhook verification handshake. When `hub.mode=subscribe` and
`hub.verify_token` matches the configured secret, the raw `hub.challenge` value is
echoed with `200`. Otherwise `403` `{ "error": "Verification failed" }`.

---

### `POST /api/webhooks/whatsapp`

Receives WhatsApp Cloud API messages, runs them through `handleChatBlocking`, and
replies via the Graph API (`v21.0`).

`runtime: "nodejs"`, `maxDuration: 120`.

**Behaviour**

- Payloads without `entry[0].changes[0].value.messages` (status updates and the
  like) are acknowledged and ignored.
- Non-text messages get a "text only" reply.
- Incoming messages are marked as read.
- `clear` or `/clear` wipes the caller's session.
- Replies are formatted for WhatsApp and split into chunks.

**Responses** — `{ "ok": true }` for handled updates, `503`
`{ "error": "WhatsApp not configured" }`.

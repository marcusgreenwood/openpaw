# API Reference

Every HTTP endpoint OpenPaw exposes, derived from the 26 route handlers under `app/api/**/route.ts`.

All routes are Next.js App Router route handlers. Unless noted, they run on the Node.js runtime (`export const runtime = "nodejs"`) and return JSON.

## Endpoint summary

| Method(s) | Path | Purpose |
|---|---|---|
| `POST` | `/api/chat` | Streaming agent chat (SSE UI message stream) |
| `POST` | `/api/chat/compare` | Run one prompt against 2–3 models in parallel |
| `GET` | `/api/config` | Default workspace path |
| `GET` | `/api/context` | Keyword search over workspace files |
| `GET` `POST` `DELETE` | `/api/channels` | Channel status, credentials, webhook URLs |
| `GET` `DELETE` | `/api/cron-sessions` | Chat sessions created by prompt crons |
| `GET` `POST` `DELETE` | `/api/crons` | Scheduled-task CRUD |
| `GET` `POST` | `/api/crons/run` | Execute due crons (or one by id) |
| `GET` | `/api/files/[...path]` | Serve files from `<workspace>/public/` |
| `GET` | `/api/git` | Git branch and working-tree status |
| `GET` | `/api/memory` | List/search long-term memories (Minns) |
| `GET` `POST` `DELETE` | `/api/memory/config` | Minns API key and project id |
| `GET` `POST` `DELETE` | `/api/notifications` | In-process notification feed |
| `GET` `POST` | `/api/providers` | LLM provider key status and storage |
| `GET` | `/api/sessions/[id]/usage` | Token/cost summary for one session |
| `GET` `POST` | `/api/sessions/share` | Publish and read a shared session |
| `GET` `POST` | `/api/skills` | List skills; install a skill |
| `GET` `PUT` `DELETE` | `/api/skills/[name]` | Read, edit, remove one skill |
| `GET` | `/api/skills/search` | Search the skills ecosystem |
| `POST` | `/api/terminal` | Run a shell command, streaming output (SSE) |
| `GET` `POST` | `/api/webhooks/[platform]` | Chat SDK webhook dispatch (Slack, Discord, …) |
| `POST` | `/api/webhooks/telegram` | Telegram Bot API webhook |
| `GET` `POST` | `/api/webhooks/whatsapp` | WhatsApp Cloud API verification + messages |
| `GET` `POST` `PUT` `DELETE` | `/api/workflows` | Server-side workflow CRUD |
| `POST` | `/api/workflows/run` | Execute workflow steps, streaming (SSE) |
| `GET` | `/api/workspace` | Validate a directory and list its entries |

---

## Chat

### `POST /api/chat`

Primary agent endpoint. Streams an AI SDK UI message stream (tool calls, tool results, text deltas) back to the browser. `maxDuration = 120`.

Request body:

| Field | Type | Default | Notes |
|---|---|---|---|
| `messages` | `UIMessage[]` | `[]` | Non-array values are coerced to `[]` |
| `modelId` | `string` | `"anthropic/claude-sonnet-4-5"` [^default-model] | `provider/model` form |
| `workspacePath` | `string` | `DEFAULT_WORKSPACE` | Absolute or project-relative |
| `sessionId` | `string` | — | Used for usage accounting and memory recording |
| `maxToolSteps` | `number` | `MAX_TOOL_STEPS` (15) | Overrides the per-request agentic step cap |

Response: the result of `streamText(...).toUIMessageStreamResponse()`. The handler stops when either the step cap is reached or the `askChoice` tool is called (`stopWhen: [stepCountIs(steps), hasToolCall("askChoice")]`).

The route itself performs no validation and returns no error statuses — malformed input surfaces as a thrown error from `handleChatStreaming`. See [architecture.md](./architecture.md) for what `handleChatStreaming` does.

[^default-model]: This fallback is `anthropic/claude-sonnet-4-5`, which is **not** the value of `DEFAULT_MODEL_ID` (`anthropic/claude-sonnet-4-6`) and is not present in `PROVIDER_REGISTRY` at all. The browser never reaches it — it always sends the session's `modelId`, seeded from `DEFAULT_MODEL_ID` — but the Telegram and WhatsApp webhooks do reach the same `-4-5` default via `getOrCreateSession`. `resolveModel` forwards any model name verbatim to the provider without consulting the registry. See [configuration.md](./configuration.md#default-model-two-values-in-the-source).

### `POST /api/chat/compare`

Runs the same conversation against several models concurrently using `generateText` (no tools, no streaming). `maxDuration = 60`; each model is raced against a 30 s timeout.

Request body: `{ messages: UIMessage[], modelIds: string[], workspacePath?: string, sessionId?: string }`.

`modelIds` must contain **2 or 3** entries, otherwise `400 { "error": "modelIds must contain 2 or 3 model IDs" }`.

Response `200`: an array (not an object) of

```json
[
  {
    "modelId": "anthropic/claude-sonnet-4-6",
    "text": "…",
    "usage": { "inputTokens": 0, "outputTokens": 0 },
    "durationMs": 1234,
    "error": "Timeout after 30000ms"
  }
]
```

`error` is present only for models that failed; `text` is `"(no response)"` when the model returned empty text.

---

## Config

### `GET /api/config`

Returns `{ "defaultWorkspace": "<absolute path>" }` — the value of `DEFAULT_WORKSPACE` from `lib/chat/config.ts`.

---

## Context

### `GET /api/context`

Keyword search over workspace files via `searchWorkspaceContext`.

| Query param | Required | Notes |
|---|---|---|
| `q` | yes | `400 { "error": "q query param is required" }` if missing |
| `workspace` | no | Defaults to `DEFAULT_WORKSPACE`; if it resolves to the project root it is redirected to `<root>/workspace` |

Response `200`: `{ "files": [{ "path": "relative/path.ts", "relevantLines": ["…"], "score": 12 }] }`.
Response `500`: `{ "error": "Search failed" }`.

---

## Channels

### `GET /api/channels`

Returns per-channel status, the webhook URL derived from the request origin, active session counts, and field-level credential sources.

```json
{
  "channels": {
    "slack":    { "enabled": false, "webhookUrl": "https://host/api/webhooks/slack",    "activeSessions": 0, "fields": { "token": {…}, "secret": {…} } },
    "discord":  { "enabled": false, "webhookUrl": "https://host/api/webhooks/discord",  "activeSessions": 0, "fields": { … } },
    "gchat":    { "enabled": false, "webhookUrl": "https://host/api/webhooks/gchat",    "activeSessions": 0, "fields": { … } },
    "telegram": { "enabled": false, "webhookUrl": "https://host/api/webhooks/telegram", "activeSessions": 0, "fields": { … } },
    "whatsapp": { "enabled": false, "webhookUrl": "https://host/api/webhooks/whatsapp", "activeSessions": 0, "fields": { "token": {…}, "secret": {…}, "phoneNumberId": {…} } }
  },
  "timeouts": { "chatBlocking": 90000, "bashCommand": 30000, "codeExecution": 15000, "maxToolSteps": 15 },
  "totalActiveSessions": 0
}
```

Each `fields.<name>` is `{ "set": boolean, "source": "env" | "stored" | "none", "masked": string }`.

`activeSessions` is always `0` for the three Chat SDK platforms (Slack, Discord, Google Chat) — their session state lives in the Chat SDK state adapter, not in `lib/chat/session-store.ts`.

### `POST /api/channels`

Body `{ "channel": "telegram" | "slack" | "whatsapp" | "discord" | "gchat", "config": { … } }`. Writes `config` verbatim under that channel key in `.claw/channels.json` and invalidates the cache. Unknown channel → `400 { "error": "Invalid channel" }`. Success → `{ "success": true }`.

### `DELETE /api/channels`

Body `{ "channel": "…" }` (a JSON body, not a query param). Removes that channel's stored credentials. Same validation and response as `POST`.

---

## Crons

### `GET /api/crons`

`{ "jobs": CronJob[] }`. Legacy jobs with no `type` are migrated to `"command"` on read.

`CronJob` (`lib/crons/cron-store.ts`):

```ts
{
  id: string;            // "cron_<base36>_<rand>"
  name: string;
  schedule: string;      // cron expression
  type: "command" | "prompt";
  command?: string;
  prompt?: string;
  workspacePath?: string;
  modelId?: string;
  enabled: boolean;
  lastRunAt?: number;
  createdAt: number;
  updatedAt: number;
}
```

### `POST /api/crons`

Creates when `id` is absent, updates when `id` is present.

**Update** (`id` present): applies `name`, `schedule`, `type`, `command`, `prompt`, `modelId`, `workspacePath`, `enabled`. Returns the updated `CronJob`, or `404 { "error": "Cron not found" }`.

**Create**: `name` and `schedule` are required (`400 { "error": "name and schedule are required" }`). `type` defaults to `"prompt"` when `prompt` is set, otherwise `"command"`. A `command` job without `command`, or a `prompt` job without `prompt`, is a `400`. `enabled` defaults to `true`. Returns the new `CronJob`.

### `DELETE /api/crons?id=<id>`

`400` without `id`, `404` if unknown, otherwise `{ "success": true }`.

### `GET /api/crons/run`

Runs every due cron. Intended for Vercel Cron (`vercel.json` schedules `/api/crons/run` every minute) or a system crontab. Returns `{ "ran": number, "results": CronRunResult[] }`.

### `POST /api/crons/run`

Optional body `{ "id"?: string, "workspacePath"?: string }`; a missing or unparseable body is treated as `{}`. With `id`, runs that one job (`404` if unknown) and returns `{ "ran": 1, "results": [result] }`. Without `id`, runs all due jobs.

`CronRunResult`: `{ id, name, success, stdout?, stderr?, exitCode?, error?, sessionId? }`. `sessionId` is set for `prompt` crons, which create a new chat session per run.

---

## Cron sessions

### `GET /api/cron-sessions`

`{ "sessions": [{ "session": Session, "messages": UIMessage[] }] }` from `.claw/cron-sessions.json`.

### `DELETE /api/cron-sessions?sessionId=<id>`

`400 { "error": "Missing sessionId" }` without the param. Otherwise `{ "deleted": boolean }` — `false` when no session matched (this is **not** a 404).

---

## Files

### `GET /api/files/[...path]`

Serves a file from `<workspace>/public/`. The dynamic segment is a catch-all, so `/api/files/reports/out.png` maps to `<workspace>/public/reports/out.png`.

| Query param | Notes |
|---|---|
| `workspace` | Optional workspace root; defaults to `DEFAULT_WORKSPACE` |

Path traversal outside `<workspace>/public` → `403 { "error": "Forbidden" }`. A directory → `400 { "error": "Not a file" }`. Missing file → `404 { "error": "Not found" }`. Other errors are rethrown.

On success the body is the raw file with `Cache-Control: public, max-age=3600` and a `Content-Type` from a fixed extension map (`.png .jpg .jpeg .gif .webp .svg .pdf .json .txt .html .css .js`), falling back to `application/octet-stream`.

This route does **not** declare `runtime = "nodejs"`, unlike most others.

---

## Git

### `GET /api/git?workspace=<dir>`

Shells out to `git` in `workspace` (default: `process.cwd()`), 5 s timeout per command.

Not a repo (or `git branch --show-current` produced nothing) → `{ "isRepo": false }`.

Otherwise:

```json
{
  "isRepo": true,
  "branch": "main",
  "status": "clean",
  "modified": [],
  "staged": [],
  "untracked": []
}
```

`status` is `"clean"` when `git status --porcelain` is empty, else `"dirty"`. Files are bucketed by porcelain index/worktree columns; a file staged *and* dirty appears in both `staged` and `modified`.

---

## Memory

Backed by [Minns](https://www.npmjs.com/package/minns-sdk). See [configuration.md](./configuration.md) for how the credentials resolve.

### `GET /api/memory`

When memory is not configured: `{ "enabled": false, "memories": [], "stats": null }`.

| Query param | Notes |
|---|---|
| `q` | When present, returns `{ "enabled": true, "claims": [...] }` from `searchMemoryFacts` |
| `limit` | Page size for the memory list, default `10` |

Without `q`: `{ "enabled": true, "memories": [...], "stats": {…} | null }`. `stats` is `null` when the Minns stats call fails.

### `GET /api/memory/config`

```json
{
  "enabled": true,
  "source": "env" | "stored" | "none",
  "hasApiKey": true,
  "maskedKey": "****abcd",
  "projectId": ""
}
```

### `POST /api/memory/config`

Body `{ "apiKey": string, "projectId"?: string }`. `400 { "error": "API key is required" }` without `apiKey`. Writes `.claw/minns-config.json` and returns `{ "success": true }`.

Note: the in-process Minns client caches its config on first use (`_configLoaded` in `lib/memory/minns-client.ts`), so a newly saved key takes effect on the next server start.

### `DELETE /api/memory/config`

Deletes `.claw/minns-config.json`. Always `{ "success": true }`, including when the file was already absent.

---

## Notifications

Backed by a module-level in-memory array capped at 100 entries — **not persisted**, and not shared across serverless instances.

### `GET /api/notifications?since=<epochMs>`

Returns `{ "notifications": [...] }`, filtered to `timestamp > since` when `since` is given, then truncated to the first 50.

### `POST /api/notifications`

Body fields (all optional, each defaulted): `id`, `type` (`"cron_success" | "cron_failure" | "info"`, default `"info"`), `title` (default `"Notification"`), `message` (default `""`), `timestamp` (default now), `cronJobName`, `sessionId`. `read` is always stored as `false`. Returns `{ "ok": true, "notification": {…} }`; an unparseable body returns `400 { "error": "Invalid request body" }`.

### `DELETE /api/notifications`

Clears the array. `{ "ok": true }`.

---

## Providers

### `GET /api/providers`

Reports configuration status for every key of `PROVIDER_REGISTRY` (`anthropic`, `openai`, `google`, `moonshotai`) without exposing raw keys.

```json
{
  "providers": {
    "anthropic": { "configured": true, "source": "env", "masked": "****1234" },
    "openai":    { "configured": false, "source": "none", "masked": "" }
  },
  "configuredProviders": ["anthropic"]
}
```

`source` is `"env"` when the provider's environment variable is set, `"stored"` when only `.claw/api-keys.json` has it, `"none"` otherwise. Environment variables win.

### `POST /api/providers`

Body is a flat `{ "<provider>": "<key>" }` map. Non-string values and whitespace-only strings are ignored; an explicit empty string **deletes** the stored key. Unknown provider names are ignored. Always `{ "success": true }`.

---

## Sessions

### `GET /api/sessions/[id]/usage`

`{ "totalPromptTokens": 0, "totalCompletionTokens": 0, "totalCostUsd": 0, "requestCount": 0 }` for that session id. `400 { "error": "Missing session id" }` when the segment is empty. Data comes from `lib/usage/session-usage-store.ts`, which persists to `.openpaw/usage.json`.

This route does not declare `runtime = "nodejs"`.

### `POST /api/sessions/share`

Body `{ "sessionId": string, "messages": unknown[] }`. Both required → otherwise `400 { "error": "sessionId and messages[] are required" }`.

Writes `.claw/shared-sessions/<sanitized-id>.json` (the id is stripped to `[a-zA-Z0-9_-]`), preserving the original `sharedAt` and `presence` list on re-share. Returns `{ "shareUrl": "/shared/<sessionId>", "sessionId": "…" }`. Unexpected failures → `500 { "error": "Failed to share session" }`.

### `GET /api/sessions/share?id=<id>`

| Query param | Notes |
|---|---|
| `id` | Required; `400` if missing |
| `presence` | `"true"` plus `viewerId` records/refreshes this viewer |
| `viewerId` | Opaque viewer identifier |

Response `200`: `{ sessionId, messages, sharedAt, updatedAt, viewerCount }`. Presence entries expire after 30 s. Unknown id → `404 { "error": "Session not found" }`.

The public read page is `/shared/[id]`, which reads the same directory directly on the server.

---

## Skills

### `GET /api/skills?workspace=<dir>`

`{ "skills": Skill[] }`, cached for 10 s per workspace. Each skill: `{ name, description, version?, author?, tags, body, filePath, source: "built-in" | "user" }`.

### `POST /api/skills`

Body `{ "skillName": string }` — `400 { "error": "skillName is required" }` when missing or non-string. Runs `npx skills add <name> --agent claude-code --copy -y` in a temp directory and copies the result into `<workspace>/user-skills/`. Returns `{ "success": boolean, "output": string }` (always `200`, even on install failure — check `success`).

### `GET /api/skills/[name]?workspace=<dir>`

`{ "skill": Skill, "rawContent": string }`, where `rawContent` is the unparsed `SKILL.md` (empty string if it could not be read). Unknown name → `404 { "error": "Skill not found" }`.

### `PUT /api/skills/[name]?workspace=<dir>`

Body `{ "content": string }` — overwrites the skill's `SKILL.md` and invalidates the cache. `404` if unknown, `403 { "error": "Cannot edit built-in skills" }` for `source === "built-in"`, `500 { "error": "Failed to save: …" }` on write failure, else `{ "success": true }`.

### `DELETE /api/skills/[name]`

Recursively removes the skill's directory. Same `404` / `403` rules as `PUT` (`"Cannot delete built-in skills"`). Note this handler ignores the `workspace` query param and resolves skills from the default workspace.

### `GET /api/skills/search?q=<query>`

With no `q`, returns the 12-entry `FEATURED_SKILLS` list. With `q`, shells out to `npx skills find <q>` (15 s timeout), parses lines of the form `name - description (owner/repo)` with an optional following `Tags: a, b` line, and falls back to a substring match over `FEATURED_SKILLS` when parsing yields nothing. Results are cached in-process for 60 s per query.

Response: `{ "results": [{ name, owner, repo, description, stars?, tags? }] }`.

---

## Terminal

### `POST /api/terminal`

Runs a shell command and streams output as Server-Sent Events. `maxDuration = 120`; hard command timeout 60 s.

Body `{ "command": string, "workspacePath"?: string }`.

- Missing/non-string `command` → `400 { "error": "command is required" }`
- Command matching any `BLOCKED_PATTERNS` entry (see [tools.md](./tools.md)) → `403 { "error": "Command matches dangerous pattern" }`

On success the response is `text/event-stream` (`Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`). Each SSE `data:` payload is one of:

```json
{ "type": "stdout", "text": "…" }
{ "type": "stderr", "text": "…" }
{ "type": "exit", "code": 0, "duration": 1234 }
```

Timeout emits a `stderr` line followed by `exit` with code `124`. Aborting the request sends `SIGINT` to the process group, then `SIGKILL` after 3 s. The command runs under the workspace Python venv (`ensureVenv` / `getVenvEnv`) with `TERM=dumb`.

---

## Webhooks

### `POST` / `GET /api/webhooks/[platform]`

Dispatches to `bot.webhooks[platform]` from `lib/bot.ts` (Chat SDK). Adapters are registered conditionally: Slack when `SLACK_BOT_TOKEN` is set, Discord when `DISCORD_BOT_TOKEN` is set. `maxDuration = 120`.

- `POST` with an unregistered platform → `404` with the plain-text body `Unknown platform: <platform>`
- `POST` otherwise → whatever the adapter handler returns; background work is deferred via `after()`
- `GET` is a health check: `200 { "status": "active", "platform": "…" }` or `404 { "status": "not_configured", "platform": "…" }`

Static sibling routes (`telegram/`, `whatsapp/`) take precedence over this dynamic segment in the App Router.

### `POST /api/webhooks/telegram`

Telegram Bot API webhook. `maxDuration = 120`.

- Telegram not configured → `503 { "error": "Telegram not configured" }`
- `X-Telegram-Bot-Api-Secret-Token` mismatch → `401 { "error": "Invalid secret" }`. When no secret is configured, `verifyTelegram` allows all requests.
- Non-text updates are acknowledged with `{ "ok": true }` and ignored
- `/start` replies with a greeting; `/clear` clears the channel session
- Anything else runs through `handleChatBlocking` and is sent back as MarkdownV2, split into Telegram-sized chunks (a plain-text retry is attempted if MarkdownV2 is rejected)

Always returns `{ "ok": true }` for handled updates, including after an error (the error is reported to the user in-chat).

### `GET /api/webhooks/whatsapp`

Meta webhook verification handshake. Returns the raw `hub.challenge` with `200` when `hub.mode=subscribe` and `hub.verify_token` equals the configured verify token; otherwise `403 { "error": "Verification failed" }`.

### `POST /api/webhooks/whatsapp`

Incoming WhatsApp Cloud API messages. `503 { "error": "WhatsApp not configured" }` when unconfigured; status-only payloads are acknowledged with `{ "ok": true }`. Text messages are handled through the same blocking chat handler as Telegram.

---

## Workflows

See [workflows.md](./workflows.md) for the data model and the UI's actual persistence path.

### `GET /api/workflows`

`{ "workflows": Workflow[] }` from `.claw/workflows.json`.

### `POST /api/workflows`

Body `Partial<Workflow>`. `name` and a non-empty `steps` array are required → otherwise `400 { "error": "name and steps are required" }`. `description` defaults to `""`, `icon` to `"⚡"`. Returns the created `Workflow` (id `wf_<base36>_<rand>`).

### `PUT /api/workflows`

Body `Partial<Workflow> & { id: string }`. `400 { "error": "id is required" }` without `id`, `404 { "error": "Workflow not found" }` if unknown, else the updated `Workflow`.

### `DELETE /api/workflows?id=<id>`

`400` without `id`, `404` if unknown, else `{ "success": true }`.

### `POST /api/workflows/run`

Executes a step list sequentially and streams progress as SSE. Body `{ "workflowId": string, "workspacePath"?: string, "steps": WorkflowStep[] }` — note the steps are supplied by the caller, not loaded from the store. Empty/missing `steps` → `400 { "error": "steps are required" }`.

Named SSE events:

| Event | Payload |
|---|---|
| `step-start` | `{ stepId, stepIndex, name, type }` |
| `step-complete` | `WorkflowStepResult` |
| `run-complete` | `{ "status": "completed" }` or `{ "status": "failed" }` |

Execution stops early with `run-complete: failed` when a step fails and `continueOnError` is not set.

---

## Workspace

### `GET /api/workspace?path=<dir>`

Validates a directory and lists its contents. `path` defaults to `DEFAULT_WORKSPACE` and **must be absolute** → `400 { "error": "Path must be absolute" }`. A non-directory → `400 { "error": "Path is not a directory" }`. Unreadable/missing → `404 { "error": "Directory not found or not accessible" }`.

Success:

```json
{
  "path": "/abs/path",
  "valid": true,
  "entries": [{ "name": "src", "type": "directory" }, { "name": "a.ts", "type": "file" }]
}
```

Dotfiles are filtered out; directories sort before files, then alphabetically.

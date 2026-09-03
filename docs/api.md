# OpenPaw HTTP API Reference

Every route below lives under `app/api/` and runs on the Node.js runtime
(`export const runtime = "nodejs"`). There is no authentication layer in front of
these routes — the app is designed to run locally or behind your own access
control. The only endpoints that verify a caller are the channel webhooks, which
check platform-issued secrets.

Unless stated otherwise, request and response bodies are JSON.

**Contents**

- [Chat](#chat)
- [Config & Providers](#config--providers)
- [Workspace, Files & Context](#workspace-files--context)
- [Skills](#skills)
- [Crons & Cron Sessions](#crons--cron-sessions)
- [Workflows](#workflows)
- [Channels & Webhooks](#channels--webhooks)
- [Memory](#memory)
- [Notifications](#notifications)
- [Git](#git)
- [Sessions, Sharing & Usage](#sessions-sharing--usage)
- [Terminal](#terminal)

---

## Chat

### `POST /api/chat`

Primary streaming chat endpoint. Used by `ChatInterface` via the AI SDK
`useChat` hook. Returns a UI message stream (`toUIMessageStreamResponse()`),
not plain JSON.

Source: `app/api/chat/route.ts` → `lib/chat/handler.ts`. `maxDuration` is 120s.

**Body**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `messages` | `UIMessage[]` | no | `[]` | Non-array values are coerced to `[]` |
| `modelId` | `string` | no | `anthropic/claude-sonnet-4-5` | See `PROVIDER_REGISTRY` in `lib/models/providers.ts` |
| `workspacePath` | `string` | no | `DEFAULT_WORKSPACE` | Relative paths resolve against the project root |
| `sessionId` | `string` | no | — | Used for usage accounting and memory event recording |
| `maxToolSteps` | `number` | no | `MAX_TOOL_STEPS` (15) | Caps the agentic tool loop |

**Example**

```bash
curl -N http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [{"id":"1","role":"user","parts":[{"type":"text","text":"List the files here"}]}],
    "modelId": "anthropic/claude-sonnet-4-6",
    "sessionId": "sess_abc"
  }'
```

**Response** — an AI SDK UI message stream. The tool loop stops at
`maxToolSteps` steps or as soon as the `askChoice` tool is called.

> The literal default `anthropic/claude-sonnet-4-5` in this route is not the
> same constant as `DEFAULT_MODEL_ID` (`anthropic/claude-sonnet-4-6`) used by the
> cron runner. Clients normally send `modelId` explicitly.

---

### `POST /api/chat/compare`

Runs the same prompt against 2–3 models in parallel and returns their answers
side by side. Tools are **not** enabled for comparison runs; each model gets a
single `generateText` call with a 30s per-model timeout. `maxDuration` is 60s.

**Body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `messages` | `UIMessage[]` | yes | Converted with `convertToModelMessages` |
| `modelIds` | `string[]` | yes | Must contain 2 or 3 IDs |
| `workspacePath` | `string` | no | Used to build the system prompt and load skills |
| `sessionId` | `string` | no | Accepted but not currently used |

**Response** `200` — an array, one entry per model:

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

A failing model yields an `error` field rather than failing the whole request.

**Errors** — `400 { "error": "modelIds must contain 2 or 3 model IDs" }`

---

## Config & Providers

### `GET /api/config`

Returns the server's default workspace directory so the client can display it.

```json
{ "defaultWorkspace": "/Users/you/openpaw/workspace" }
```

---

### `GET /api/providers`

Reports which AI providers have a usable key, without ever returning the key
itself. Environment variables take precedence over keys stored in
`.claw/api-keys.json`.

**Response** `200`

```json
{
  "providers": {
    "anthropic": { "configured": true,  "source": "env",    "masked": "****cdef" },
    "openai":    { "configured": true,  "source": "stored", "masked": "****7890" },
    "google":    { "configured": false, "source": "none",   "masked": "" },
    "moonshotai":{ "configured": false, "source": "none",   "masked": "" }
  },
  "configuredProviders": ["anthropic", "openai"]
}
```

`source` is `"env"`, `"stored"`, or `"none"`. Provider keys come from
`PROVIDER_REGISTRY`; the matching env var names come from `PROVIDER_ENV_KEYS`.

---

### `POST /api/providers`

Saves API keys to `.claw/api-keys.json` and invalidates the in-process cache.

**Body** — an object keyed by provider name. Unknown providers are ignored.

```json
{ "anthropic": "sk-ant-…", "google": "" }
```

Semantics per field:

- non-empty string → stored (trimmed)
- empty string `""` → **removes** the stored key for that provider
- omitted, `undefined`, or non-string → left untouched
- whitespace-only → trimmed to `""` and skipped by the update pass, so it neither stores nor clears

Setting a key here does not override an env var of the same provider — env
always wins at read time.

**Response** `200 { "success": true }`

---

## Workspace, Files & Context

### `GET /api/workspace`

Validates a directory and lists its contents. Used by the workspace picker.

| Query | Required | Default | Notes |
|-------|----------|---------|-------|
| `path` | no | `DEFAULT_WORKSPACE` | **Must be absolute** |

**Response** `200` — dot-files are filtered out; directories sort before files,
then alphabetically.

```json
{
  "path": "/Users/you/openpaw/workspace",
  "valid": true,
  "entries": [
    { "name": "public", "type": "directory" },
    { "name": "notes.md", "type": "file" }
  ]
}
```

**Errors**

- `400 { "error": "Path must be absolute" }`
- `400 { "error": "Path is not a directory" }`
- `404 { "error": "Directory not found or not accessible" }`

---

### `GET /api/files/{...path}`

Serves a file from `<workspace>/public/`. This is how screenshots, PDFs and
exports produced by tools become visible in the UI.

| Query | Required | Default |
|-------|----------|---------|
| `workspace` | no | `DEFAULT_WORKSPACE` |

The resolved path is checked against `<workspace>/public` to block traversal.
`Content-Type` is inferred from the extension (png, jpg, jpeg, gif, webp, svg,
pdf, json, txt, html, css, js; otherwise `application/octet-stream`), and
responses carry `Cache-Control: public, max-age=3600`.

```bash
curl http://localhost:3000/api/files/screenshot.png --output shot.png
```

**Errors** — `403 { "error": "Forbidden" }` (traversal),
`400 { "error": "Not a file" }` (directory),
`404 { "error": "Not found" }`.

---

### `GET /api/context`

Keyword search over workspace source files, backed by
`lib/context/search.ts`. The chat handler calls the same function
automatically for code-related prompts.

| Query | Required | Default |
|-------|----------|---------|
| `q` | **yes** | — |
| `workspace` | no | `DEFAULT_WORKSPACE` |

```json
{
  "files": [
    { "path": "src/index.ts", "relevantLines": ["export function main() {"], "score": 7 }
  ]
}
```

**Errors** — `400 { "error": "q query param is required" }`,
`500 { "error": "Search failed" }`.

---

## Skills

### `GET /api/skills`

Lists all loaded skills (built-in plus user-installed), deduplicated by name.

| Query | Required | Notes |
|-------|----------|-------|
| `workspace` | no | Scopes which user-skill directories are scanned |

```json
{
  "skills": [
    {
      "name": "agent-browser",
      "description": "Browser automation…",
      "tags": ["browser"],
      "body": "…",
      "filePath": "/…/skills/agent-browser/SKILL.md",
      "source": "built-in"
    }
  ]
}
```

`source` is `"built-in"` or `"user"`. Results are cached for 10s.

---

### `POST /api/skills`

Installs a skill by running `npx skills add <name> --agent claude-code --copy -y`
in a temp directory, then copying the result into the workspace's
`user-skills/`. Times out after `CLAW_SKILL_INSTALL_TIMEOUT_MS` (60s default).

**Body** `{ "skillName": "owner/repo" }`

**Response** `200 { "success": true, "output": "…combined stdout+stderr…" }` —
note that a failed install still returns `200` with `success: false`.

**Errors** — `400 { "error": "skillName is required" }`

---

### `GET /api/skills/{name}`

Returns one skill plus the raw text of its `SKILL.md`.

| Query | Required |
|-------|----------|
| `workspace` | no |

```json
{ "skill": { "name": "coding", "source": "built-in", "…": "…" }, "rawContent": "---\nname: coding\n---\n…" }
```

If the file cannot be read, `rawContent` is `""` rather than an error.

**Errors** — `404 { "error": "Skill not found" }`

---

### `PUT /api/skills/{name}`

Overwrites a user skill's `SKILL.md`. Built-in skills are read-only.

**Body** `{ "content": "---\nname: my-skill\n…" }`

**Response** `200 { "success": true }`

**Errors** — `404` not found, `403 { "error": "Cannot edit built-in skills" }`,
`500 { "error": "Failed to save: …" }`.

---

### `DELETE /api/skills/{name}`

Recursively removes the skill's directory. Built-in skills are protected. This
handler always resolves skills from the default workspace — it ignores the
`workspace` query parameter that `GET` and `PUT` honor.

**Response** `200 { "success": true }`

**Errors** — `404` not found, `403 { "error": "Cannot delete built-in skills" }`,
`500 { "error": "Failed to delete: …" }`.

---

### `GET /api/skills/search`

Searches the skills ecosystem. Shells out to the `npx skills find` CLI (15s
timeout) and falls back to a curated featured list when the CLI returns nothing
or fails. Results are cached per query.

| Query | Required | Notes |
|-------|----------|-------|
| `q` | no | Omitted or empty → returns the full featured list |

```json
{
  "results": [
    {
      "name": "agent-browser",
      "owner": "nicepkg",
      "repo": "agent-skills",
      "description": "Browser automation…",
      "tags": ["browser", "automation", "scraping"]
    }
  ]
}
```

---

## Crons & Cron Sessions

Cron jobs persist to `.claw/crons.json` (`lib/crons/cron-store.ts`).

### `GET /api/crons`

`200 { "jobs": CronJob[] }`. Legacy jobs with no `type` are migrated to
`"command"` on read.

A `CronJob`:

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | `cron_<base36>_<random>` |
| `name` | `string` | |
| `schedule` | `string` | Standard cron expression, parsed by `cron-parser` |
| `type` | `"command" \| "prompt"` | |
| `command` | `string?` | Required when `type` is `command` |
| `prompt` | `string?` | Required when `type` is `prompt` |
| `workspacePath` | `string?` | |
| `modelId` | `string?` | Prompt crons only; defaults to `DEFAULT_MODEL_ID` |
| `enabled` | `boolean` | Disabled jobs are skipped by `runDueCrons` |
| `lastRunAt` | `number?` | Epoch ms; the scheduler computes "due" from this |
| `createdAt` / `updatedAt` | `number` | Epoch ms |

---

### `POST /api/crons`

Creates a job, or updates one when `id` is present.

**Create body** — `name` and `schedule` are required. `type` defaults to
`"prompt"` when a `prompt` is supplied, otherwise `"command"`. `enabled`
defaults to `true`.

```json
{ "name": "Nightly backup", "schedule": "0 3 * * *", "command": "./backup.sh" }
```

**Update body** — include `id`; the mutable fields are `name`, `schedule`,
`type`, `command`, `prompt`, `modelId`, `workspacePath`, `enabled`.

**Response** `200` — the created or updated `CronJob`.

**Errors**

- `400 { "error": "name and schedule are required" }`
- `400 { "error": "command is required for type 'command'" }`
- `400 { "error": "prompt is required for type 'prompt'" }`
- `404 { "error": "Cron not found" }` (update path)

---

### `DELETE /api/crons?id=<id>`

`200 { "success": true }`. Errors: `400` missing `id`, `404` not found.

---

### `GET /api/crons/run`

Runs every job that is due. This is the entry point Vercel Cron calls each
minute (see `vercel.json`).

```json
{ "ran": 2, "results": [ { "id": "cron_x", "name": "Nightly backup", "success": true, "stdout": "…", "exitCode": 0 } ] }
```

### `POST /api/crons/run`

Same, with optional targeting. A malformed or absent body is tolerated.

**Body** `{ "id": "cron_x", "workspacePath": "/abs/path" }` — both optional.
With `id`, only that job runs (regardless of schedule); without it, all due jobs
run.

**Response** `200 { "ran": n, "results": CronRunResult[] }`.
A `CronRunResult` carries `id`, `name`, `success`, and then either
`stdout`/`stderr`/`exitCode` (command jobs) or `sessionId`/`error` (prompt jobs).

**Errors** — `404 { "error": "Cron not found" }` when `id` does not match.

> Self-hosted scheduling: `* * * * * curl -X POST https://your-app/api/crons/run`

---

### `GET /api/cron-sessions`

Chat sessions created by prompt crons, from `.claw/cron-sessions.json`.

`200 { "sessions": [ { "session": {...}, "messages": [...] } ] }`

### `DELETE /api/cron-sessions?sessionId=<id>`

`200 { "deleted": true }` (`false` when nothing matched).
Errors: `400 { "error": "Missing sessionId" }`.

---

## Workflows

Workflows persist to `.claw/workflows.json`.

### `GET /api/workflows`

`200 { "workflows": Workflow[] }`

### `POST /api/workflows`

**Body** — `name` and a non-empty `steps` array are required; `description`
defaults to `""` and `icon` to `"⚡"`.

```json
{
  "name": "Build and test",
  "description": "CI shortcut",
  "icon": "🚀",
  "steps": [
    { "id": "s1", "name": "Install", "type": "command", "command": "npm ci" },
    { "id": "s2", "name": "Test", "type": "command", "command": "npm test", "continueOnError": false }
  ]
}
```

**Response** `200` — the created workflow.
**Errors** — `400 { "error": "name and steps are required" }`

### `PUT /api/workflows`

**Body** `{ "id": "wf_x", "name"?, "description"?, "icon"?, "steps"? }`
Errors: `400` missing `id`, `404` not found.

### `DELETE /api/workflows?id=<id>`

`200 { "success": true }`. Errors: `400` missing `id`, `404` not found.

---

### `POST /api/workflows/run`

Executes steps sequentially and streams progress over **SSE**
(`Content-Type: text/event-stream`).

**Body** `{ "workflowId": "wf_x", "workspacePath": "/abs/path", "steps": [...] }`.
`workspacePath` defaults to `process.cwd()`.

Step types:

- **`command`** — runs via `exec` with the step's `timeout` (default 60000ms) and
  a 1 MiB output buffer. `{{previousOutput}}` in the command is substituted with
  the previous step's trimmed output.
- **`prompt`** — currently a placeholder: it echoes
  `[Prompt sent to AI]\n\n<prompt>` and does **not** call a model. It also
  supports `{{previousOutput}}` substitution.
- **`condition`** — evaluates `condition` as a JS expression with `output` bound
  to the previous output, then jumps to the step whose `id` matches `onTrue` or
  `onFalse`. An unresolvable target falls through to the next step.

Any other `type` produces a `skipped` result.

**Events**

| Event | Payload |
|-------|---------|
| `step-start` | `{ stepId, stepIndex, name, type }` |
| `step-complete` | `{ stepId, status, output?, error?, durationMs }` |
| `run-complete` | `{ status: "completed" \| "failed" }` |

`status` on a step is `success`, `failure`, or `skipped`. A failing step ends the
run with `run-complete { status: "failed" }` unless the step sets
`continueOnError: true`.

**Errors** — `400 { "error": "steps are required" }` (plain JSON, not SSE).

> `condition` steps evaluate their expression with `new Function`. Treat
> workflow definitions as trusted input.

---

## Channels & Webhooks

### `GET /api/channels`

Status for all five channels, the webhook URL to register for each (derived from
the request's own origin), and the effective timeout configuration.

```json
{
  "channels": {
    "slack":    { "enabled": true,  "webhookUrl": "http://localhost:3000/api/webhooks/slack",    "activeSessions": 0, "fields": { "token": {"set": true, "source": "env", "masked": "****abcd"}, "secret": {"…": "…"} } },
    "discord":  { "enabled": false, "webhookUrl": "…/api/webhooks/discord",  "activeSessions": 0, "fields": {"…": "…"} },
    "gchat":    { "enabled": false, "webhookUrl": "…/api/webhooks/gchat",    "activeSessions": 0, "fields": {"…": "…"} },
    "telegram": { "enabled": true,  "webhookUrl": "…/api/webhooks/telegram", "activeSessions": 3, "fields": {"…": "…"} },
    "whatsapp": { "enabled": false, "webhookUrl": "…/api/webhooks/whatsapp", "activeSessions": 0, "fields": {"…": "…"} }
  },
  "timeouts": { "chatBlocking": 90000, "bashCommand": 30000, "codeExecution": 15000, "maxToolSteps": 15 },
  "totalActiveSessions": 3
}
```

`activeSessions` is always `0` for the Chat SDK platforms (slack, discord,
gchat), whose thread state lives in the SDK's own state adapter rather than
OpenPaw's session store. Each `fields` entry reports
`{ set, source: "env" | "stored" | "none", masked }`.

---

### `POST /api/channels`

Persists credentials to `.claw/channels.json`. The whole `config` object
replaces whatever was stored for that channel.

**Body** `{ "channel": "telegram", "config": { "token": "123:ABC", "secret": "s3cret" } }`

Valid channels: `telegram`, `slack`, `whatsapp`, `discord`, `gchat`.
Recognized config fields: `token`, `secret`, and for WhatsApp `phoneNumberId`.

**Response** `200 { "success": true }` · **Errors** `400 { "error": "Invalid channel" }`

### `DELETE /api/channels`

**Body** `{ "channel": "telegram" }` — clears stored credentials (env vars are
unaffected). `200 { "success": true }`, `400` on an invalid channel.

---

### `POST /api/webhooks/{platform}` · `GET /api/webhooks/{platform}`

Dynamic route that dispatches to the Chat SDK bot in `lib/bot.ts`.
`maxDuration` is 120s. The static `telegram/` and `whatsapp/` routes take
precedence over this one in the App Router.

`POST` forwards the request to the platform's adapter handler.
`GET` is a health check: `200 { "status": "active", "platform": "slack" }` or
`404 { "status": "not_configured", "platform": "…" }`.

Only adapters that were registered at module load are reachable. `lib/bot.ts`
registers **Slack** (when `SLACK_BOT_TOKEN` is set) and **Discord** (when
`DISCORD_BOT_TOKEN` is set). There is no Google Chat adapter, so
`/api/webhooks/gchat` returns `404` even though the Channels UI shows a gchat
row and `GET /api/channels` reports its status.

**Errors** — `404 Unknown platform: <platform>` (plain text, from `POST`).

---

### `POST /api/webhooks/telegram`

Custom Telegram Bot API integration. `maxDuration` is 120s.

**Auth** — the `X-Telegram-Bot-Api-Secret-Token` header must equal the
configured secret. If no secret is configured, `verifyTelegram` allows every
request, so setting `TELEGRAM_WEBHOOK_SECRET` is strongly recommended.

**Body** — a Telegram `Update`. Only `update.message.text` is handled; anything
else is acknowledged with `200 { "ok": true }` and ignored.

Commands: `/start` replies with a greeting; `/clear` drops the stored session.
Otherwise the text is appended to the per-user session and run through
`handleChatBlocking`, and the reply is sent back as MarkdownV2 (falling back to
unformatted text if Telegram rejects the markup) split into Telegram-sized
chunks.

**Response** `200 { "ok": true }` — errors during generation are reported to the
user in-chat, not via the HTTP status.

**Errors** — `503 { "error": "Telegram not configured" }`,
`401 { "error": "Invalid secret" }`.

**Registering the webhook**

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<YOUR_DOMAIN>/api/webhooks/telegram" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

---

### `GET /api/webhooks/whatsapp`

Meta's webhook verification handshake.

| Query | Notes |
|-------|-------|
| `hub.mode` | Must be `subscribe` |
| `hub.verify_token` | Must equal `WHATSAPP_VERIFY_TOKEN` (or the stored secret) |
| `hub.challenge` | Echoed back as the plain-text body on success |

`200` with the challenge string, or `403 { "error": "Verification failed" }`.

### `POST /api/webhooks/whatsapp`

Incoming WhatsApp Cloud API messages. `maxDuration` is 120s. Reads
`entry[0].changes[0].value.messages[0]`; payloads without messages (status
updates and the like) are acknowledged and ignored.

Text messages are marked read, appended to the per-sender session, and run
through `handleChatBlocking`; the reply goes back through the Graph API v21.0.
`/clear` or `clear` resets the session. Non-text messages get a canned reply
explaining only text is supported.

**Response** `200 { "ok": true }` · **Errors** `503 { "error": "WhatsApp not configured" }`

> This route does not verify the `X-Hub-Signature-256` header. A
> `verifyWhatsApp` helper exists in `lib/chat/verify.ts` but is not wired up, and
> the `WHATSAPP_APP_SECRET` variable named in the route's setup comment is never
> read anywhere in the codebase. Anyone who can reach the URL can post a
> well-formed payload.

---

## Memory

Optional long-term memory backed by [Minns](https://minns.ai). Every endpoint
degrades gracefully when memory is not configured.

### `GET /api/memory`

| Query | Required | Default | Notes |
|-------|----------|---------|-------|
| `q` | no | — | When present, searches facts/claims instead of listing |
| `limit` | no | `10` | Page size for the listing mode |

Memory disabled → `200 { "enabled": false, "memories": [], "stats": null }`
Search mode → `200 { "enabled": true, "claims": [...] }`
List mode → `200 { "enabled": true, "memories": [...], "stats": {...} | null }`
(`stats` is `null` when the stats call fails.)

### `GET /api/memory/config`

```json
{
  "enabled": true,
  "source": "env",
  "hasApiKey": true,
  "maskedKey": "****9f2a",
  "projectId": "proj_123"
}
```

`source` is `"env"`, `"stored"`, or `"none"`; env wins over
`.claw/minns-config.json`.

### `POST /api/memory/config`

**Body** `{ "apiKey": "…", "projectId": "…" }` — `apiKey` is required,
`projectId` defaults to `""`. Writes `.claw/minns-config.json`.

`200 { "success": true }` · `400 { "error": "API key is required" }`

### `DELETE /api/memory/config`

Deletes the stored config file. Always `200 { "success": true }`, even if the
file was already absent. Does not affect `MINNS_API_KEY`.

---

## Notifications

In-memory only — the list is a module-level array, so it is **not** shared
across serverless instances and is lost on restart. Capacity is 100, newest
first.

### `GET /api/notifications`

| Query | Required | Notes |
|-------|----------|-------|
| `since` | no | Epoch ms; returns only notifications strictly newer |

`200 { "notifications": [...] }` — at most 50 entries per response.

A notification: `{ id, type, title, message, timestamp, read, cronJobName?, sessionId? }`
where `type` is `cron_success`, `cron_failure`, or `info`.

### `POST /api/notifications`

Used by the cron runner to publish results. All fields are optional and
defaulted (`id` generated, `type` `"info"`, `title` `"Notification"`,
`message` `""`, `timestamp` now, `read` false).

`200 { "ok": true, "notification": {...} }` · `400 { "error": "Invalid request body" }`

### `DELETE /api/notifications`

Clears every notification. `200 { "ok": true }`

---

## Git

### `GET /api/git`

Read-only git status for the header's git indicator. Each git call has a 5s
timeout, and any failure is swallowed into `{ "isRepo": false }`.

| Query | Required | Default |
|-------|----------|---------|
| `workspace` | no | `process.cwd()` |

```json
{
  "isRepo": true,
  "branch": "main",
  "status": "dirty",
  "modified": ["lib/chat/handler.ts"],
  "staged": ["README.md"],
  "untracked": ["notes.txt"]
}
```

`status` is `"clean"` or `"dirty"`. A file staged *and* modified appears in both
arrays. Detached HEAD reports `{ "isRepo": false }`, since
`git branch --show-current` returns empty.

---

## Sessions, Sharing & Usage

### `GET /api/sessions/{id}/usage`

Token and cost summary for a session, from the in-memory usage store populated
by `recordUsage` in the chat handler.

`200` — the summary object. `400 { "error": "Missing session id" }`.

### `POST /api/sessions/share`

Writes a snapshot to `.claw/shared-sessions/<id>.json`. The id is sanitized to
`[A-Za-z0-9_-]`. Re-sharing preserves the original `sharedAt` and presence list
while replacing `messages`.

**Body** `{ "sessionId": "sess_abc", "messages": [...] }`

`200 { "shareUrl": "/shared/sess_abc", "sessionId": "sess_abc" }`

**Errors** — `400 { "error": "sessionId and messages[] are required" }`,
`500 { "error": "Failed to share session" }`.

### `GET /api/sessions/share`

| Query | Required | Notes |
|-------|----------|-------|
| `id` | **yes** | |
| `presence` | no | `"true"` registers/refreshes a viewer |
| `viewerId` | no | Required alongside `presence=true` to have any effect |

Presence entries expire after 30s; `viewerCount` counts only live ones.

```json
{
  "sessionId": "sess_abc",
  "messages": [],
  "sharedAt": 1730000000000,
  "updatedAt": 1730000100000,
  "viewerCount": 2
}
```

**Errors** — `400 { "error": "id query param is required" }`,
`404 { "error": "Session not found" }`.

---

## Terminal

### `POST /api/terminal`

Streams live bash output over SSE. Powers the `LiveTerminal` component during
`executeBash` tool calls. `maxDuration` is 120s; the command itself is killed
after 60s.

**Body** `{ "command": "npm test", "workspacePath": "/abs/path" }` —
`workspacePath` defaults to `DEFAULT_WORKSPACE`. The command is rejected if it
matches `BLOCKED_PATTERNS` from `lib/tools/bash.ts`. The Python venv environment
is applied, and the command runs `cd '<workspace>' && <command>`.

**Events** — `data:`-only SSE frames (no `event:` names):

| Payload | Meaning |
|---------|---------|
| `{ "type": "stdout", "text": "…" }` | stdout chunk |
| `{ "type": "stderr", "text": "…" }` | stderr chunk |
| `{ "type": "exit", "code": 0, "duration": 1234 }` | terminated; `code` is `124` on timeout |

Aborting the request sends `SIGINT` to the process group, then `SIGKILL` after
3s.

**Errors** — `400 { "error": "command is required" }`,
`403 { "error": "Command matches dangerous pattern" }` (both plain JSON).

# API Reference

Every REST endpoint in OpenPaw lives under `app/api/**/route.ts`. All routes run on the
Node.js runtime (`export const runtime = "nodejs"`).

There is **no authentication layer** — the app is designed to run locally or behind your own
access control. Anything that can reach the server can run bash in the workspace via
`/api/chat` and `/api/terminal`. Do not expose an OpenPaw instance to the public internet
without putting auth in front of it.

Examples below assume `http://localhost:3000`.

**Contents**

- [Chat](#chat) · [Config & Providers](#config--providers) · [Sessions, Usage & Sharing](#sessions-usage--sharing)
- [Crons & Cron Sessions](#crons--cron-sessions) · [Workflows](#workflows) · [Skills](#skills)
- [Memory](#memory) · [Channels & Webhooks](#channels--webhooks)
- [Files, Git, Workspace & Context](#files-git-workspace--context) · [Terminal](#terminal) · [Notifications](#notifications)

---

## Chat

### `POST /api/chat`

Main streaming chat endpoint. Delegates to `handleChatStreaming` in `lib/chat/handler.ts` and
returns an AI SDK UI message stream (`toUIMessageStreamResponse()`).

`maxDuration` is 120 seconds.

**Request body**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `messages` | `UIMessage[]` | `[]` | Non-array values are coerced to `[]` |
| `modelId` | `string` | `"anthropic/claude-sonnet-4-5"` | `provider/model`, e.g. `anthropic/claude-sonnet-4-6` |
| `workspacePath` | `string` | `DEFAULT_WORKSPACE` | Absolute, or relative to the project root |
| `sessionId` | `string` | — | Used for usage recording and memory events; usage is skipped without it |
| `maxToolSteps` | `number` | `MAX_TOOL_STEPS` (15) | Upper bound on agentic tool steps |

**Response** — `text/event-stream` carrying AI SDK UI message parts (text deltas, tool
calls, tool results, finish events). Consume it with `useChat` from `@ai-sdk/react`, not by
hand.

```bash
curl -N http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
        "messages": [{"id":"1","role":"user","parts":[{"type":"text","text":"list the workspace"}]}],
        "modelId": "anthropic/claude-sonnet-4-6",
        "sessionId": "demo-session"
      }'
```

### `POST /api/chat/compare`

Runs the same prompt against 2–3 models in parallel with `generateText` and returns all
results. Tools are **not** enabled for compare runs — it is a plain text generation with the
same system prompt and skills as a normal chat. Each model gets a 30 s timeout;
`maxDuration` is 60 s.

**Request body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `messages` | `UIMessage[]` | yes | Converted with `convertToModelMessages` |
| `modelIds` | `string[]` | yes | Must contain 2 or 3 IDs |
| `workspacePath` | `string` | no | Resolved the same way as `/api/chat` |
| `sessionId` | `string` | no | Accepted but not used for usage recording on this route |

**Response** `200` — a JSON **array**, one entry per requested model:

```jsonc
[
  {
    "modelId": "anthropic/claude-sonnet-4-6",
    "text": "…",                                  // "(no response)" if the model returned empty
    "usage": { "inputTokens": 120, "outputTokens": 340 },
    "durationMs": 2841,
    "error": "Timeout after 30000ms"               // present only on failure; text is "" then
  }
]
```

**Status codes** — `400` if `modelIds` does not contain 2 or 3 entries. Per-model failures do
not fail the request; they surface as an `error` field on that entry.

```bash
curl http://localhost:3000/api/chat/compare \
  -H 'Content-Type: application/json' \
  -d '{
        "messages": [{"id":"1","role":"user","parts":[{"type":"text","text":"Explain SSE in one paragraph"}]}],
        "modelIds": ["anthropic/claude-sonnet-4-6","openai/gpt-5.2"]
      }'
```

---

## Config & Providers

### `GET /api/config`

Returns the server's default workspace directory so the UI can show it as a placeholder.

```jsonc
{ "defaultWorkspace": "/abs/path/to/workspace" }
```

```bash
curl http://localhost:3000/api/config
```

### `GET /api/providers`

Reports which AI providers are configured, and whether the key came from the environment or
from `.claw/api-keys.json`. Raw keys are never returned — only a `****abcd` mask.

```jsonc
{
  "providers": {
    "anthropic":  { "configured": true,  "source": "env",    "masked": "****fA3k" },
    "openai":     { "configured": true,  "source": "stored", "masked": "****9d21" },
    "google":     { "configured": false, "source": "none",   "masked": "" },
    "moonshotai": { "configured": false, "source": "none",   "masked": "" }
  },
  "configuredProviders": ["anthropic", "openai"]
}
```

The provider keys are exactly those in `PROVIDER_REGISTRY` (`lib/models/providers.ts`):
`anthropic`, `openai`, `google`, `moonshotai`.

```bash
curl http://localhost:3000/api/providers
```

### `POST /api/providers`

Saves API keys to `.claw/api-keys.json` and invalidates the in-process cache.

**Request body** — an object keyed by provider name. Behaviour per value:

| Value | Effect |
|-------|--------|
| non-empty string | Stored (trimmed) |
| `""` (empty string) | Deletes the stored key for that provider |
| omitted / non-string / whitespace-only | Ignored — existing value untouched |

Environment variables always win over stored keys at read time, so saving a key here has no
effect while the matching env var is set.

**Response** `200` — `{ "success": true }`

```bash
curl -X POST http://localhost:3000/api/providers \
  -H 'Content-Type: application/json' \
  -d '{"anthropic":"sk-ant-…","google":""}'
```

---

## Sessions, Usage & Sharing

### `GET /api/sessions/[id]/usage`

Aggregated token usage and estimated cost for one chat session, read from
`.openpaw/usage.json` (see `lib/usage/session-usage-store.ts`).

```jsonc
{
  "totalPromptTokens": 18422,
  "totalCompletionTokens": 5310,
  "totalCostUsd": 0.0871,
  "requestCount": 7
}
```

**Status codes** — `400` `{"error":"Missing session id"}` when the id is empty. An unknown
session returns zeros rather than a 404.

```bash
curl http://localhost:3000/api/sessions/demo-session/usage
```

### `POST /api/sessions/share`

Publishes a session's messages to `.claw/shared-sessions/<sessionId>.json` so they can be
viewed at `/shared/<sessionId>`. Re-posting the same `sessionId` updates the snapshot and
preserves the original `sharedAt` timestamp and the presence list.

The session id is sanitized to `[a-zA-Z0-9_-]` before being used as a filename.

**Request body** — `{ "sessionId": string, "messages": unknown[] }`

**Response** `200` — `{ "shareUrl": "/shared/<sessionId>", "sessionId": "<sessionId>" }`

**Status codes** — `400` when `sessionId` is missing or `messages` is not an array; `500` on
a write failure.

```bash
curl -X POST http://localhost:3000/api/sessions/share \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"demo-session","messages":[]}'
```

### `GET /api/sessions/share`

Reads a shared session and, optionally, registers the caller as an active viewer.

**Query parameters**

| Param | Required | Notes |
|-------|----------|-------|
| `id` | yes | The shared session id |
| `presence` | no | Pass `true` (with `viewerId`) to record a heartbeat |
| `viewerId` | no | Stable per-viewer id; required for `presence=true` to have any effect |

Presence entries expire after 30 seconds; stale entries are pruned on each presence write.

```jsonc
{
  "sessionId": "demo-session",
  "messages": [],
  "sharedAt": 1770000000000,
  "updatedAt": 1770000600000,
  "viewerCount": 2
}
```

**Status codes** — `400` when `id` is missing; `404` `{"error":"Session not found"}`.

```bash
curl 'http://localhost:3000/api/sessions/share?id=demo-session&presence=true&viewerId=abc123'
```

---

## Crons & Cron Sessions

Scheduled tasks are persisted in `.claw/crons.json` (`lib/crons/cron-store.ts`).

### `GET /api/crons`

Returns `{ "jobs": CronJob[] }`. Legacy jobs with no `type` are migrated to `"command"` on
read.

A `CronJob` is:

```jsonc
{
  "id": "cron_lx3f2a_9q1b8z",
  "name": "Nightly backup",
  "schedule": "0 3 * * *",
  "type": "command",            // "command" | "prompt"
  "command": "./backup.sh",     // when type is "command"
  "prompt": "…",                // when type is "prompt"
  "workspacePath": "/abs/path",
  "modelId": "anthropic/claude-sonnet-4-6",
  "enabled": true,
  "lastRunAt": 1770000000000,
  "createdAt": 1769000000000,
  "updatedAt": 1769000000000
}
```

```bash
curl http://localhost:3000/api/crons
```

### `POST /api/crons`

Creates a cron, or updates one when `id` is supplied.

**Create** — accepts `name`, `schedule`, `type`, `command`, `prompt`, `modelId`,
`workspacePath`, `enabled`. `type` defaults to `"prompt"` when a `prompt` is given, otherwise
`"command"`. `enabled` defaults to `true`.

**Update** — with `id` present, the same fields are applied as a patch.

**Response** `200` — the created or updated `CronJob`.

**Status codes**

| Code | Condition |
|------|-----------|
| `400` | `name` or `schedule` missing (create) |
| `400` | `type` is `command` and `command` is missing |
| `400` | `type` is `prompt` and `prompt` is missing |
| `404` | `id` supplied but no such cron |

```bash
curl -X POST http://localhost:3000/api/crons \
  -H 'Content-Type: application/json' \
  -d '{"name":"Nightly backup","schedule":"0 3 * * *","type":"command","command":"./backup.sh"}'
```

### `DELETE /api/crons`

**Query parameters** — `id` (required).

**Response** `200` — `{ "success": true }`. `400` when `id` is missing, `404` when unknown.

```bash
curl -X DELETE 'http://localhost:3000/api/crons?id=cron_lx3f2a_9q1b8z'
```

### `GET /api/crons/run`

Runs every enabled cron that is due, using `cron-parser` against each job's `lastRunAt`.
This is the entry point Vercel Cron calls (see `vercel.json`).

**Response** `200` — `{ "ran": number, "results": CronRunResult[] }`

A `CronRunResult` contains `id`, `name`, `success`, and then either `stdout` / `stderr` /
`exitCode` (command crons) or `sessionId` / `error` (prompt crons).

```bash
curl http://localhost:3000/api/crons/run
```

### `POST /api/crons/run`

Same as the GET form, plus the ability to force a single job.

**Request body** — `{ "id"?: string, "workspacePath"?: string }`. A malformed or empty body is
tolerated (both fields fall back to `undefined`).

With `id`, that one cron runs regardless of schedule and the response is
`{ "ran": 1, "results": [result] }`; `404` if the id is unknown. Without `id`, all due crons
run.

Every run posts a best-effort notification to `/api/notifications`.

```bash
curl -X POST http://localhost:3000/api/crons/run \
  -H 'Content-Type: application/json' \
  -d '{"id":"cron_lx3f2a_9q1b8z"}'
```

### `GET /api/cron-sessions`

Chat sessions created by `type: "prompt"` crons, read from `.claw/cron-sessions.json`.

**Response** — `{ "sessions": [{ "session": Session, "messages": UIMessage[] }] }`

```bash
curl http://localhost:3000/api/cron-sessions
```

### `DELETE /api/cron-sessions`

**Query parameters** — `sessionId` (required).

**Response** `200` — `{ "deleted": boolean }` (`false` when nothing matched).
`400` `{"error":"Missing sessionId"}` when the param is absent.

```bash
curl -X DELETE 'http://localhost:3000/api/cron-sessions?sessionId=cron_abc_1770000000000'
```

---

## Workflows

Server-side workflow definitions live in `.claw/workflows.json`
(`lib/workflows/workflow-store.ts`). Note that the sidebar UI keeps its workflows in
localStorage instead — see [Features](./features.md#workflows) for the split.

A `WorkflowStep` is:

```jsonc
{
  "id": "step-run-tests",
  "type": "command",          // "command" | "prompt" | "condition"
  "name": "Run Tests",
  "command": "npm test",      // type: command
  "prompt": "…",              // type: prompt
  "condition": "!output.includes('FAIL')",  // type: condition
  "onTrue": "step-done",      // step id to jump to
  "onFalse": "step-fix",
  "timeout": 60000,           // ms, command steps; defaults to 60000
  "continueOnError": true
}
```

### `GET /api/workflows`

Returns `{ "workflows": Workflow[] }`.

```bash
curl http://localhost:3000/api/workflows
```

### `POST /api/workflows`

Creates a workflow.

**Request body** — `name` (required), `steps` (required, non-empty), `description`
(defaults `""`), `icon` (defaults `"⚡"`).

**Response** `200` — the created `Workflow` with generated `id`, `createdAt`, `updatedAt`.
`400` when `name` is missing or `steps` is empty.

```bash
curl -X POST http://localhost:3000/api/workflows \
  -H 'Content-Type: application/json' \
  -d '{"name":"Lint","icon":"🧹","steps":[{"id":"s1","type":"command","name":"Lint","command":"npm run lint"}]}'
```

### `PUT /api/workflows`

Updates a workflow. Body must include `id`; `name`, `description`, `icon`, and `steps` are
applied as a patch.

`400` when `id` is missing, `404` when unknown, otherwise the updated `Workflow`.

```bash
curl -X PUT http://localhost:3000/api/workflows \
  -H 'Content-Type: application/json' \
  -d '{"id":"wf_lx3f2a_9q1b8z","name":"Lint & typecheck"}'
```

### `DELETE /api/workflows`

**Query parameters** — `id` (required). `400` when missing, `404` when unknown, otherwise
`{ "success": true }`.

```bash
curl -X DELETE 'http://localhost:3000/api/workflows?id=wf_lx3f2a_9q1b8z'
```

### `POST /api/workflows/run`

Executes steps sequentially and streams progress over SSE. Steps are taken **from the request
body**, not from the store, so the client can run unsaved or built-in workflows.

**Request body** — `{ "workflowId": string, "workspacePath"?: string, "steps": WorkflowStep[] }`.
`workspacePath` defaults to `process.cwd()`.

**Step semantics**

- `command` — runs via `child_process.exec` with a 1 MB output buffer. `{{previousOutput}}`
  in the command is substituted with the previous step's trimmed output. Status is `success`
  on exit code 0, otherwise `failure` with `error: "Exit code: N"`.
- `prompt` — **does not call a model.** It substitutes `{{previousOutput}}` and returns
  `"[Prompt sent to AI]\n\n<prompt>"` as its output, then sets that text as
  `previousOutput`. It is a placeholder in the current implementation.
- `condition` — evaluates the expression with `new Function("output", …)` against
  `previousOutput`. Jumps to `onTrue` / `onFalse` when that step id exists, otherwise falls
  through to the next step.

A `failure` stops the run unless the step sets `continueOnError: true`.

**Response** `200` — `text/event-stream` with named events:

| Event | Payload |
|-------|---------|
| `step-start` | `{ stepId, stepIndex, name, type }` |
| `step-complete` | `{ stepId, status, output?, error?, durationMs }` |
| `run-complete` | `{ status: "completed" \| "failed" }` |

`400` when `steps` is missing or empty.

```bash
curl -N http://localhost:3000/api/workflows/run \
  -H 'Content-Type: application/json' \
  -d '{"workflowId":"wf_demo","steps":[{"id":"s1","type":"command","name":"Echo","command":"echo hi"}]}'
```

> `condition` steps evaluate their expression with `new Function`. Only run workflows whose
> step definitions you control.

---

## Skills

### `GET /api/skills`

Lists loaded skills (built-in plus user-installed).

**Query parameters** — `workspace` (optional): resolve workspace-scoped skill directories
against this path instead of the default workspace.

**Response** — `{ "skills": Skill[] }` where each `Skill` has `name`, `description`,
`version?`, `author?`, `tags`, `body`, `filePath`, and `source` (`"built-in" | "user"`).

```bash
curl 'http://localhost:3000/api/skills'
```

### `POST /api/skills`

Installs a skill by running `npx skills add <skillName> --agent claude-code --copy -y` in a
temp directory, then copying the result into `<workspace>/user-skills/`. Times out per
`CLAW_SKILL_INSTALL_TIMEOUT_MS` (default 60 s).

**Request body** — `{ "skillName": string }` (e.g. `"owner/repo"`).

**Response** `200` — `{ "success": boolean, "output": string }` (combined stdout + stderr).
Note that a failed install still returns `200` with `success: false`.

`400` when `skillName` is missing or not a string.

```bash
curl -X POST http://localhost:3000/api/skills \
  -H 'Content-Type: application/json' \
  -d '{"skillName":"vercel-labs/agent-skills"}'
```

### `GET /api/skills/[name]`

Returns the parsed skill plus the raw `SKILL.md` text (empty string if the file can't be
read).

**Query parameters** — `workspace` (optional).

**Response** — `{ "skill": Skill, "rawContent": string }`. `404` when the name isn't loaded.

```bash
curl http://localhost:3000/api/skills/coding
```

### `PUT /api/skills/[name]`

Overwrites the skill's `SKILL.md` and invalidates the skills cache.

**Query parameters** — `workspace` (optional).
**Request body** — `{ "content": string }` (the full file, frontmatter included).

**Status codes** — `200` `{"success":true}`; `404` unknown skill; `403`
`{"error":"Cannot edit built-in skills"}`; `500` on a write failure.

```bash
curl -X PUT http://localhost:3000/api/skills/my-skill \
  -H 'Content-Type: application/json' \
  -d '{"content":"---\nname: my-skill\ndescription: Does a thing\n---\n\n# My skill\n"}'
```

### `DELETE /api/skills/[name]`

Recursively removes the directory containing the skill's `SKILL.md`. This route resolves
skills against the **default** workspace — it does not read a `workspace` query param.

**Status codes** — `200` `{"success":true}`; `404` unknown skill; `403`
`{"error":"Cannot delete built-in skills"}`; `500` on failure.

```bash
curl -X DELETE http://localhost:3000/api/skills/my-skill
```

### `GET /api/skills/search`

Searches the skills ecosystem. With no `q`, returns a curated `FEATURED_SKILLS` list. With a
query, shells out to `npx skills find <q>` (15 s timeout) and parses lines of the form
`name - description (owner/repo)` with an optional following `Tags: a, b` line. If the CLI
yields nothing, it falls back to a substring match over the featured list. Results are cached
per query for 60 seconds.

**Query parameters** — `q` (optional).

**Response** — `{ "results": [{ "name", "owner", "repo", "description", "stars"?, "tags"? }] }`

```bash
curl 'http://localhost:3000/api/skills/search?q=browser'
```

---

## Memory

Memory is backed by [Minns](https://minns.ai) and is entirely optional — every endpoint
degrades gracefully when it isn't configured.

### `GET /api/memory`

**Query parameters**

| Param | Default | Notes |
|-------|---------|-------|
| `q` | — | When present, searches claims instead of listing memories |
| `limit` | `10` | Number of memories to return (ignored when `q` is set) |

**Responses**

```jsonc
// memory not configured
{ "enabled": false, "memories": [], "stats": null }

// with ?q=…
{ "enabled": true, "claims": [ … ] }

// without ?q
{ "enabled": true, "memories": [ … ], "stats": { … } }   // stats is null if the call fails
```

Memories are always fetched for agent id `1` (`DEFAULT_AGENT_ID`).

```bash
curl 'http://localhost:3000/api/memory?limit=5'
curl 'http://localhost:3000/api/memory?q=deployment'
```

### `GET /api/memory/config`

Reports whether memory is enabled and where the credentials come from
(`.claw/minns-config.json` vs environment).

```jsonc
{
  "enabled": true,
  "source": "env",          // "env" | "stored" | "none"
  "hasApiKey": true,
  "maskedKey": "****a91f",
  "projectId": "proj_123"
}
```

```bash
curl http://localhost:3000/api/memory/config
```

### `POST /api/memory/config`

Writes `.claw/minns-config.json`.

**Request body** — `{ "apiKey": string, "projectId"?: string }` (`projectId` defaults to `""`).

`400` `{"error":"API key is required"}` when `apiKey` is falsy, otherwise
`{ "success": true }`.

> The Minns client caches its config on first use in a module-level variable. Changing the
> stored config takes effect on the next server start.

```bash
curl -X POST http://localhost:3000/api/memory/config \
  -H 'Content-Type: application/json' \
  -d '{"apiKey":"minns_…","projectId":"proj_123"}'
```

### `DELETE /api/memory/config`

Deletes `.claw/minns-config.json`. Always returns `{ "success": true }`, including when the
file was already gone.

```bash
curl -X DELETE http://localhost:3000/api/memory/config
```

---

## Channels & Webhooks

### `GET /api/channels`

Status for all five channels, plus the effective timeout configuration. Webhook URLs are
derived from the request's own origin.

```jsonc
{
  "channels": {
    "slack":    { "enabled": true,  "webhookUrl": "http://localhost:3000/api/webhooks/slack",    "activeSessions": 0, "fields": { "token": {…}, "secret": {…} } },
    "discord":  { "enabled": false, "webhookUrl": "…/api/webhooks/discord",  "activeSessions": 0, "fields": { … } },
    "gchat":    { "enabled": false, "webhookUrl": "…/api/webhooks/gchat",    "activeSessions": 0, "fields": { … } },
    "telegram": { "enabled": true,  "webhookUrl": "…/api/webhooks/telegram", "activeSessions": 3, "fields": { … } },
    "whatsapp": { "enabled": false, "webhookUrl": "…/api/webhooks/whatsapp", "activeSessions": 0, "fields": { … } }
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

Each `fields` entry is `{ set: boolean, source: "env" | "stored" | "none", masked: string }`.
`activeSessions` is always `0` for Slack, Discord, and Google Chat because the Chat SDK
manages their session state; only Telegram and WhatsApp use the in-process session store.
The Telegram/WhatsApp counts come from that in-memory store, so they reset on restart.

```bash
curl http://localhost:3000/api/channels
```

### `POST /api/channels`

Saves credentials for one channel into `.claw/channels.json` and invalidates the cache.

**Request body** — `{ "channel": "telegram"|"slack"|"whatsapp"|"discord"|"gchat", "config": Record<string,string> }`.
The `config` object **replaces** any previously stored config for that channel. Recognised
keys are `token`, `secret`, and (WhatsApp only) `phoneNumberId`.

`400` `{"error":"Invalid channel"}` for an unknown channel, otherwise `{ "success": true }`.

```bash
curl -X POST http://localhost:3000/api/channels \
  -H 'Content-Type: application/json' \
  -d '{"channel":"telegram","config":{"token":"123:ABC","secret":"my-secret"}}'
```

### `DELETE /api/channels`

Clears the stored config for a channel. Body is `{ "channel": string }` (same validation as
POST). Environment-provided credentials are unaffected.

```bash
curl -X DELETE http://localhost:3000/api/channels \
  -H 'Content-Type: application/json' \
  -d '{"channel":"telegram"}'
```

### `POST /api/webhooks/telegram`

Telegram Bot API webhook. Verifies the `X-Telegram-Bot-Api-Secret-Token` header against the
configured secret (when no secret is configured, all requests are allowed). Only text
messages are handled; anything else is acknowledged with `{ "ok": true }`.

Built-in commands: `/start` sends a greeting, `/clear` wipes the channel session.
Other text runs through `handleChatBlocking` and the reply is sent back as MarkdownV2, split
into Telegram-sized chunks (falling back to plain text if MarkdownV2 is rejected).

**Status codes** — `200` `{"ok":true}`; `503` `{"error":"Telegram not configured"}`;
`401` `{"error":"Invalid secret"}`.

Register the webhook with:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d url=https://<YOUR_DOMAIN>/api/webhooks/telegram \
  -d secret_token=<WEBHOOK_SECRET>
```

### `GET /api/webhooks/whatsapp`

Meta webhook verification handshake. Echoes `hub.challenge` as a plain-text `200` when
`hub.mode=subscribe` and `hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN` (or the stored
secret); otherwise `403` `{"error":"Verification failed"}`.

```bash
curl 'http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=my-token&hub.challenge=12345'
```

### `POST /api/webhooks/whatsapp`

WhatsApp Cloud API message webhook. Non-message payloads (status updates and the like) are
acknowledged. Non-text messages get a canned "text only" reply. `clear` / `/clear` resets the
session. Everything else runs through `handleChatBlocking` and is sent back via the Graph API
(`v21.0`), chunked for WhatsApp's length limit.

**Status codes** — `200` `{"ok":true}`; `503` `{"error":"WhatsApp not configured"}`.

### `POST /api/webhooks/[platform]`

Catch-all route for Chat SDK–managed platforms, dispatched to `bot.webhooks[platform]` from
`lib/bot.ts`. Adapters are registered conditionally: Slack when `SLACK_BOT_TOKEN` is set,
Discord when `DISCORD_BOT_TOKEN` is set.

The static `telegram/` and `whatsapp/` routes take precedence in the App Router, so those two
never reach this handler.

Returns `404` `Unknown platform: <platform>` (plain text) when no adapter is registered.

### `GET /api/webhooks/[platform]`

Health check for a platform adapter.

`200` `{ "status": "active", "platform": "slack" }` or `404`
`{ "status": "not_configured", "platform": "slack" }`.

```bash
curl http://localhost:3000/api/webhooks/slack
```

---

## Files, Git, Workspace & Context

### `GET /api/files/[...path]`

Serves a file from `<workspace>/public/`. This is how agent-generated screenshots, PDFs, and
exports reach the browser.

**Query parameters** — `workspace` (optional absolute path; defaults to `DEFAULT_WORKSPACE`).

The resolved path is checked against `<workspace>/public` to block traversal. Content type is
looked up from the extension (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.pdf`,
`.json`, `.txt`, `.html`, `.css`, `.js`), falling back to `application/octet-stream`.
Responses are sent with `Cache-Control: public, max-age=3600`.

**Status codes** — `200` file bytes; `403` `{"error":"Forbidden"}` on traversal; `400`
`{"error":"Not a file"}` for a directory; `404` `{"error":"Not found"}`.

```bash
curl -O http://localhost:3000/api/files/screenshot.png
```

### `GET /api/git`

Git status of a directory, via `git branch --show-current` and `git status --porcelain`
(each with a 5 s timeout).

**Query parameters** — `workspace` (optional; defaults to `process.cwd()`).

```jsonc
{
  "isRepo": true,
  "branch": "main",
  "status": "dirty",              // "clean" | "dirty"
  "modified":  ["lib/foo.ts"],
  "staged":    ["docs/api.md"],
  "untracked": ["scratch.txt"]
}
```

Anything that isn't a git repo (or where the commands fail) returns `{ "isRepo": false }` with
a `200`.

```bash
curl 'http://localhost:3000/api/git?workspace=/abs/path/to/repo'
```

### `GET /api/workspace`

Validates a directory and lists its contents — used by the workspace picker. Dotfiles are
filtered out and entries are sorted directories-first, then alphabetically.

**Query parameters** — `path` (optional; defaults to `DEFAULT_WORKSPACE`). **Must be
absolute.**

```jsonc
{
  "path": "/abs/path/to/workspace",
  "valid": true,
  "entries": [ { "name": "src", "type": "directory" }, { "name": "notes.md", "type": "file" } ]
}
```

**Status codes** — `400` `{"error":"Path must be absolute"}`; `400`
`{"error":"Path is not a directory"}`; `404`
`{"error":"Directory not found or not accessible"}`.

```bash
curl 'http://localhost:3000/api/workspace?path=/abs/path/to/workspace'
```

### `GET /api/context`

Keyword search over workspace files (`lib/context/search.ts`). Same engine the agent's
`searchContext` tool uses.

**Query parameters**

| Param | Required | Notes |
|-------|----------|-------|
| `q` | yes | Search query; tokenized on non-alphanumerics, tokens of length ≤ 1 dropped |
| `workspace` | no | Defaults to `DEFAULT_WORKSPACE` |

```jsonc
{
  "files": [
    { "path": "src/server.ts", "relevantLines": ["12: export function start() {"], "score": 14 }
  ]
}
```

**Status codes** — `400` `{"error":"q query param is required"}`; `500`
`{"error":"Search failed"}`.

```bash
curl 'http://localhost:3000/api/context?q=websocket+handler'
```

---

## Terminal

### `POST /api/terminal`

Runs a bash command and streams its output over SSE. This backs the `LiveTerminal` component
that appears while an `executeBash` tool call is in flight.

Commands are checked against the same `BLOCKED_PATTERNS` list as the `executeBash` tool
(`lib/tools/bash.ts`). The workspace Python venv is ensured and its env is applied, `TERM` is
set to `dumb`, and the command is wrapped as `cd '<workspace>' && <command>`.

The hard timeout is 60 seconds (`maxDuration` on the route is 120 s). On timeout the stream
emits a stderr line and an `exit` with code `124`. Aborting the HTTP request sends `SIGINT` to
the process group, then `SIGKILL` after 3 seconds.

**Request body** — `{ "command": string, "workspacePath"?: string }`.

**Response** `200` — `text/event-stream` with `no-cache, no-transform` and
`X-Accel-Buffering: no`. Each line is `data: <json>`:

| `type` | Payload |
|--------|---------|
| `stdout` | `{ "type": "stdout", "text": "…" }` |
| `stderr` | `{ "type": "stderr", "text": "…" }` |
| `exit` | `{ "type": "exit", "code": number, "duration": number }` |

**Status codes** — `400` `{"error":"command is required"}`; `403`
`{"error":"Command matches dangerous pattern"}`.

```bash
curl -N http://localhost:3000/api/terminal \
  -H 'Content-Type: application/json' \
  -d '{"command":"ls -la && echo done"}'
```

---

## Notifications

> **In-memory only.** Notifications live in a module-level array that holds at most 100
> entries and is lost on restart. In a multi-instance deployment each instance has its own
> list.

### `GET /api/notifications`

**Query parameters** — `since` (optional epoch ms; returns only notifications with
`timestamp > since`).

**Response** — `{ "notifications": [...] }`, capped at 50 items, newest first.

```bash
curl 'http://localhost:3000/api/notifications?since=1770000000000'
```

### `POST /api/notifications`

Appends a notification. Called by the cron runner after every run.

**Request body** — all fields optional; defaults shown:

| Field | Default |
|-------|---------|
| `id` | generated |
| `type` | `"info"` — one of `cron_success`, `cron_failure`, `info` |
| `title` | `"Notification"` |
| `message` | `""` |
| `timestamp` | `Date.now()` |
| `cronJobName` | — |
| `sessionId` | — |

`read` is always stored as `false`.

**Response** `200` — `{ "ok": true, "notification": {…} }`; `400`
`{"error":"Invalid request body"}` when the body isn't valid JSON.

```bash
curl -X POST http://localhost:3000/api/notifications \
  -H 'Content-Type: application/json' \
  -d '{"type":"info","title":"Build done","message":"main @ abc1234"}'
```

### `DELETE /api/notifications`

Clears the list. Returns `{ "ok": true }`.

```bash
curl -X DELETE http://localhost:3000/api/notifications
```

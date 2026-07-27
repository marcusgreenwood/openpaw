# Configuration

Every environment variable OpenPaw reads, how it interacts with the Settings UI, where
server-side config is stored, and how to schedule crons.

Copy [`.env.example`](../.env.example) to `.env.local` (or `.env`) to get started. `.env*` is
gitignored except for `.env.example` itself.

---

## Environment variables

### AI providers

At least one is required for chat to work. Only configured providers appear in the model
selector.

| Variable | Purpose | Required |
|----------|---------|----------|
| `ANTHROPIC_API_KEY` | Claude models (`anthropic/*`) | One of these four |
| `OPENAI_API_KEY` | GPT models (`openai/*`) | One of these four |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini models (`google/*`) | One of these four |
| `MOONSHOT_API_KEY` | Kimi models (`moonshotai/*`) | One of these four |

The mapping lives in `PROVIDER_ENV_KEYS` (`lib/chat/api-keys-store.ts`). The default model is
`anthropic/claude-sonnet-4-6` (`DEFAULT_MODEL_ID`), so if you configure a different provider,
switch models with the selector in the header.

`npm run test:usage` specifically requires `GOOGLE_GENERATIVE_AI_API_KEY`.

### Memory (Minns)

| Variable | Purpose | Required |
|----------|---------|----------|
| `MINNS_API_KEY` | Enables the Minns memory layer | Optional |
| `MINNS_PROJECT_ID` | Minns project id | Optional |

Presence of an API key is what enables memory — everything memory-related is a no-op without
it.

### Channels

All optional; a channel is "enabled" when its **token** is present.

| Variable | Channel | Purpose |
|----------|---------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram | Bot token from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram | Verified against `X-Telegram-Bot-Api-Secret-Token`. **When unset, webhook requests are not verified at all.** |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp | Meta Cloud API access token |
| `WHATSAPP_VERIFY_TOKEN` | WhatsApp | Your string for the `hub.verify_token` handshake |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp | Sender phone number id; falls back to the id in the webhook payload |
| `SLACK_BOT_TOKEN` | Slack | Registers the Chat SDK Slack adapter |
| `SLACK_SIGNING_SECRET` | Slack | Request signing; consumed by the adapter |
| `DISCORD_BOT_TOKEN` | Discord | Registers the Chat SDK Discord adapter |
| `DISCORD_PUBLIC_KEY` | Discord | Interaction verification |
| `GOOGLE_CHAT_SERVICE_ACCOUNT_KEY` | Google Chat | Service account key (status/UI only — no adapter is registered in `lib/bot.ts`) |
| `GOOGLE_CHAT_PROJECT_ID` | Google Chat | Project id (status/UI only) |

`lib/bot.ts` registers adapters only for Slack and Discord. Google Chat appears in the
Channels UI and gets a webhook URL, but `POST /api/webhooks/gchat` returns `404` unless an
adapter is added.

`WHATSAPP_APP_SECRET` is referenced in a setup comment in the WhatsApp route and a
`verifyWhatsApp` HMAC helper exists in `lib/chat/verify.ts`, but no code reads that variable —
WhatsApp payload signatures are not currently verified.

### Workspace and timeouts

All read in `lib/chat/config.ts`. Timeouts are milliseconds; a non-numeric value falls back to
the default.

| Variable | Default | Purpose |
|----------|---------|---------|
| `CLAW_WORKSPACE_DIR` | `<project>/workspace` | Default workspace directory (resolved to an absolute path) |
| `CLAW_BASH_TIMEOUT_MS` | `30000` | Max runtime for one `executeBash` call |
| `CLAW_CODE_EXEC_TIMEOUT_MS` | `15000` | Max runtime for one `executeCode` snippet |
| `CLAW_SKILL_INSTALL_TIMEOUT_MS` | `60000` | Max runtime for `npx skills add` |
| `CLAW_CHAT_STREAM_TIMEOUT_MS` | `120000` | Declared for streaming chat. Note: exported but not currently referenced by the streaming route, which relies on the route's `maxDuration = 120`. |
| `CLAW_CHAT_BLOCKING_TIMEOUT_MS` | `90000` | Hard timeout for blocking (webhook) chat |
| `CLAW_MAX_TOOL_STEPS` | `15` | Default cap on agentic tool steps; a request's `maxToolSteps` overrides it |

The `/api/terminal` 60 s timeout and the `/api/chat/compare` 30 s per-model timeout are
constants in their route files and are **not** configurable.

### Python

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENPAW_PYTHON_PATH` | — | Explicit interpreter for creating the workspace venv. Tried first, ahead of the Homebrew `python@3.14` paths and `/usr/local/bin/python3`, falling back to `python3`. |

### Set by the platform

| Variable | Used for |
|----------|----------|
| `VERCEL_URL` | Base URL the cron runner posts notifications to (`https://$VERCEL_URL`) |
| `PORT` | Notification base URL fallback: `http://localhost:$PORT` (default `3000`) |

---

## Environment vs. Settings UI

Two categories of credential can be set either way. **The environment always wins.**

| Credential | Env var | Stored file | Set in UI at |
|------------|---------|-------------|--------------|
| Provider API keys | `PROVIDER_ENV_KEYS` | `.claw/api-keys.json` | Settings → API Keys |
| Channel tokens/secrets | see table above | `.claw/channels.json` | Settings → Channels |
| Minns credentials | `MINNS_*` | `.claw/minns-config.json` | Settings → Memory |

Resolution is the same shape in all three cases — `process.env.X || stored.x || ""`. Practical
consequences:

- Saving a key in the UI while the matching env var is set has no effect; the UI reports
  `source: "env"` so you can tell which one is live.
- Deleting a stored key does not remove an env var.
- Stored values are cached in-process. `/api/providers` and `/api/channels` invalidate their
  caches on write; the Minns client caches its config for the process lifetime, so changing
  memory credentials needs a restart.
- Values are only ever displayed masked (`****abcd`).

---

## Server-side file layout

Both directories sit at the project root and are gitignored. `.claw/` contains secrets — never
commit it.

```
.claw/
  api-keys.json                # { anthropic?, openai?, google?, moonshotai? }
  channels.json                # { telegram?, whatsapp?, slack?, discord?, gchat? }
  channel-sessions.json        # Telegram/WhatsApp conversation history
  crons.json                   # { jobs: CronJob[] }
  cron-sessions.json           # { sessions: [{ session, messages }] }
  workflows.json               # { workflows: Workflow[] }
  minns-config.json            # { apiKey, projectId }
  shared-sessions/
    <sessionId>.json           # { sessionId, messages, sharedAt, updatedAt, presence }

.openpaw/
  usage.json                   # { [sessionId]: UsageRecord[] }
```

All of these assume a writable, persistent filesystem. On serverless platforms the writes
succeed but do not survive between invocations — see
[Architecture → Storage model](./architecture.md#storage-model).

Client-side state (chat history, sessions, branches, theme) lives in localStorage, not here.

---

## Workspace configuration

The workspace is the directory the agent operates in: bash runs there, file tools resolve
relative to it, and skills load from it.

**Precedence** — per-request `workspacePath` (sent by the client from the sessions store) →
`CLAW_WORKSPACE_DIR` → `<project>/workspace`.

**Resolution rules** (`buildContext` in `lib/chat/handler.ts`)

1. Absolute paths are used as-is; relative paths resolve against the project root.
2. If the result equals the project root, it is forced to `<root>/workspace` — a guard so the
   agent doesn't operate on the app's own source.
3. The directory is created if missing.

**Setting it** — Settings → Workspace, the command palette's "Set workspace directory" action,
or by activating a project profile. `GET /api/workspace?path=…` validates and lists a
candidate directory (the path must be absolute); `GET /api/config` returns the server default.

**Conventions**

- `workspace/public/` is served at `/api/files/<path>`. Skills that produce screenshots, PDFs,
  or exports must write to `public/…`, never the project's Next.js `public/` folder.
- `workspace/user-skills/` is the install target for `npx skills add`.
- `workspace/.venv/` is the per-workspace Python virtualenv, created on demand.
- `workspace/.claude/skills/` is also scanned for skills.

---

## Cron scheduling

Crons only run when something calls `/api/crons/run` — the app has no internal scheduler.

**Vercel** — `vercel.json` already declares the trigger:

```json
{ "crons": [{ "path": "/api/crons/run", "schedule": "* * * * *" }] }
```

Vercel Cron issues a `GET`, which `runDueCrons` handles. Note that cron definitions live in
`.claw/crons.json` on an ephemeral filesystem, so this is not durable on Vercel without
externalizing the store.

**Self-hosted** — add a system crontab entry:

```cron
* * * * * curl -fsS -X POST https://your-app.example.com/api/crons/run >/dev/null 2>&1
```

Both verbs behave the same for the "run everything due" case.

**Due calculation** — for each enabled job, `cron-parser` computes the next occurrence
starting from `lastRunAt` (or epoch 0 for a job that has never run) and the job runs if that
time has passed. An unparseable expression yields a result with
`error: "Invalid cron expression"` rather than throwing. Running a job stamps `lastRunAt`.

**Running one immediately** — `POST /api/crons/run` with `{"id":"<cronId>"}`, or the "Run now"
button in the Crons panel. This ignores the schedule.

**Execution details** — command crons spawn `sh -c "cd '<cwd>' && <command>"` with a fixed
60 s timeout and the workspace venv env applied. Prompt crons call `handleChatBlocking`, then
persist a synthetic two-message session (`cron_<jobId>_<timestamp>`) to
`.claw/cron-sessions.json` so it shows up in the sidebar. Every run posts a best-effort
notification.

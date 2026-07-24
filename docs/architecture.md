# Architecture

How OpenPaw is put together: the module layout, the paths a message takes through
the system, where state lives, and the boundaries that constrain the agent.

For the settings referenced here, see [Configuration](configuration.md).

---

## Shape of the system

OpenPaw is a **single Next.js 16 App Router service**. There is no database, no
queue, no container, no companion process — `npm run dev` is the whole system.

That constraint explains most of the design:

- Chat history lives in the **browser** (`localStorage` via Zustand `persist`).
- Server-side configuration lives in **JSON files** under `.claw/`.
- Long-running work is bounded by **request timeouts**, not by background jobs.
- Scheduled work is driven by an **external caller** hitting `/api/crons/run`.

Every route runs on the Node.js runtime (`export const runtime = "nodejs"`), which
is required — the agent spawns subprocesses and touches the filesystem, so the Edge
runtime is not an option.

---

## Top-level layout

```
app/            Next.js App Router — pages and API routes
  api/          All server endpoints (see "API surface")
  shared/[id]/  Public read-only view of a shared session
components/     React UI, grouped by feature
lib/            All server and client logic
skills/         Built-in skills, one directory per skill
scripts/        Standalone tsx scripts (not part of the build)
types/          Shared TypeScript types
workspace/      Default agent working directory (gitignored)
.claw/          Server-side config and state (gitignored)
```

### `lib/` — the substance

| Directory | Responsibility |
|-----------|----------------|
| `lib/chat/` | The agent loop, model/message plumbing, channel session state, API-key and channel-config stores, webhook signature verification |
| `lib/tools/` | Tool implementations handed to the model |
| `lib/skills/` | Skill discovery (`loader.ts`) and install/enable management (`manager.ts`) |
| `lib/models/` | `PROVIDER_REGISTRY` and `resolveModel()` — the provider/model catalogue |
| `lib/memory/` | Minns long-term memory client, optional |
| `lib/context/` | Workspace file search used to ground answers in local code |
| `lib/crons/` | Cron definitions, the runner, and sessions created by prompt crons |
| `lib/workflows/` | Multi-step workflow definitions and persistence |
| `lib/store/` | Client-side Zustand stores (sessions, theme, branches, notifications, …) |
| `lib/usage/` | Per-session token and cost accounting |
| `lib/hooks/` | React hooks (live terminal, file attachments, configured providers, …) |
| `lib/python-sandbox.ts` | Workspace-local Python virtualenv management |
| `lib/system-prompt.ts` / `.md` | Prompt template and its assembly |

`lib/bot.ts` sits on its own: it is the Chat SDK bot instance shared by every
adapter-based platform.

---

## The agent loop

One function assembles the agent's context for every entry point:
`buildContext()` in `lib/chat/handler.ts`. It composes, in order:

1. **Skills** — `getSkills(workspace)` enumerates available skills.
2. **System prompt** — `buildSystemPrompt(skills, workspace)` renders
   `lib/system-prompt.md`, injecting the skill list and the current date/time. The
   template is cached for 10 seconds, so prompt edits appear without a restart.
3. **Memory recall** — when `isMemoryEnabled()`, `recallMemories()` fetches relevant
   memories for the latest user message and appends them to the system prompt.
4. **Workspace context** — `searchWorkspaceContext()` greps the workspace for code
   relevant to the message, so the agent answers from the actual tree instead of
   guessing.
5. **Tools** — `allTools(workspacePath, sessionId)` from `lib/tools/index.ts`.
6. **Model** — `resolveModel()` picks the provider client, with the API key resolved
   env-first by `getApiKey()`.

Two consumers wrap that shared context:

| Function | Returns | Used by |
|----------|---------|---------|
| `handleChatStreaming()` | An AI SDK `streamText` result | The browser UI, via `POST /api/chat` |
| `handleChatBlocking()` | The final assistant text | Webhook channels, which need one reply, not a stream |

Both stop on the same condition:

```ts
stopWhen: [stepCountIs(MAX_TOOL_STEPS), hasToolCall("askChoice")]
```

The step cap prevents runaway tool loops. The `askChoice` clause is the interesting
one: when the agent asks the user to pick between options, the loop halts and yields
control rather than answering on the user's behalf.

After a streaming response completes, `recordChatEvent()` writes the exchange back
to memory. The call is fire-and-forget with a swallowed rejection — memory failures
must never break a chat.

### Tools

Registered in `allTools()` (`lib/tools/index.ts`):

| Tool | Source | Notes |
|------|--------|-------|
| `executeBash` | `lib/tools/bash.ts` | Runs in the workspace, subject to `BASH_TIMEOUT_MS` |
| `readFile`, `writeFile`, `listDirectory`, `createDirectory` | `lib/tools/filesystem.ts` | All paths resolved relative to the workspace |
| `executeCode` | `lib/tools/execute-code.ts` | JS/TS, plus Python through the workspace venv |
| `askChoice` | `lib/tools/ask-choice.ts` | Renders clickable options; terminates the step loop |
| `createCron`, `updateCron`, `deleteCron`, `listCrons` | `lib/tools/cron.ts` | Lets the agent manage its own schedule |
| `searchContext` | `lib/tools/context.ts` | On-demand workspace search |
| `saveMemory`, `recallMemory`, `listMemories` | `lib/tools/memory.ts` | Bound to the session ID; inert without Minns |

Tools are constructed per request with the workspace path already bound, so a tool
can never be pointed at a directory the request did not ask for.

### Skills

`lib/skills/loader.ts` scans four directories in priority order:

1. `skills/` — built-in, at the project root
2. `user-skills/` — legacy install location at the project root
3. `<workspace>/user-skills/` — the current install target for `npx skills add`
4. `<workspace>/.claude/skills/` — Claude Code skills

Built-in skills win name conflicts. Each skill is a directory with a `SKILL.md`
whose YAML frontmatter is parsed by `gray-matter`. Skills are prompt-level
extensions — they add instructions and conventions, not new tool code.

One convention matters for correctness: skills that produce files must write to
`public/`, which maps to `workspace/public/` and is served at `/api/files/<name>`.
The project-root `public/` is the Next.js static folder and must not be used. CLI
tools that resolve paths from the project root are corrected by
`OUTPUT_PATH_REWRITE_PATTERNS` in `lib/tools/bash.ts`. See `skills/README.md`.

---

## Request flows

### Browser chat

```
ChatInterface → POST /api/chat → handleChatStreaming() → streamText
             ← SSE stream of text, tool calls and tool results ←
```

The UI renders tool activity as it arrives. While `executeBash` is in an
`input-streaming` or `input-available` state, the `LiveTerminal` component opens a
separate SSE connection to `POST /api/terminal` to show output in real time; once
the tool call resolves, the static `TerminalOutput` replaces it. The terminal route
reuses `BLOCKED_PATTERNS` from `lib/tools/bash.ts`, so the live path is subject to
the same guardrails as the tool path.

### Channel chat

Two families, split by whether the Chat SDK supports the platform:

```
Slack / Discord / Google Chat
  → POST /api/webhooks/[platform] → lib/bot.ts (Chat SDK) → buildContext() → streamText

Telegram / WhatsApp
  → POST /api/webhooks/telegram|whatsapp → lib/chat/verify.ts → handleChatBlocking()
```

Chat SDK adapters are created conditionally on their env vars in `lib/bot.ts`, so an
unconfigured platform is absent rather than broken. The bot subscribes to a thread on
@mention and then responds to follow-ups within it. Telegram and WhatsApp are custom
integrations: OpenPaw verifies their signatures itself, and formats replies through
`lib/chat/formatters/`, because each platform has its own markup dialect.

Channel conversations are keyed per thread and persisted to
`.claw/channel-sessions.json` — separate from browser sessions, which never leave
`localStorage`.

### Crons

```
Vercel Cron or system cron → POST /api/crons/run → lib/crons/runner.ts
  ├─ command cron → spawn bash in the workspace (with venv env applied)
  └─ prompt cron  → handleChatBlocking() → saved as a new session
                                          → POST /api/notifications (best-effort)
```

Nothing schedules itself in-process; a cron only fires when something external calls
the endpoint. Prompt crons create a browsable session so the run can be inspected
afterwards, and "Run now" in the Crons panel opens that session live.

### Workflows

`POST /api/workflows/run` executes saved multi-step workflows sequentially and
streams progress over SSE. Definitions persist to `.claw/workflows.json`; the
client-side store in `lib/store/workflows.ts` ships starter workflows such as
"Test & Fix" and "Build & Deploy".

---

## API surface

All routes are under `app/api/` and run on the Node.js runtime.

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/chat` | POST | Streaming chat (`maxDuration` 120s) |
| `/api/chat/compare` | POST | Side-by-side multi-model comparison (60s) |
| `/api/terminal` | POST | SSE bash output for `LiveTerminal` (120s) |
| `/api/crons` | GET, POST, DELETE | Cron CRUD |
| `/api/crons/run` | GET, POST | Execute due crons |
| `/api/cron-sessions` | GET, DELETE | Sessions produced by prompt crons |
| `/api/workflows` | GET, POST, PUT, DELETE | Workflow CRUD |
| `/api/workflows/run` | POST | Execute a workflow, SSE |
| `/api/skills` | GET, POST | List and install skills |
| `/api/skills/[name]` | GET, PUT, DELETE | Inspect, edit, remove one skill |
| `/api/skills/search` | GET | Search the skill ecosystem |
| `/api/providers` | GET, POST | Provider status (masked) and key storage |
| `/api/channels` | GET, POST, DELETE | Channel status, webhook URLs, credentials |
| `/api/memory` | GET | Stored memories |
| `/api/memory/config` | GET, POST, DELETE | Minns credentials |
| `/api/notifications` | GET, POST, DELETE | In-app notification feed |
| `/api/sessions/[id]/usage` | GET | Token usage and cost for a session |
| `/api/sessions/share` | GET, POST | Create and read shared session snapshots |
| `/api/files/[...path]` | GET | Serve `workspace/public/` files |
| `/api/workspace` | GET | Browse the workspace tree |
| `/api/context` | GET | Workspace context search |
| `/api/config` | GET | Client-visible runtime config |
| `/api/git` | GET | Git status for the workspace |
| `/api/webhooks/[platform]` | GET, POST | Chat SDK platforms (120s) |
| `/api/webhooks/telegram` | POST | Telegram (120s) |
| `/api/webhooks/whatsapp` | GET, POST | WhatsApp, GET is Meta's verification handshake (120s) |

Endpoints that return credentials mask them. `GET /api/providers` returns
`configured`, `source` and a masked value — never the raw key.

---

## State and persistence

Three tiers, with different durability and blast radius:

| Tier | Location | Holds | Lost when |
|------|----------|-------|-----------|
| Browser | `localStorage` | Chat sessions, messages, theme, branches | Site data cleared |
| Server config | `.claw/*.json` | API keys, channel secrets, crons, workflows, memory config | Directory deleted |
| Workspace | `workspace/` | Agent-created files, installed skills, Python venv | Directory deleted |

None of the three are committed: `.gitignore` excludes `.env*`, `.claw/`,
`/workspace` and `.openpaw`.

The practical consequence is that **chat history is per-browser**. It does not sync
across devices and is not recoverable from the server. Sharing a session is an
explicit action that snapshots it to `.claw/shared-sessions/`, readable at
`/shared/<id>`.

---

## Safety boundaries

The agent executes shell commands and writes files, so the boundaries are load-bearing.

- **Path traversal** — `lib/tools/filesystem.ts` resolves every path against the
  workspace and rejects any result that escapes it (`Path traversal blocked: …`).
- **Destructive commands** — `BLOCKED_PATTERNS` in `lib/tools/bash.ts` rejects
  `rm -rf /`, `sudo rm`, `mkfs`, `dd if=`, writes to `/dev/sd*`, and
  `chmod -R 777 /`. This is a guard against obvious catastrophe, not a sandbox: the
  agent otherwise runs with the privileges of the Node process.
- **Step cap** — `MAX_TOOL_STEPS` bounds the agentic loop.
- **Timeouts** — every subprocess is bounded; see [Configuration](configuration.md).
- **Webhook authentication** — Telegram uses a secret-token header and WhatsApp an
  app-secret signature, both in `lib/chat/verify.ts`; Chat SDK platforms are verified
  by their adapters.
- **Secret exclusion from search** — `DEFAULT_IGNORE` in `lib/context/search.ts`
  skips `.claw`, `.openpaw`, `.git`, `node_modules`, `.venv` and build output, so
  credentials are not fed back into the model through context search.

Run OpenPaw against a workspace you are willing to let an agent modify. The
guardrails narrow the blast radius; they do not eliminate it.

---

## Extension points

| To add… | Do this |
|---------|---------|
| A tool | Implement it in `lib/tools/`, register it in `allTools()` |
| A skill | Add a directory with `SKILL.md` under `skills/`; frontmatter supplies name and description |
| A model | Add an entry to `PROVIDER_REGISTRY` in `lib/models/providers.ts` |
| A provider | Extend `PROVIDER_REGISTRY`, `PROVIDER_ENV_KEYS` and `resolveModel()` |
| A Chat SDK channel | Create the adapter conditionally in `lib/bot.ts` |
| A custom-webhook channel | Add a route under `app/api/webhooks/`, a verifier in `lib/chat/verify.ts`, and a formatter in `lib/chat/formatters/` |
| An endpoint | Add a route under `app/api/` with `export const runtime = "nodejs"` |

---

## See also

- [Configuration](configuration.md) — every environment variable and state file
- [Contributing](../CONTRIBUTING.md) — setup, commands, conventions
- [README](../README.md) — feature overview
- `AGENTS.md` — notes for coding agents working in this repo

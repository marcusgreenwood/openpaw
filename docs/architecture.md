# Architecture

How a chat turn flows through OpenPaw, what each `lib/` module owns, and where state lives.

## Stack

Next.js 16 (App Router, React 19) with the Vercel AI SDK v6 for model access and tool calling, Zustand for client state, Tailwind v4 for styling, and plain JSON files for server-side persistence. There is no database.

---

## A chat turn, end to end

```
components/chat/ChatInterface.tsx
        │  useChat transport → POST /api/chat
        ▼
app/api/chat/route.ts                     runtime=nodejs, maxDuration=120
        │  { messages, modelId, workspacePath, sessionId, maxToolSteps }
        ▼
lib/chat/handler.ts → handleChatStreaming
        │
        ├─ buildContext()
        │    ├─ resolve workspace (absolute | project-relative; project root → <root>/workspace) and mkdir -p
        │    ├─ ensureApiKeysLoaded() + getApiKey() per provider   (env beats .claw/api-keys.json)
        │    ├─ resolveModel(modelId, apiKeys)                     lib/models/providers.ts
        │    ├─ getSkills(workspace) → buildSystemPrompt()         lib/skills/*, lib/system-prompt.md
        │    ├─ allTools(workspace, sessionId)                     lib/tools/index.ts
        │    ├─ if memory enabled: recallMemories() → append "## Memory Context"
        │    └─ if message looks code-related: searchWorkspaceContext() → append "## Workspace Context"
        │
        ▼
streamText({ model, system, messages, tools,
             stopWhen: [stepCountIs(steps), hasToolCall("askChoice")] })
        │
        ├─ onFinish → recordUsage(...)        lib/usage/session-usage-store.ts → .openpaw/usage.json
        └─ onFinish → recordChatEvent(...)    lib/memory/minns-client.ts (fire and forget)
        │
        ▼
result.toUIMessageStreamResponse()  →  streamed UI parts
        │
        ▼
components/chat/MessageList.tsx + components/generative-ui/*
   CodeBlock · FileDiff · TerminalOutput · ChartWidget · FileTree ·
   MultipleChoice · LiveTerminal · ProcessStatus · ToolResultWrapper
```

Two details worth knowing:

- **Workspace normalisation.** If the resolved workspace equals the project root, it is redirected to `<root>/workspace`. This guard is duplicated in `buildContext`, `/api/chat/compare` and `/api/context`.
- **`askChoice` ends the turn.** It is listed in `stopWhen`, so the model cannot ask a question and keep working — the user's click starts the next turn.

### Blocking variant

`handleChatBlocking(messages, modelId, workspacePath)` is the same context builder wrapped around `generateText`, raced against `CHAT_BLOCKING_TIMEOUT_MS` (90 s). It returns `{ text, toolCalls, finishReason, durationMs }` and is what the Telegram and WhatsApp webhooks call, since those platforms need one complete reply rather than a stream.

---

## Module map

| Module | Responsibility |
|---|---|
| `lib/chat/` | `handler.ts` (shared agent loop), `config.ts` (workspace, timeouts, channel config), `api-keys-store.ts`, `channel-config-store.ts`, `session-store.ts` (channel sessions), `verify.ts` (webhook signatures), `formatters/` (per-platform text formatting), `client-messages.ts` |
| `lib/models/` | `providers.ts` — `PROVIDER_REGISTRY`, `ALL_MODELS`, `resolveModel()` |
| `lib/tools/` | The 15 agent tools and `allTools()`. See [tools.md](./tools.md) |
| `lib/skills/` | `loader.ts` (scan + parse `SKILL.md`), `manager.ts` (10 s cache, `npx skills add` install) |
| `lib/crons/` | `cron-store.ts` (CRUD), `runner.ts` (due-job evaluation and execution), `cron-sessions.ts` (sessions produced by prompt crons) |
| `lib/workflows/` | `types.ts`, `workflow-store.ts`. See [workflows.md](./workflows.md) |
| `lib/memory/` | `minns-client.ts` + `index.ts` re-exports — long-term memory over the Minns SDK |
| `lib/context/` | `search.ts` — `searchWorkspaceContext()`, keyword/filename scoring over workspace files |
| `lib/store/` | Client-side Zustand stores (sessions, branches, workflows, theme, notifications, compare, audit-log, cat, pending-message) |
| `lib/usage/` | `session-usage-store.ts` — per-session token counts and cost via `llm-cost-utils` |
| `lib/hooks/` | React hooks: configured providers, file attachments, live terminal, cat reactions |
| `lib/bot.ts` | Chat SDK bot instance and event handlers for Slack/Discord |
| `lib/python-sandbox.ts` | Per-workspace `.venv` creation and env injection |
| `lib/system-prompt.ts` / `.md` | System prompt template plus workspace and skill sections, cached 10 s |

---

## State: client vs. server

The split is not obvious from the file tree, so it is worth stating plainly.

**Client (browser `localStorage`, via Zustand `persist`).** Chat sessions and their full message history, branches, theme, and workflow definitions. Keys: `openpaw-sessions`, `openpaw-branches`, `openpaw-theme`, `openpaw-workflows`. The server never sees these except as request bodies.

**Server (JSON files on disk).** Credentials, crons, cron-produced sessions, channel sessions, shared sessions, and usage. See the [state-file table](./configuration.md#server-side-state-files).

Consequences:

- Clearing browser storage loses your chat history; it is not recoverable from the server.
- Crons and channel sessions survive a browser reset but not a serverless redeploy.
- Some state exists on **both** sides with no synchronisation — most notably workflows, where the UI reads `localStorage` and `.claw/workflows.json` is written only by direct `/api/workflows` calls.

---

## Skills

`lib/skills/loader.ts` scans four directories in priority order and dedupes by skill name — **first directory wins**:

1. `<project>/skills/` — built-in (`agent-browser`, `bash`, `coding`, `find-skills`, `scheduled-tasks`, `skill-manager`)
2. `<project>/user-skills/` — legacy install location
3. `<workspace>/user-skills/` — the primary install target (`USER_SKILLS_DIR`)
4. `<workspace>/.claude/skills/` — Claude Code layout, e.g. from `npx skills add`

Each skill is a directory containing `SKILL.md` with YAML front matter. `name` and `description` are required; entries without them are skipped silently, as are unreadable or malformed files. The body is stripped of HTML tags and truncated to 4 000 characters before being embedded in the system prompt.

`source` is `"built-in"` for skills from `skills/` and `"user"` for the other three roots — this is what makes built-in skills read-only in `PUT`/`DELETE /api/skills/[name]`.

Installation (`installSkill`) runs `npx skills add <name> --agent claude-code --copy -y` in a temp directory, then copies `<tmp>/.claude/skills/*` into `<workspace>/user-skills/` and clears the cache.

---

## Multi-channel path

Two distinct mechanisms share the same agent:

**Chat SDK platforms (Slack, Discord).** `lib/bot.ts` constructs a `Chat` instance, registering adapters only when the corresponding bot token is present. `/api/webhooks/[platform]` looks the platform up in `bot.webhooks` and delegates. The bot subscribes to a thread on `@mention`, then answers every follow-up via `onSubscribedMessage`. It fetches up to 30 messages of platform-side thread history for context, calls `buildContext("anthropic/claude-sonnet-4-6")`, and streams `result.textStream` back through `thread.post`. Thread state uses the in-memory Chat SDK state adapter. There is also an `onAction("clear")` handler and a `/claw` slash command.

**Custom webhooks (Telegram, WhatsApp).** Static routes that take precedence over the dynamic `[platform]` segment. They verify the request themselves (`lib/chat/verify.ts`), maintain their own sessions in `lib/chat/session-store.ts` keyed by `<channel>:<userId>`, call `handleChatBlocking`, then format and send the reply through the platform's HTTP API.

Telegram verification compares the `X-Telegram-Bot-Api-Secret-Token` header against the configured secret — and **allows all requests when no secret is configured**. WhatsApp's `verifyWhatsApp()` HMAC helper is implemented but not wired into the POST handler.

---

## Cron execution

Crons do not run on a timer inside the app. `/api/crons/run` must be invoked externally: `vercel.json` registers a Vercel Cron hitting it every minute, and self-hosted deployments need a system crontab entry.

`runDueCrons()` in `lib/crons/runner.ts` skips disabled jobs, then parses each `schedule` with `cron-parser` starting from `lastRunAt` (epoch 0 for a job that has never run) and skips anything whose next occurrence is still in the future. An unparseable expression is reported as `{ success: false, error: "Invalid cron expression" }` rather than throwing.

- **`command` jobs** run via `sh -c "cd '<cwd>' && <command>"` with a 60 s timeout, inheriting the workspace virtualenv env when one exists.
- **`prompt` jobs** call `handleChatBlocking` in-process with a fresh session id (`cron_<jobId>_<timestamp>`), then persist the user/assistant pair to `.claw/cron-sessions.json` so the browser can load the resulting conversation.

Either way `lastRunAt` is updated afterwards and a best-effort notification is POSTed to `/api/notifications` — this is the only place that needs an absolute self-URL, built from `https://$VERCEL_URL` when set and `http://localhost:$PORT` otherwise.

`runCronById()` (the "Run now" button and `POST /api/crons/run` with an `id`) bypasses both the schedule check and the `enabled` flag, running the job immediately.

---

## UI entry points

`app/page.tsx` composes `Header`, `Sidebar`, `ChatInterface` and `CommandPalette` (⌘K / Ctrl-K), plus a `CatAvatar`. `app/shared/[id]/page.tsx` is the public read-only view for shared sessions and reads `.claw/shared-sessions/` directly on the server.

The sidebar hosts `CronsPanel`, `GitStatus` and `WorkflowsPanel`. The header hosts `ModelSwitcher`, `NotificationBell`, `ProjectSwitcher` and `SettingsModal`. Inside the chat, `CompareMode` drives `/api/chat/compare`, `VoiceInput` feeds the input bar, and `PresenceIndicator` reflects viewers of a shared session.

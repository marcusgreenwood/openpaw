# Architecture

OpenPaw is a single Next.js 16 (App Router) service. No database, no queue, no external
infrastructure — server state is a handful of JSON files on disk, and client state is
localStorage.

---

## Module map

```
app/
  page.tsx              # Single-page chat shell: Header + Sidebar + ChatInterface + CommandPalette + CatAvatar
  layout.tsx            # Root layout
  shared/[id]/          # Server-rendered read-only view of a shared session
  api/                  # 26 route handlers — see docs/api.md

components/
  chat/                 # ChatInterface, MessageList, MessageBubble, InputBar, BranchSelector,
                        # CompareMode, VoiceInput, FileDropZone/FileChips, ToolApproval,
                        # SharedSessionView, PresenceIndicator, ModelPickerDialog, Markdown
  layout/               # Header, Sidebar, CommandPalette, CronsPanel, SettingsModal,
                        # NotificationBell, ToolAuditLog, GitStatus, ModelSwitcher,
                        # ProjectSwitcher, TemplatesGrid
  generative-ui/        # CodeBlock, FileDiff, FileTree, TerminalOutput, LiveTerminal,
                        # ChartWidget, MultipleChoice, ProcessStatus, ToolResultWrapper
  workflows/            # WorkflowsPanel, WorkflowEditor, WorkflowRunner
  skills/               # SkillCard, SkillEditor, SkillMarketplace
  settings/             # ProviderKeysPanel, MemorySettings
  channels/             # ChannelsPanel, ChannelCard
  cat/                  # CatAvatar, CatFace
  ui/                   # Button, Badge, GlassCard, ThemeToggle

lib/
  chat/                 # handler.ts (the core), config.ts, api-keys-store.ts,
                        # channel-config-store.ts, session-store.ts, client-messages.ts,
                        # verify.ts, formatters/
  models/providers.ts   # PROVIDER_REGISTRY, ALL_MODELS, DEFAULT_MODEL_ID, resolveModel()
  tools/                # bash, filesystem, execute-code, ask-choice, cron, memory, context
  skills/               # loader.ts (SKILL.md parsing), manager.ts (cache + install)
  crons/                # cron-store.ts, runner.ts, cron-sessions.ts
  workflows/            # types.ts, workflow-store.ts
  memory/               # minns-client.ts, index.ts
  context/search.ts     # Workspace keyword search
  usage/                # session-usage-store.ts (tokens + cost)
  store/                # Zustand stores: sessions, branches, compare, workflows,
                        # notifications, audit-log, cat, theme, pending-message
  hooks/                # useLiveTerminal, useFileAttachments, useCatReactions,
                        # use-configured-providers
  system-prompt.ts/.md  # Prompt template + assembly
  bot.ts                # Chat SDK bot (Slack/Discord adapters)
  python-sandbox.ts     # Per-workspace .venv management
  public-file-url.ts, utils.ts

types/index.ts          # Skill, ModelConfig, Session, ProjectProfile
scripts/                # test-usage.ts, test-screenshot.ts
skills/                 # Built-in skills (SKILL.md per directory)
workspace/              # Default working directory for the agent
```

---

## Chat request lifecycle

Traced from `components/chat/ChatInterface.tsx` → `app/api/chat/route.ts` →
`lib/chat/handler.ts`.

### 1. Client sends

`ChatInterface` uses `useChat` from `@ai-sdk/react` with a `DefaultChatTransport` pointed at
`/api/chat`. The transport's `body` callback reads the Zustand session store **at send time**,
so the request always carries the current `modelId`, `workspacePath`, `activeSessionId`, and
`maxToolSteps`.

File attachments are not sent as a separate multipart field — `useFileAttachments`
serializes them into the message text (fenced code blocks for text files, base64 data URLs for
images) and prepends them to the typed input.

### 2. Route unpacks

`app/api/chat/route.ts` destructures `messages`, `modelId` (default
`anthropic/claude-sonnet-4-5`), `workspacePath`, `sessionId`, and `maxToolSteps`, then calls
`handleChatStreaming`.

### 3. `buildContext` assembles everything

`lib/chat/handler.ts` → `buildContext()`:

1. **Workspace resolution.** Take `workspacePath`, or `DEFAULT_WORKSPACE`. Relative paths
   resolve against the project root. If the result would be the project root itself, it is
   forced to `<root>/workspace` — a guard against the agent operating on the app's own source
   tree. The directory is created if missing.
2. **API keys.** `ensureApiKeysLoaded()` reads `.claw/api-keys.json` once into a module cache;
   `getApiKey(provider)` prefers the environment variable and falls back to the stored value.
3. **Model resolution.** `resolveModel(modelId, apiKeys)` splits `provider/model` and
   constructs the matching AI SDK provider (`@ai-sdk/anthropic`, `-openai`, `-google`,
   `-moonshotai`). An unknown provider throws.
4. **Skills.** `getSkills(workspace)` loads every `SKILL.md` (10 s cache) — see
   [Skill Authoring](./skills.md).
5. **System prompt.** `buildSystemPrompt(skills, workspace)` reads `lib/system-prompt.md`
   (10 s cache) and substitutes `{{CURRENT_DATETIME}}`, `{{WORKSPACE_SECTION}}`, and
   `{{SKILL_BLOCKS}}`. Each skill contributes a `### name` / description / body block.
6. **Tools.** `allTools(workspace, sessionId)` binds every tool to the resolved workspace.
7. **Memory injection** (only when Minns is configured and there is a last user message).
   `recallMemories(query)` returns claims, memories, and strategies; up to 5 / 3 / 2 of each
   are appended to the system prompt under `## Memory Context`. Failures are swallowed.
8. **Workspace context injection** (only when the last user message matches
   `looksCodeRelated` — a substring test against ~60 code keywords). Runs
   `searchWorkspaceContext(msg, workspace, 3, 200)` and appends the top files and matching
   lines under `## Workspace Context`. Failures are swallowed.

### 4. Streaming and the tool loop

`streamText()` runs with `stopWhen: [stepCountIs(steps), hasToolCall("askChoice")]`. The
model may call tools repeatedly, up to `maxToolSteps` (default `MAX_TOOL_STEPS` = 15,
overridable per request or via `CLAW_MAX_TOOL_STEPS`). Calling `askChoice` stops the loop
immediately so the UI can render clickable options and wait for the user.

### 5. `onFinish`

- `recordUsage(sessionId, modelId, totalUsage, providerMetadata)` writes a record to
  `.openpaw/usage.json` via `llm-cost-utils`. Unknown models still record tokens with a `$0`
  cost.
- `recordChatEvent(...)` sends the exchange plus the list of tool names to Minns for episodic
  memory and claim extraction (fire-and-forget; a no-op when memory is off).

### 6. Client renders and persists

`MessageBubble.renderToolPart` switches on the AI SDK tool-part state:

| State | Rendering |
|-------|-----------|
| `input-streaming` / `input-available` | `LiveTerminal` for `executeBash` (streams from `/api/terminal`), otherwise `ProcessStatus` |
| `output-error` | `ProcessStatus` in the error state |
| `output-available` | Tool-specific generative UI — `TerminalOutput`, `FileDiff`, `FileTree`, `CodeBlock`, `MultipleChoice`, chart widgets |

Assistant text is rendered as Markdown, with `<!--html-->…<!--/html-->` blocks rendered as
sanitized Tailwind HTML and `data-chart-*` divs upgraded to Tremor charts.

Messages are written to localStorage when the message count changes or when `status`
transitions to `ready`. On the `ready` transition the session title is re-derived from the
first five messages and an `openpaw-chat-complete` window event is dispatched.

### Blocking variant

Webhook channels can't stream, so `handleChatBlocking(messages, modelId, workspacePath)` uses
`generateText` with the same context, raced against `CHAT_BLOCKING_TIMEOUT_MS` (default 90 s).
It returns `{ text, toolCalls, finishReason, durationMs }`. Telegram, WhatsApp, and the cron
prompt runner all use it. The Chat SDK bot (`lib/bot.ts`) is the exception — it calls
`buildContext` directly and streams into the platform thread.

---

## Tools

`lib/tools/index.ts` returns the full tool set, all bound to the resolved workspace:

| Tool | Source | Notes |
|------|--------|-------|
| `executeBash` | `bash.ts` | `BLOCKED_PATTERNS` guard, `BASH_TIMEOUT_MS` (30 s), kills the process group on timeout (exit `124`), output truncated to 50 KB stdout / 10 KB stderr |
| `readFile` / `writeFile` | `filesystem.ts` | `safeResolve` blocks traversal outside the workspace; reads truncate at 100 KB; writes create parent dirs and return `previousContent` for diffing |
| `listDirectory` / `createDirectory` | `filesystem.ts` | Same traversal guard |
| `executeCode` | `execute-code.ts` | JS via `node`, TS via `npx tsx`, Python via the workspace venv; runs from a temp dir; `CODE_EXEC_TIMEOUT_MS` (15 s) |
| `askChoice` | `ask-choice.ts` | 1–10 options; stops the tool loop |
| `createCron` / `updateCron` / `deleteCron` / `listCrons` | `cron.ts` | Thin wrappers over `lib/crons/cron-store.ts` |
| `searchContext` | `context.ts` | `searchWorkspaceContext(query, workspace, 5, 500)` |
| `saveMemory` / `recallMemory` / `listMemories` | `memory.ts` | No-ops when Minns isn't configured |

### Safety boundaries

- **Path traversal** — `safeResolve` in `filesystem.ts` rejects any path escaping the
  workspace; `/api/files` performs the equivalent check against `<workspace>/public`.
- **Dangerous commands** — `BLOCKED_PATTERNS` (`rm -rf /`, `sudo rm`, `mkfs`, `dd if=`,
  `> /dev/sd*`, `chmod -R 777 /`) is enforced by both `executeBash` and `/api/terminal`.
- **Output path rewriting** — `OUTPUT_PATH_REWRITE_PATTERNS` rewrites relative output paths
  for CLI tools that resolve from the project root (currently `agent-browser screenshot` and
  `agent-browser pdf`) so their files land in `workspace/public/`.
- **Python isolation** — `lib/python-sandbox.ts` creates `<workspace>/.venv` on demand and
  injects `VIRTUAL_ENV` + `PATH`, so `pip install` stays inside the workspace.

### Approval path

`components/chat/ToolApproval.tsx` renders an approve/deny card and writes an
`approved` / `denied` entry to the audit-log store. A `toolApprovalMode` toggle exists in the
sessions store and in Settings.

**As of this commit the approval card is not wired into the message render path** — nothing
imports `ToolApproval`, so tools execute without a gate regardless of the toggle, and the
audit log stays empty. Treat both as scaffolding for a feature that is not yet complete.

---

## Storage model

Two independent halves that never sync with each other.

### Browser (client state)

Zustand + `persist`, plus raw localStorage for messages.

| Key | Written by | Contents |
|-----|-----------|----------|
| `openpaw-sessions` | `lib/store/sessions.ts` | `sessions`, `activeSessionId`, `modelId`, `workspacePath`, `maxToolSteps`, `templates`, `toolApprovalMode`, `projects`, `activeProjectId`. `cronSessions` is deliberately **not** persisted — it is refetched from `/api/cron-sessions`. |
| `openpaw-branches` | `lib/store/branches.ts` | `branches` and `activeBranch`, both keyed by session id |
| `openpaw-workflows` | `lib/store/workflows.ts` | `workflows` only; `activeRun` is transient |
| `openpaw-theme` | `lib/store/theme.ts` | `theme` (`dark` \| `light` \| `system`) |
| `openpaw-messages-<sessionId>` | `lib/chat/client-messages.ts` | The message array for a session's main line |
| `openpaw-messages-<sessionId>:<branchId>` | `lib/chat/client-messages.ts` | The message array for one branch |

`sessionStorage` holds one key: `openpaw-viewer-id`, the per-tab viewer identity used for
presence on shared sessions.

**Not persisted** (in-memory Zustand, gone on reload): `compare`, `notifications`,
`audit-log`, `cat`, and the `pending-message` module.

### Server (`.claw/` and `.openpaw/`)

Plain JSON files under the project root. Both directories are gitignored — `.claw/` holds
secrets.

| File | Module | Contents |
|------|--------|----------|
| `.claw/api-keys.json` | `lib/chat/api-keys-store.ts` | Provider API keys saved from Settings |
| `.claw/channels.json` | `lib/chat/channel-config-store.ts` | Per-channel `token` / `secret` / `phoneNumberId` |
| `.claw/channel-sessions.json` | `lib/chat/session-store.ts` | Telegram/WhatsApp conversation history (dev convenience dump of the in-memory map) |
| `.claw/crons.json` | `lib/crons/cron-store.ts` | `{ jobs: CronJob[] }` |
| `.claw/cron-sessions.json` | `lib/crons/cron-sessions.ts` | `{ sessions: [{ session, messages }] }` produced by prompt crons |
| `.claw/workflows.json` | `lib/workflows/workflow-store.ts` | `{ workflows: Workflow[] }` |
| `.claw/minns-config.json` | `lib/memory/minns-client.ts` | `{ apiKey, projectId }` |
| `.claw/shared-sessions/<id>.json` | `app/api/sessions/share` | `{ sessionId, messages, sharedAt, updatedAt, presence }` |
| `.openpaw/usage.json` | `lib/usage/session-usage-store.ts` | `{ [sessionId]: UsageRecord[] }` |

### Consequences of the split

- **Chat history is per browser.** It is never uploaded, so it does not survive clearing site
  data and does not follow you to another device. Sharing a session is an explicit copy into
  `.claw/shared-sessions/`.
- **Webhook channels keep their own history** in an in-process `Map` keyed by
  `channel:externalUserId`, capped at the last 50 messages, mirrored to
  `.claw/channel-sessions.json` on write.
- **Serverless is lossy.** Every server-side store assumes a writable, persistent filesystem.
  On Vercel, `.claw/` and `.openpaw/` writes land on ephemeral storage, and the in-memory
  notification list and channel session map are per-instance.
- **Workflows exist in both halves.** `/api/workflows` persists to `.claw/workflows.json`,
  while the sidebar `WorkflowsPanel` reads and writes `openpaw-workflows` in localStorage.
  Only the *run* endpoint is shared.

---

## SSE streaming paths

Three streams, three different wire formats.

| Endpoint | Format | Consumer |
|----------|--------|----------|
| `/api/chat` | AI SDK UI message stream | `useChat` in `ChatInterface` |
| `/api/terminal` | `data: {"type":"stdout"\|"stderr"\|"exit", …}` | `useLiveTerminal` → `LiveTerminal` |
| `/api/workflows/run` | Named events: `event: step-start` / `step-complete` / `run-complete` | `WorkflowsPanel.processSSEEvent` |

Both hand-rolled consumers (`useLiveTerminal`, `WorkflowsPanel`) read the response body with a
`ReadableStream` reader, decode incrementally, split on `\n`, and keep the trailing partial
line in a buffer. Both support cancellation via `AbortController`; aborting `/api/terminal`
signals the server, which `SIGINT`s the process group and escalates to `SIGKILL` after 3 s.

`/api/terminal` sets `X-Accel-Buffering: no` and `Cache-Control: no-cache, no-transform` so
proxies don't buffer the stream.

---

## Request paths that are not chat

- **Cron scheduling** — `vercel.json` calls `GET /api/crons/run` every minute. `runDueCrons`
  parses each job's schedule with `cron-parser` starting from `lastRunAt` (or epoch 0) and
  runs anything due. Command crons spawn `sh -c` with a 60 s timeout; prompt crons call
  `handleChatBlocking`, then write a synthetic two-message session to
  `.claw/cron-sessions.json` under the id `cron_<jobId>_<timestamp>`. Every run POSTs a
  notification.
- **Chat SDK platforms** — `lib/bot.ts` builds a `Chat` instance with the Slack and Discord
  adapters (registered only when their env tokens are present) and an in-memory state
  adapter. On `@mention` it subscribes to the thread; on every subsequent message it fetches
  up to 30 messages of platform history, builds agent context with
  `anthropic/claude-sonnet-4-6`, and streams the reply back into the thread.

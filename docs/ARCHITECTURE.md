# OpenPaw Architecture

OpenPaw is a single-service Next.js 16 (App Router) application. There is no
database, no queue, and no container runtime — state lives either in JSON files
under `.claw/` on the server or in the browser's `localStorage`. This document
maps the modules, traces a chat request end to end, and explains which state lives
where.

For the endpoint-by-endpoint contract, see [API.md](./API.md).

---

## Top-level layout

```
app/          Next.js routes — the UI page, the shared-session page, and all REST handlers
components/   React UI, grouped by feature area
lib/          All non-UI logic: chat, tools, skills, crons, workflows, memory, stores
skills/       Built-in skills shipped with the app (markdown + frontmatter)
types/        Shared TypeScript types (Session, Skill, ModelConfig, ProjectProfile, …)
workspace/    Default working directory for the agent
docs/         This reference documentation
```

There are exactly three rendered routes: `app/page.tsx` (the chat app),
`app/shared/[id]/page.tsx` (read-only shared session view), and `app/layout.tsx`
(which inlines a small script that reads `openpaw-theme` from `localStorage` to
avoid a theme flash on first paint). Everything else under `app/api/` is a route
handler.

---

## Module map (`lib/`)

| Module | Responsibility |
|--------|----------------|
| `lib/chat/` | The core of the app. `handler.ts` builds context and runs the model; `config.ts` holds workspace defaults, timeouts, and channel enablement; `session-store.ts` tracks webhook-channel sessions; `client-messages.ts` persists browser-side messages; `api-keys-store.ts` and `channel-config-store.ts` read/write `.claw/` credential files; `verify.ts` checks webhook signatures; `formatters/` adapt markdown to Telegram/WhatsApp. |
| `lib/tools/` | The AI tool set. `index.ts` composes every tool into one record via `allTools(workspacePath, sessionId)`. Individual tools: `bash`, `filesystem`, `execute-code`, `ask-choice`, `cron`, `memory`, `context`. |
| `lib/skills/` | `loader.ts` parses skill markdown (frontmatter + body); `manager.ts` caches the merged built-in + user skill list and shells out to the `skills` CLI to install new ones. |
| `lib/crons/` | `cron-store.ts` (CRUD over `.claw/crons.json`), `runner.ts` (decides what is due and executes it), `cron-sessions.ts` (chat sessions produced by prompt crons). |
| `lib/workflows/` | `types.ts` defines `Workflow`, `WorkflowStep`, `WorkflowRun`, `WorkflowStepResult`; `workflow-store.ts` persists workflows to `.claw/workflows.json`. Execution itself lives in the `/api/workflows/run` route. |
| `lib/memory/` | Optional long-term memory. `minns-client.ts` wraps the Minns SDK and degrades to no-ops when unconfigured; `index.ts` re-exports its public surface. |
| `lib/models/` | `providers.ts` — the model catalogue (`PROVIDER_REGISTRY`, `ALL_MODELS`, `DEFAULT_MODEL_ID`) and `resolveModel()`, which maps a `provider/model` id to an AI SDK model instance. |
| `lib/store/` | Browser-only Zustand stores (see [State and storage](#state-and-storage)). |
| `lib/usage/` | `session-usage-store.ts` — per-session token and cost accounting, persisted to `.openpaw/usage.json` with an in-memory fallback. |
| `lib/context/` | `search.ts` — dependency-free keyword search over the workspace, used both by the `searchContext` tool and by the chat handler's auto-injection. |
| `lib/hooks/` | React hooks: `use-configured-providers` (which providers have keys), `useFileAttachments` (drag-and-drop file reading), `useLiveTerminal` (SSE terminal client), `useCatReactions` (mascot mood). |
| `lib/system-prompt.ts` | Renders `lib/system-prompt.md` with the current date/time, workspace section, and skill blocks. |
| `lib/python-sandbox.ts` | Creates and activates a per-workspace Python virtualenv for bash and code execution. |
| `lib/public-file-url.ts` | Rewrites agent-written `public/…` paths into `/api/files/…` URLs. |
| `lib/bot.ts` | Chat SDK bot definition; exposes `bot.webhooks` consumed by `/api/webhooks/[platform]`. |
| `lib/utils.ts` | `cn()` class-name joiner. |

---

## Chat request data flow

```
Browser (useChat)
  │  POST /api/chat  { messages, modelId, workspacePath, sessionId, maxToolSteps }
  ▼
app/api/chat/route.ts
  │  parses the body, coerces messages to an array
  ▼
lib/chat/handler.ts  →  handleChatStreaming()
  │
  ├─ buildContext()
  │    ├─ resolve + mkdir the workspace (project root is rewritten to workspace/)
  │    ├─ ensureApiKeysLoaded()          ← env vars, then .claw/api-keys.json
  │    ├─ resolveModel(modelId, keys)    ← lib/models/providers.ts
  │    ├─ getSkills(workspace)           ← lib/skills/manager.ts
  │    ├─ buildSystemPrompt(skills, ws)  ← lib/system-prompt.ts + system-prompt.md
  │    ├─ allTools(workspace, sessionId) ← lib/tools/index.ts
  │    ├─ recallMemories(lastUserText)   ← lib/memory (only when Minns is configured)
  │    │     appends a "## Memory Context" section to the system prompt
  │    └─ searchWorkspaceContext(...)    ← lib/context/search.ts (only when the
  │          message looks code-related) appends "## Workspace Context"
  │
  └─ streamText({ model, system, messages, tools,
                  stopWhen: [stepCountIs(maxToolSteps), hasToolCall("askChoice")] })
       ├─ onFinish → recordUsage(...)      → .openpaw/usage.json
       └─ onFinish → recordChatEvent(...)  → Minns (fire-and-forget)
  ▼
result.toUIMessageStreamResponse()
  ▼
Browser — MessageList renders text, tool calls, and generative UI
  (CodeBlock, FileDiff, TerminalOutput, LiveTerminal, ChartWidget,
   MultipleChoice, FileTree, ProcessStatus)
```

Two details worth knowing:

- **`askChoice` stops the stream.** `hasToolCall("askChoice")` is a stop
  condition, so when the agent asks a multiple-choice question the run ends and
  waits for the user's click rather than continuing to reason.
- **Workspace context is heuristic.** `looksCodeRelated()` matches the user
  message against a keyword list; only then does the handler run a workspace
  search and inline up to 3 files / 200 lines into the system prompt.

### The blocking variant

Webhook channels cannot stream, so they call `handleChatBlocking()` instead. It
reuses the exact same `buildContext()` and tool set but calls `generateText`,
races it against `CHAT_BLOCKING_TIMEOUT_MS`, and returns the final text plus tool
counts and duration. This is why a Telegram or WhatsApp conversation has the same
capabilities as the browser UI.

---

## State and storage

OpenPaw deliberately splits state in two. **Nothing that the browser owns is
visible to the server, and vice versa.**

### Server side — JSON files

Configuration and anything that must outlive the browser tab is written to
`.claw/` in the project root (`process.cwd()`):

| Path | Written by | Contents |
|------|-----------|----------|
| `.claw/api-keys.json` | `lib/chat/api-keys-store.ts` | Provider API keys. Environment variables take precedence over this file. |
| `.claw/channels.json` | `lib/chat/channel-config-store.ts` | Telegram/Slack/WhatsApp/Discord/Google Chat credentials. |
| `.claw/crons.json` | `lib/crons/cron-store.ts` | Scheduled tasks. |
| `.claw/cron-sessions.json` | `lib/crons/cron-sessions.ts` | Chat sessions produced by prompt crons. |
| `.claw/workflows.json` | `lib/workflows/workflow-store.ts` | Saved workflows. |
| `.claw/minns-config.json` | `app/api/memory/config/route.ts`, read by `lib/memory/minns-client.ts` | Minns API key and project id. |
| `.claw/channel-sessions.json` | `lib/chat/session-store.ts` | Webhook-channel conversation history (dev convenience; persistence failures are ignored). |
| `.claw/shared-sessions/<id>.json` | `app/api/sessions/share/route.ts`, read by `app/shared/[id]/page.tsx` | Published session snapshots plus viewer presence. |
| `.openpaw/usage.json` | `lib/usage/session-usage-store.ts` | Per-session token usage and cost. Note the different directory. |

Two caveats for serverless deployments: `.openpaw/usage.json` falls back to
in-memory storage when the filesystem is ephemeral, and `/api/notifications`
keeps its list in a module-level array that is neither persisted nor shared
across instances.

### Browser side — Zustand and `localStorage`

All stores live in `lib/store/` and are `"use client"` modules.

| Store | Persist key | Persisted | Not persisted |
|-------|-------------|-----------|---------------|
| `sessions.ts` | `openpaw-sessions` | sessions, active session, model, workspace path, max tool steps, templates, tool-approval mode, projects, active project | `cronSessions` (refetched from the server), `sidebarOpen` |
| `branches.ts` | `openpaw-branches` | all branches and the active branch per session | — |
| `workflows.ts` | `openpaw-workflows` | user-defined workflows | `activeRun` (run state is transient) |
| `theme.ts` | `openpaw-theme` | the selected theme | derived `resolvedTheme` |
| `audit-log.ts` | — | — | entire tool audit log (in-memory, capped at 100 entries) |
| `notifications.ts` | — | — | entire notification list (in-memory, capped at 50) |
| `compare.ts` | — | — | compare-mode activation, model ids, results |
| `cat.ts` | — | — | mascot mood, message, visibility |
| `pending-message.ts` | — | — | plain module variables, not a Zustand store — a one-shot message handed to the next session |

Chat messages are **not** in a Zustand store. `lib/chat/client-messages.ts`
writes them directly to `localStorage` under `openpaw-messages-<sessionId>`, or
`openpaw-messages-<sessionId>:<branchId>` when a conversation branch is active.
That branch-aware composite key is what makes forking a conversation cheap: a new
branch is just a new key.

### The workspace

`DEFAULT_WORKSPACE` is `$CLAW_WORKSPACE_DIR` if set, otherwise
`<projectRoot>/workspace`. It is the cwd for every bash command and the root for
every file tool. Two conventions apply:

- If a requested workspace resolves to the project root, it is rewritten to
  `<projectRoot>/workspace` so the agent cannot accidentally treat the app's own
  source tree as its scratch space.
- `workspace/public/` is the publishing directory. Anything an agent writes there
  is served by `GET /api/files/<name>`, which refuses to resolve outside that
  directory. This is how screenshots, PDFs, and exports get into chat.
- `workspace/user-skills/` is the primary install target for skills added via the
  `skills` CLI. At load time the loader merges the built-in `skills/` directory
  with `<workspace>/user-skills/`, `<workspace>/.claude/skills/`, and a legacy
  `user-skills/` directory at the project root.

# OpenPaw Architecture

OpenPaw is a **single-service Next.js 16 (App Router) application**. There is no
database, no message queue, no container, and no companion service — the whole
system is one `next` process plus a handful of JSON files on disk. State lives in
two places: the browser's `localStorage` (via Zustand `persist`) and a
server-side `.claw/` directory.

Node.js 20+ is required. Every API route opts into the Node runtime
(`export const runtime = "nodejs"`) because the agent spawns child processes and
touches the filesystem.

---

## Directory map

| Path | Contents |
|------|----------|
| `app/` | App Router pages and API routes |
| `app/api/` | 26 route handlers, ~46 HTTP methods — see [api.md](./api.md) |
| `app/shared/[id]/` | Read-only viewer for shared sessions |
| `components/chat/` | `ChatInterface`, `MessageList`, `InputBar`, `CompareMode`, `ToolApproval`, … |
| `components/layout/` | `Header`, `Sidebar`, `CommandPalette`, `CronsPanel`, `SettingsModal`, `GitStatus`, … |
| `components/generative-ui/` | Renderers for code blocks, file diffs, terminal output, charts |
| `components/settings/`, `channels/`, `skills/`, `workflows/`, `cat/`, `ui/` | Feature-specific UI |
| `lib/chat/` | `handler.ts` (the agent loop), `config.ts`, session/API-key/channel stores, formatters, `verify.ts` |
| `lib/tools/` | Tool registry and implementations |
| `lib/skills/` | `loader.ts` (filesystem scan) and `manager.ts` (cache + install) |
| `lib/crons/` | `cron-store.ts`, `runner.ts`, `cron-sessions.ts` |
| `lib/workflows/` | `workflow-store.ts`, `types.ts` |
| `lib/models/providers.ts` | Provider registry and `resolveModel` |
| `lib/memory/` | Minns client wrapper (optional) |
| `lib/context/search.ts` | Keyword search over workspace files |
| `lib/usage/` | Per-session token/cost accounting |
| `lib/store/` | Zustand stores (browser state) |
| `lib/hooks/` | React hooks |
| `lib/bot.ts` | Chat SDK bot instance (Slack, Discord) |
| `lib/system-prompt.ts` + `lib/system-prompt.md` | System prompt template and assembly |
| `skills/` | Built-in skills, one directory per skill with a `SKILL.md` |
| `workspace/` | Default working directory for the agent (git-ignored) |
| `.claw/` | Server-side JSON state, including secrets (git-ignored) |
| `types/` | Shared TypeScript types |
| `scripts/` | `test-usage.ts` |

---

## Request lifecycle: a chat turn

```
 Browser                          Next.js server                     External
 ───────                          ──────────────                     ────────
 ChatInterface
   │  useChat() POST
   ▼
 /api/chat  ──────────►  lib/chat/handler.ts
                           handleChatStreaming()
                                │
                                ├─► buildContext()
                                │     ├─ resolve workspace dir (mkdir -p)
                                │     ├─ ensureApiKeysLoaded()  ← .claw/api-keys.json
                                │     ├─ resolveModel(modelId, keys)
                                │     ├─ getSkills(workspace)   ← skills/ + user-skills/
                                │     ├─ buildSystemPrompt()    ← lib/system-prompt.md
                                │     ├─ allTools(workspace, sessionId)
                                │     ├─ recallMemories()       ─────────►  Minns API
                                │     └─ searchWorkspaceContext()  (code-ish prompts only)
                                │
                                ▼
                           streamText({ model, system, messages, tools })
                                │                                ─────────►  LLM provider
                                │  ┌──────────────────────────┐
                                └─►│  agentic tool loop        │
                                   │  stopWhen:                │
                                   │   • stepCountIs(15)       │
                                   │   • hasToolCall(askChoice)│
                                   └──────────────────────────┘
                                        │ each step
                                        ├─ executeBash ──► spawn bash (venv env)
                                        ├─ read/writeFile ─► fs (traversal-guarded)
                                        ├─ executeCode ───► node / python
                                        ├─ create/updateCron ─► .claw/crons.json
                                        └─ searchContext ─► lib/context/search.ts
                                │
                                ▼  onFinish
                           recordUsage(...)        → in-memory usage store
                           recordChatEvent(...)    ─────────►  Minns API
                                │
   ◄────────────────────────────┘
 UI message stream
   │
   ▼
 MessageList + generative-ui renderers
```

### buildContext — the shared setup path

`buildContext()` in `lib/chat/handler.ts` is the single place where a model,
system prompt, and tool set are assembled. Both the streaming handler and the
blocking handler call it, which is why the browser UI and the webhook channels
behave identically.

It performs, in order:

1. **Workspace resolution.** Uses the caller's `workspacePath`, else
   `DEFAULT_WORKSPACE`. Relative paths resolve against the project root. As a
   guard, if the resolved path equals the project root it is redirected to
   `<root>/workspace` so the agent never treats the repo itself as its scratch
   directory. The directory is then created if missing.
2. **API keys.** Loads `.claw/api-keys.json` into a cache, then collects a key
   per provider with `getApiKey()` — environment variable first, stored value
   second.
3. **Model resolution.** `resolveModel(modelId, apiKeys)`.
4. **Skills.** `getSkills(workspace)` (10s cache).
5. **System prompt.** `buildSystemPrompt(skills, workspace)`.
6. **Tools.** `allTools(workspace, sessionId)`.
7. **Memory recall** (when enabled) — appends a `## Memory Context` section with
   up to 5 known facts, 3 past experiences, and 2 learned strategies.
8. **Workspace context** — only when the last user message contains one of the
   code-related keywords in `CODE_KEYWORDS`; appends a `## Workspace Context`
   section with up to 3 relevant files.

Steps 7 and 8 are wrapped in `try/catch` blocks that swallow failures: memory or
search being down degrades the prompt but never fails the request.

### Two handlers, one loop

| | `handleChatStreaming` | `handleChatBlocking` |
|---|---|---|
| Callers | `/api/chat` | Telegram + WhatsApp webhooks, cron prompt jobs, `lib/bot.ts` |
| AI SDK call | `streamText` | `generateText` |
| Returns | UI message stream | `{ text, toolCalls, finishReason, durationMs }` |
| Timeout | Route `maxDuration` (120s) | Races a hard `CHAT_BLOCKING_TIMEOUT_MS` (90s default) |
| Usage recorded | yes | no |
| Memory event recorded | yes | no |

Both stop on `stepCountIs(...)` or `hasToolCall("askChoice")` — the latter
because `askChoice` hands control back to the user, so continuing the loop would
be pointless.

---

## The tool registry

`lib/tools/index.ts` exports a single `allTools(workspacePath, sessionId)`
factory. Tools are *curried over the workspace*: each is constructed with the
resolved workspace path so it cannot be pointed elsewhere by the model.

| Tool | Module | Notes |
|------|--------|-------|
| `askChoice` | `ask-choice.ts` | Terminates the tool loop |
| `executeBash` | `bash.ts` | `BLOCKED_PATTERNS` guard, venv env, process-group kill on timeout |
| `readFile`, `writeFile`, `listDirectory`, `createDirectory` | `filesystem.ts` | All paths pass through `safeResolve` |
| `executeCode` | `execute-code.ts` | JS/TS and Python snippets |
| `createCron`, `updateCron`, `deleteCron`, `listCrons` | `cron.ts` | Write through `lib/crons/cron-store.ts` |
| `searchContext` | `context.ts` | Wraps `lib/context/search.ts` |
| memory tools | `memory.ts` | Spread in; keyed by `sessionId ?? "default"` |

**Adding a tool:** create the module in `lib/tools/`, export a factory returning
the AI SDK `tool({...})`, and add it to the object in `allTools`. No other
registration step exists.

Two safety mechanisms are worth knowing about:

- **Path traversal.** `safeResolve` in `filesystem.ts` resolves against the
  workspace and throws if the result escapes it.
- **Dangerous commands.** `BLOCKED_PATTERNS` in `bash.ts` is exported and reused
  by `/api/terminal`, so both paths enforce the same denylist.

`bash.ts` also rewrites relative output paths for CLI tools listed in
`OUTPUT_PATH_REWRITE_PATTERNS` (currently `agent-browser screenshot` and
`agent-browser pdf`), because those resolve relative paths from the project root
rather than the cwd. Rewriting them to absolute workspace paths is what keeps
generated files landing in `workspace/public/`.

---

## Skills

Skills are markdown files — no code, no plugin API. A skill is a directory
containing `SKILL.md` with YAML frontmatter (`name` and `description` are
required; `version`, `author`, `tags` optional) and a markdown body.

`lib/skills/loader.ts` scans four directories **in priority order**:

1. `skills/` — built-in, at the project root
2. `user-skills/` — legacy user installs at the project root
3. `<workspace>/user-skills/` — the primary install target
4. `<workspace>/.claude/skills/` — Claude Code skills, e.g. from `npx skills add`

The first occurrence of a name wins, so built-ins shadow user skills. Bodies are
stripped of HTML tags and capped at 4000 characters before reaching the prompt.
Skills from directories 2–4 are tagged `source: "user"` and are the only ones
the API will edit or delete.

`lib/skills/manager.ts` adds a 10s cache keyed by workspace path
(`invalidateSkillsCache()` clears it) and implements `installSkill`, which runs
`npx skills add` inside a temp directory and copies the result into
`user-skills/`.

---

## System prompt assembly

`lib/system-prompt.ts` reads `lib/system-prompt.md` (cached 10s) and substitutes
three placeholders:

| Placeholder | Filled with |
|-------------|-------------|
| `{{CURRENT_DATETIME}}` | Locale-formatted current date/time with timezone |
| `{{WORKSPACE_SECTION}}` | Workspace path plus the `public/` file convention — omitted when no workspace is passed |
| `{{SKILL_BLOCKS}}` | Skill list, file-output guidance, then each skill's name/description/body separated by `---` |

`buildContext` may then append `## Memory Context` and `## Workspace Context`
sections. To change the agent's base behavior, edit the markdown file — not the
TypeScript.

---

## Storage: browser vs. server

This split is the thing most likely to surprise a newcomer. **Chat history does
not live on the server.**

### Browser — `localStorage` via Zustand `persist`

| Store | File | Persisted |
|-------|------|-----------|
| Sessions & messages | `lib/store/sessions.ts` | yes |
| Branches | `lib/store/branches.ts` | yes |
| Theme | `lib/store/theme.ts` | yes |
| Workflows (client cache) | `lib/store/workflows.ts` | yes |
| Notifications | `lib/store/notifications.ts` | no |
| Compare mode | `lib/store/compare.ts` | no |
| Audit log | `lib/store/audit-log.ts` | no |
| Pending message | `lib/store/pending-message.ts` | no |
| Cat | `lib/store/cat.ts` | no |

Consequences: clearing site data destroys chat history; sessions do not follow a
user across browsers; and the server cannot enumerate conversations. Sharing a
session (`POST /api/sessions/share`) exists precisely because the server does not
otherwise have the messages.

### Server — JSON files in `.claw/`

| File | Written by | Contents |
|------|-----------|----------|
| `api-keys.json` | `lib/chat/api-keys-store.ts` | Provider API keys **in plaintext** |
| `channels.json` | `lib/chat/channel-config-store.ts` | Channel tokens and secrets **in plaintext** |
| `crons.json` | `lib/crons/cron-store.ts` | Scheduled tasks |
| `cron-sessions.json` | `lib/crons/cron-sessions.ts` | Sessions produced by prompt crons |
| `workflows.json` | `lib/workflows/workflow-store.ts` | Workflow definitions |
| `minns-config.json` | `lib/memory/minns-client.ts`, `/api/memory/config` | Minns API key and project ID |
| `channel-sessions.json` | `lib/chat/session-store.ts` | Telegram/WhatsApp conversation state |
| `shared-sessions/<id>.json` | `/api/sessions/share` | Shared session snapshots + presence |

`.claw/` is git-ignored because it holds secrets. It is also excluded from
workspace context search. Because these are process-local files, **the app
assumes a single long-lived instance**; on multi-instance serverless deployments
writes are not shared between instances.

### Not persisted at all

Notifications (`app/api/notifications/route.ts`) and session usage
(`lib/usage/session-usage-store.ts`) are module-level in-memory structures. They
reset on restart.

---

## Cron execution

```
 vercel.json  "* * * * *"          system cron (self-hosted)
      │                                    │
      │  GET                               │  POST
      └──────────►  /api/crons/run  ◄──────┘
                          │
                          ▼
                 lib/crons/runner.ts
                   runDueCrons(workspacePath?)
                          │
                    for each enabled job:
                      parse job.schedule from job.lastRunAt
                      skip if next-run > now
                          │
              ┌───────────┴───────────┐
        type=command              type=prompt
              │                        │
        spawn sh -c              handleChatBlocking()
        (60s timeout,                  │
         venv env)              saveCronSession()
              │                   → .claw/cron-sessions.json
              └───────────┬───────────┘
                          ▼
                 updateCron(id, { lastRunAt })
                          ▼
                 postCronNotification()
                   POST {baseUrl}/api/notifications
```

Dueness is computed from `lastRunAt`, not from wall-clock alignment: the parser
is seeded with `currentDate: lastRunAt` (or the epoch for a never-run job) and
the job fires if that next occurrence is in the past. A job that has never run is
therefore due immediately. An unparseable expression yields a failed result with
`"Invalid cron expression"` rather than throwing.

`runCronById(id)` — behind `POST /api/crons/run` with an `id`, and the "Run now"
button — bypasses the schedule check entirely.

`postCronNotification` builds its base URL from `VERCEL_URL`, falling back to
`http://localhost:${PORT || 3000}`. Delivery is best-effort; a rejected fetch is
swallowed.

---

## Channel ingress

Two distinct paths, which is why the code has two sets of webhook routes:

```
 Slack ──┐                                    ┌─► lib/bot.ts (Chat SDK)
 Discord ┼─► /api/webhooks/[platform] ────────┤     bot.webhooks[platform]
         │   (dynamic route)                  └─► buildContext + streamText
         │
 Telegram ─► /api/webhooks/telegram ──┐
                                      ├─► handleChatBlocking ─► reply via platform API
 WhatsApp ─► /api/webhooks/whatsapp ──┘
```

**Chat SDK platforms** (`lib/bot.ts`) use an event-driven model: the bot
subscribes to a thread when @mentioned and responds to follow-ups, streaming
updates every 500ms. Thread state uses the SDK's in-memory state adapter, which
is why `GET /api/channels` always reports `activeSessions: 0` for these. Adapters
are registered **at module load, conditionally on env vars** — Slack when
`SLACK_BOT_TOKEN` is set, Discord when `DISCORD_BOT_TOKEN` is set. Setting these
through the Settings UI alone will not register an adapter, and there is no
Google Chat adapter at all despite the UI exposing a gchat row.

**Custom integrations** (Telegram, WhatsApp) are hand-written request/response
handlers. They keep their own sessions in `lib/chat/session-store.ts`, call
`handleChatBlocking`, format the result for the platform
(`lib/chat/formatters/`), split it into platform-sized chunks, and POST it back.
Static routes take precedence over the dynamic `[platform]` route in the App
Router, so these are never shadowed.

Verification differs by platform: Telegram compares a secret-token header, and
Slack/Discord signature checks happen inside their adapters. The WhatsApp route
verifies only the GET subscription handshake — see the note in
[api.md](./api.md#post-apiwebhookswhatsapp).

---

## Streaming endpoints

Three endpoints stream, in two different formats:

| Endpoint | Format | Frames |
|----------|--------|--------|
| `/api/chat` | AI SDK UI message stream | Handled by `useChat` |
| `/api/terminal` | SSE, `data:` only | `{type:"stdout"\|"stderr"\|"exit"}` |
| `/api/workflows/run` | SSE with `event:` names | `step-start`, `step-complete`, `run-complete` |

`/api/terminal` sets `X-Accel-Buffering: no` so proxies do not buffer output.

---

## Provider resolution

`lib/models/providers.ts` holds `PROVIDER_REGISTRY`, a map of provider →
available models, each `{ id, name, provider, contextWindow }`. Model IDs are
namespaced (`anthropic/claude-sonnet-4-6`). `resolveModel(modelId, apiKeys)`
picks the right `@ai-sdk/*` factory and instantiates it with the resolved key.
`DEFAULT_MODEL_ID` is `anthropic/claude-sonnet-4-6`.

Only providers with a configured key appear in the model selector — the UI reads
`GET /api/providers` (via `lib/hooks/use-configured-providers.ts`).

---

## Python sandbox

`lib/python-sandbox.ts` creates and reuses a virtualenv inside the workspace.
`ensureVenv(workspace)` then `getVenvEnv(workspace)` produce environment
overrides (notably a prepended `PATH`) that are merged into the child
environment for `executeBash`, `/api/terminal`, and command crons. The effect is
that `pip install` and `python` inside the agent's shell operate on a
workspace-local environment rather than the system interpreter.
`OPENPAW_PYTHON_PATH` overrides which base interpreter is used.

---

## Design consequences worth knowing

- **No auth.** Nothing in `app/api/` checks a caller identity. `/api/terminal`
  and `executeBash` give arbitrary command execution to anyone who can reach the
  port. Run it locally, or put your own authentication in front of it.
- **Secrets are plaintext on disk.** `.claw/api-keys.json` and
  `.claw/channels.json` are unencrypted. They are git-ignored; keep them that way.
- **Single-instance assumption.** In-memory notifications/usage and file-based
  `.claw/` state do not survive horizontal scaling.
- **Prompt-crons cost money on a timer.** A prompt cron makes a real model call
  on every fire.

---

## See also

- [api.md](./api.md) — complete HTTP reference
- [configuration.md](./configuration.md) — environment variables and file layout
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — setup and development workflow

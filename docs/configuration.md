# Configuration

Environment variables, the env-vs-UI precedence rule, and the server-side state files OpenPaw writes.

## Precedence

For every credential that can be set two ways, **environment variables win**. The UI never overwrites an env var, and a provider or channel configured via env shows `source: "env"` in the API responses.

```
process.env.<VAR>   →   .claw/<store>.json   →   unset
```

This is implemented in three places, all with the same shape:

- `lib/chat/api-keys-store.ts` — `getApiKey()` checks `PROVIDER_ENV_KEYS[provider]` before the stored file
- `lib/chat/config.ts` — every `get<Channel>Config()` reads `process.env.X || stored.channel?.field || ""`
- `lib/memory/minns-client.ts` — `loadConfig()` returns the env pair immediately when `MINNS_API_KEY` is set

Stored values are cached in-process and invalidated when saved through the API. The Minns client is the exception: it caches on first use and is not invalidated, so a memory key saved through the UI takes effect on the next server start.

---

## LLM providers

Each provider maps to exactly one variable via `PROVIDER_ENV_KEYS`. Only configured providers appear in the model selector.

| Variable | Provider | Models |
|---|---|---|
| `ANTHROPIC_API_KEY` | `anthropic` | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 |
| `OPENAI_API_KEY` | `openai` | GPT-5.2, GPT-5 Mini, GPT-5 Nano, GPT-4.1 |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `google` | Gemini 3.1 Pro, Gemini 3 Pro, Gemini 3 Flash, Gemini 2.5 Pro/Flash |
| `MOONSHOT_API_KEY` | `moonshotai` | Kimi K2.5, K2 Turbo, K2 Thinking |

The full model list lives in `PROVIDER_REGISTRY` (`lib/models/providers.ts`).

### Default model: two values in the source

There is no single default model id. The codebase carries two, and only one of them is a registered model:

| Value | Where | Reached when |
|---|---|---|
| `anthropic/claude-sonnet-4-6` | `DEFAULT_MODEL_ID` (`lib/models/providers.ts:109`) | New browser sessions (`lib/store/sessions.ts`), crons without an explicit `modelId` (`lib/crons/runner.ts`), and the Chat SDK bot (`lib/bot.ts`) |
| `anthropic/claude-sonnet-4-5` | Inline parameter defaults in `app/api/chat/route.ts:11`, `lib/chat/handler.ts:205` and `:268`, and `lib/chat/session-store.ts:55` | Any caller that omits `modelId` |

**`anthropic/claude-sonnet-4-5` is not in `PROVIDER_REGISTRY`.** `resolveModel` (`lib/models/providers.ts:113`) splits the id on `/`, dispatches on the provider half, and passes the model half verbatim to the provider SDK — it never checks the registry — so an unregistered id is forwarded to Anthropic rather than rejected locally.

This is not purely theoretical. The Telegram and WhatsApp webhooks call `getOrCreateSession(channel, userId)` without a `modelId` (`app/api/webhooks/telegram/route.ts:134`, `app/api/webhooks/whatsapp/route.ts:175`), so those channels run every turn on `anthropic/claude-sonnet-4-5`. The browser path is unaffected, because the client always sends the session's `modelId`, which is seeded from `DEFAULT_MODEL_ID` — the `/api/chat` fallback is dead code for the UI.

One knock-on effect: cost accounting looks the model up by its name half in `llm-cost-utils`, and an unpriced model is caught and recorded with `costUsd: 0` (`lib/usage/session-usage-store.ts:167`), so usage on an unregistered id can show tokens but no cost.

Documented as-is rather than reconciled — this reference describes current behaviour and makes no source changes.

The UI equivalent is **Settings → API Keys** (`POST /api/providers`), which stores keys in `.claw/api-keys.json`.

---

## Channels

| Variable | Channel | Role |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Telegram | Bot token; presence enables the channel |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram | `X-Telegram-Bot-Api-Secret-Token` value. **If unset, webhook requests are not authenticated** |
| `SLACK_BOT_TOKEN` | Slack | Bot token; presence registers the Chat SDK Slack adapter |
| `SLACK_SIGNING_SECRET` | Slack | Request signing; consumed by the Chat SDK adapter |
| `DISCORD_BOT_TOKEN` | Discord | Bot token; presence registers the Chat SDK Discord adapter |
| `DISCORD_PUBLIC_KEY` | Discord | Interaction verification |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp | Cloud API token; presence enables the channel |
| `WHATSAPP_VERIFY_TOKEN` | WhatsApp | Matched against `hub.verify_token` during the Meta handshake |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp | Sending phone number id |
| `GOOGLE_CHAT_SERVICE_ACCOUNT_KEY` | Google Chat | Service account key (surfaced in the Channels UI) |
| `GOOGLE_CHAT_PROJECT_ID` | Google Chat | Project id (surfaced in the Channels UI) |

A channel counts as *enabled* when its token is non-empty (`getEnabledChannels()`).

Only Slack and Discord have Chat SDK adapters registered in `lib/bot.ts`; Google Chat has config plumbing and a UI card but no adapter, so `/api/webhooks/gchat` returns `404 { "status": "not_configured" }`.

`WHATSAPP_APP_SECRET` appears in the setup comment at the top of `app/api/webhooks/whatsapp/route.ts`, and `verifyWhatsApp()` exists in `lib/chat/verify.ts`, but nothing currently reads that variable or calls that function — WhatsApp payload signatures are not verified.

The UI equivalent is **Settings → Channels** (`POST /api/channels`), which stores credentials in `.claw/channels.json`.

---

## Memory (Minns)

| Variable | Notes |
|---|---|
| `MINNS_API_KEY` | Enables long-term memory. Its presence alone selects the env path |
| `MINNS_PROJECT_ID` | Optional project id; defaults to `""` |

UI equivalent: **Settings → Memory** (`POST /api/memory/config`) → `.claw/minns-config.json`.

When no key resolves, `isMemoryEnabled()` is `false`: the memory tools return errors, no memory context is injected into the system prompt, and `GET /api/memory` returns `{ "enabled": false }`.

---

## Runtime

| Variable | Default | Notes |
|---|---|---|
| `CLAW_WORKSPACE_DIR` | `<project>/workspace` | Resolved to an absolute path as `DEFAULT_WORKSPACE` |
| `OPENPAW_PYTHON_PATH` | — | First candidate interpreter for the workspace virtualenv, ahead of the Homebrew Python 3.14 paths and `/usr/local/bin/python3`; falls back to `python3` |
| `PORT` | `3000` | Only used to build the self-call base URL in `lib/crons/runner.ts` (Next.js itself also reads it) |
| `VERCEL_URL` | — | When set, cron runs call `https://$VERCEL_URL`; otherwise `http://localhost:$PORT` |

`PATH` is read (not set as configuration) by `lib/python-sandbox.ts` when prepending the virtualenv `bin` directory.

## Timeouts and limits

These are read dynamically through `envInt()` in `lib/chat/config.ts`, so they will not show up in a grep for `process.env.<NAME>`. All values are milliseconds except `CLAW_MAX_TOOL_STEPS`.

| Variable | Default | Controls |
|---|---|---|
| `CLAW_BASH_TIMEOUT_MS` | `30000` | `executeBash` default timeout |
| `CLAW_CODE_EXEC_TIMEOUT_MS` | `15000` | `executeCode` default timeout |
| `CLAW_SKILL_INSTALL_TIMEOUT_MS` | `60000` | `npx skills add` process timeout |
| `CLAW_CHAT_STREAM_TIMEOUT_MS` | `120000` | Declared for streaming chat |
| `CLAW_CHAT_BLOCKING_TIMEOUT_MS` | `90000` | Hard timeout for webhook (blocking) chat turns |
| `CLAW_MAX_TOOL_STEPS` | `15` | Agentic step cap per turn |

Non-numeric values fall back to the default. `CHAT_STREAM_TIMEOUT_MS` is exported but not currently referenced by the streaming path, which relies on the route's `maxDuration = 120` instead.

Two further limits are hard-coded rather than configurable: the `/api/terminal` command timeout (60 s) and the `/api/chat/compare` per-model timeout (30 s).

---

## Server-side state files

Written under `.claw/` at the project root (`process.cwd()`). **`.claw/` is listed in `.gitignore`** (`# claw config (contains channel secrets)`), so these never enter version control.

| File | Owner | Shape |
|---|---|---|
| `.claw/api-keys.json` | `lib/chat/api-keys-store.ts` | `{ anthropic?, openai?, google?, moonshotai? }` — **plaintext API keys** |
| `.claw/channels.json` | `lib/chat/channel-config-store.ts` | `{ telegram?, whatsapp?, slack?, discord?, gchat? }`, each `{ token?, secret?, … }` — **plaintext secrets** |
| `.claw/minns-config.json` | `lib/memory/minns-client.ts`, `app/api/memory/config/route.ts` | `{ apiKey, projectId }` — **plaintext API key** |
| `.claw/crons.json` | `lib/crons/cron-store.ts` | `{ jobs: CronJob[] }` |
| `.claw/cron-sessions.json` | `lib/crons/cron-sessions.ts` | `{ sessions: [{ session, messages }] }` |
| `.claw/workflows.json` | `lib/workflows/workflow-store.ts` | `{ workflows: Workflow[] }` |
| `.claw/channel-sessions.json` | `lib/chat/session-store.ts` | Map of `<channel>:<userId>` → session, including message history |
| `.claw/shared-sessions/<id>.json` | `app/api/sessions/share/route.ts`, `app/shared/[id]/page.tsx` | `{ sessionId, messages, sharedAt, updatedAt, presence }` |

One store lives outside `.claw/`:

| File | Owner | Shape |
|---|---|---|
| `.openpaw/usage.json` | `lib/usage/session-usage-store.ts` | `{ "<sessionId>": UsageRecord[] }` |

`.openpaw` is also gitignored. All of these are plain JSON on the local filesystem with no encryption and no access control beyond file permissions — treat the directory as you would a `.env` file. On serverless deployments the filesystem is ephemeral, so these stores do not survive between invocations.

## Client-side state

Chat sessions, branches, theme and workflow definitions are stored in the browser's `localStorage` via Zustand `persist`, not on the server:

| Key | Store |
|---|---|
| `openpaw-sessions` | `lib/store/sessions.ts` |
| `openpaw-branches` | `lib/store/branches.ts` |
| `openpaw-theme` | `lib/store/theme.ts` |
| `openpaw-workflows` | `lib/store/workflows.ts` |

The remaining stores under `lib/store/` (`audit-log`, `cat`, `compare`, `notifications`, `pending-message`) are in-memory only and reset on reload.

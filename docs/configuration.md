# Configuration

Every setting OpenPaw reads at runtime, where it comes from, and what happens when
it is absent.

Each entry names the file and exported symbol that reads it, so the value can be
traced back to code. Symbols are used instead of line numbers so the references
survive ordinary edits.

---

## Where configuration comes from

OpenPaw has three configuration sources, in decreasing precedence:

1. **Environment variables** — `.env.local` in development, platform env vars in
   production. Always win.
2. **`.claw/*.json`** — written by the in-app Settings UI. Server-side, gitignored.
3. **Built-in defaults** — compiled into `lib/chat/config.ts`.

For AI provider keys this precedence is explicit: `getApiKey()` in
`lib/chat/api-keys-store.ts` checks `process.env` first and only falls back to the
stored JSON. `GET /api/providers` reports which source won per provider via a
`source: "env" | "stored" | "none"` field.

Channel credentials follow the same pattern in `lib/chat/config.ts`, which merges
`process.env` over `getCachedStoredConfig()` from `lib/chat/channel-config-store.ts`.

`.env.local.example` is the starting template. Copy it to `.env.local`; `.gitignore`
excludes `.env*`, so nothing you put there is committed. The template itself is the
one deliberate exception — a `!.env.local.example` negation keeps it tracked, since
it holds only placeholders and the setup instructions depend on it existing.

---

## AI provider keys

At least one is required for chat to work. The mapping lives in `PROVIDER_ENV_KEYS`
(`lib/chat/api-keys-store.ts`); the model lists live in `PROVIDER_REGISTRY`
(`lib/models/providers.ts`).

| Variable | Provider key | Models exposed |
|----------|--------------|----------------|
| `ANTHROPIC_API_KEY` | `anthropic` | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 |
| `OPENAI_API_KEY` | `openai` | GPT-5.2, GPT-5 Mini, GPT-5 Nano, GPT-4.1 |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `google` | Gemini 3.1 Pro, Gemini 3 Pro, Gemini 3 Flash |
| `MOONSHOT_API_KEY` | `moonshotai` | Kimi models |

Only providers with a resolvable key appear in the model selector — see
`lib/hooks/use-configured-providers.ts` and `GET /api/providers`. If the default
model belongs to a provider you have not configured, switch models from the header
selector rather than editing code.

`scripts/test-usage.ts` reads `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and
`GOOGLE_GENERATIVE_AI_API_KEY` directly from the environment; the stored-key
fallback does not apply to it.

---

## Workspace

| Variable | Default | Read by |
|----------|---------|---------|
| `CLAW_WORKSPACE_DIR` | `<project root>/workspace` | `DEFAULT_WORKSPACE` in `lib/chat/config.ts` |

The workspace is the root for every file operation, bash command and code execution.
When set, the value is passed through `path.resolve()`, so relative paths resolve
against the process working directory.

The workspace can also be changed per session from **Settings → Workspace** or the
command palette; that value is sent with chat requests and overrides
`DEFAULT_WORKSPACE` for the tools bound to that request (`allTools(workspacePath)`
in `lib/tools/index.ts`).

Two workspace subdirectories are special:

- `workspace/public/` — served over HTTP at `/api/files/<filename>` by
  `app/api/files/[...path]/route.ts`. Skills that produce artifacts write here.
- `workspace/user-skills/` — install target for `npx skills add`, see
  `USER_SKILLS_DIR` in `lib/skills/loader.ts`.

`/workspace` is gitignored.

---

## Timeouts and limits

All values are integer milliseconds except `CLAW_MAX_TOOL_STEPS`. Each is parsed by
the `envInt()` helper in `lib/chat/config.ts`, which silently falls back to the
default if the value is missing or not a finite integer.

| Variable | Default | Constant | Governs |
|----------|---------|----------|---------|
| `CLAW_BASH_TIMEOUT_MS` | `30000` | `BASH_TIMEOUT_MS` | One `executeBash` command |
| `CLAW_CODE_EXEC_TIMEOUT_MS` | `15000` | `CODE_EXEC_TIMEOUT_MS` | One `executeCode` snippet |
| `CLAW_SKILL_INSTALL_TIMEOUT_MS` | `60000` | `SKILL_INSTALL_TIMEOUT_MS` | The `npx skills add` subprocess |
| `CLAW_CHAT_STREAM_TIMEOUT_MS` | `120000` | `CHAT_STREAM_TIMEOUT_MS` | A streaming chat request from the UI |
| `CLAW_CHAT_BLOCKING_TIMEOUT_MS` | `90000` | `CHAT_BLOCKING_TIMEOUT_MS` | A blocking chat request from a webhook |
| `CLAW_MAX_TOOL_STEPS` | `15` | `MAX_TOOL_STEPS` | Agentic tool-use steps before the loop is force-stopped |

These are application-level timeouts. They sit underneath a second, independent
limit: the `maxDuration` export on each route (`app/api/chat/route.ts` = 120s,
`app/api/chat/compare/route.ts` = 60s, `app/api/terminal/route.ts` = 120s, the
webhook routes = 120s). Raising a `CLAW_*_TIMEOUT_MS` above the route's
`maxDuration` has no effect on a serverless deployment — raise both.

---

## Channels

Channel credentials may come from the environment or from **Settings → Channels**
(persisted to `.claw/channels.json`). `GET /api/channels` reports the resolved
webhook URL and the source of each field.

### Telegram — custom webhook

| Variable | Purpose |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Matched against the `X-Telegram-Bot-Api-Secret-Token` header by `verifyTelegram()` in `lib/chat/verify.ts` |

Endpoint: `POST /api/webhooks/telegram`. Register it with:

```bash
curl https://api.telegram.org/bot<TOKEN>/setWebhook \
  -d url=https://<YOUR_DOMAIN>/api/webhooks/telegram \
  -d secret_token=<SECRET>
```

### WhatsApp — Meta Cloud API, custom webhook

| Variable | Purpose |
|----------|---------|
| `WHATSAPP_ACCESS_TOKEN` | Cloud API access token |
| `WHATSAPP_VERIFY_TOKEN` | Echoed back during Meta's `GET` verification handshake |
| `WHATSAPP_PHONE_NUMBER_ID` | Sending phone number ID |

All three are read by `getWhatsAppConfig()` in `lib/chat/config.ts`.

Endpoint: `GET`/`POST /api/webhooks/whatsapp`. Subscribe to the `messages` field.

> **`WHATSAPP_APP_SECRET` does nothing today.** The setup comment at the top of
> `app/api/webhooks/whatsapp/route.ts` lists it, and `lib/chat/verify.ts` exports a
> `verifyWhatsApp()` HMAC check that takes an app secret — but nothing calls that
> function, and `getWhatsAppConfig()` never reads the variable. Setting it has no
> effect, and incoming WhatsApp payload signatures are **not** verified. The `GET`
> handshake is still checked against `WHATSAPP_VERIFY_TOKEN`; it is only the `POST`
> payload signature that is unverified. Telegram, by contrast, is wired up:
> `verifyTelegram()` is called from `app/api/webhooks/telegram/route.ts`.

### Slack, Discord, Google Chat — Chat SDK

These are handled by the unified adapter in `lib/bot.ts` and routed through
`app/api/webhooks/[platform]/route.ts`. Adapters are created **conditionally on the
presence of their env vars**, so an unconfigured platform is simply absent rather
than failing at boot. Signature verification is performed by the adapter, not by
`lib/chat/verify.ts`.

| Platform | Variables | Endpoint |
|----------|-----------|----------|
| Slack | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` | `/api/webhooks/slack` |
| Discord | `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY` | `/api/webhooks/discord` |
| Google Chat | `GOOGLE_CHAT_SERVICE_ACCOUNT_KEY`, `GOOGLE_CHAT_PROJECT_ID` | `/api/webhooks/gchat` |

Slack event subscriptions: `app_mention`, `message.im`, `message.channels`. Scopes:
`app_mentions:read`, `channels:history`, `channels:read`, `chat:write`, `im:history`,
`im:read`, `reactions:read`, `reactions:write`, `users:read`.

---

## Memory (Minns)

Optional. Without it the app runs normally, minus long-term recall.

| Variable | Purpose |
|----------|---------|
| `MINNS_API_KEY` | Minns API key |
| `MINNS_PROJECT_ID` | Minns project ID |

Read by `lib/memory/minns-client.ts`. Also settable from **Settings → Memory**,
which persists to `.claw/minns-config.json` via `app/api/memory/config/route.ts`.
`isMemoryEnabled()` gates the feature; when it returns false the `saveMemory`,
`recallMemory` and `listMemories` tools are inert and no recall is injected into the
system prompt.

Both are commented out in `.env.local.example` — uncomment them there, set them in
the environment directly, or use the Settings UI. See
[Coverage of `.env.local.example`](#coverage-of-envlocalexample).

---

## Python sandbox

| Variable | Purpose |
|----------|---------|
| `OPENPAW_PYTHON_PATH` | Explicit interpreter path, tried first |

`lib/python-sandbox.ts` looks for Python 3.14 in this order: `OPENPAW_PYTHON_PATH`,
`/opt/homebrew/opt/python@3.14/bin/python3` (Apple Silicon Homebrew),
`/usr/local/opt/python@3.14/bin/python3` (Intel Homebrew), `/usr/local/bin/python3`.
The first path that exists wins and is cached for the process lifetime.

A virtualenv is created at `<workspace>/.venv`. Python `executeCode` runs through
`<workspace>/.venv/bin/python`, and `executeBash` receives `VIRTUAL_ENV` plus an
adjusted `PATH` so `pip install` lands inside the venv rather than the system
interpreter.

Set `OPENPAW_PYTHON_PATH` when Node inherits a `PATH` that differs from your shell —
the common case for GUI-launched processes on macOS.

> **Build interaction.** Once `workspace/.venv` exists, `npm run build` fails with a
> Turbopack symlink error. See
> [Contributing → Build failure caused by the workspace Python venv](../CONTRIBUTING.md#build-failure-caused-by-the-workspace-python-venv).

---

## Deployment-provided variables

Not set by you; supplied by the platform and read when constructing self-referential
URLs in `postCronNotification()` (`lib/crons/runner.ts`).

| Variable | Effect |
|----------|--------|
| `VERCEL_URL` | Base URL becomes `https://$VERCEL_URL` |
| `PORT` | Fallback base URL becomes `http://localhost:$PORT`, defaulting to `3000` |

If a cron fires behind a proxy or a custom domain where neither reflects the
reachable host, the cron *runs* correctly but its notification POST to
`/api/notifications` may not arrive. Delivery is deliberately best-effort — the
`fetch` failure is swallowed.

### Cron scheduling

Crons execute only when `/api/crons/run` is called; nothing schedules itself
in-process. On Vercel, `vercel.json` triggers it every minute. Self-hosted, add a
system cron:

```
* * * * * curl -X POST https://your-app/api/crons/run
```

---

## Coverage of `.env.local.example`

Every environment variable read anywhere under `app/`, `lib/`, `components/` and
`scripts/` is documented above. All of them have an entry in `.env.local.example`
except `VERCEL_URL` and `PATH`, which are explained in the caveat table below.

Note that a plain grep for `process.env.NAME` will under-report: the six `CLAW_*`
timeouts are read through `envInt(key)` and the provider keys through
`PROVIDER_ENV_KEYS`, both of which index `process.env[key]` dynamically.

Two conventions are used in the template, and the difference is not cosmetic:

- **Uncommented** (`FOO=`) — the common path. Fill in a value.
- **Commented** (`# FOO=`) — optional. The code has a working default, or the
  feature is inert without it. Uncomment only if you need it.

The commented entries are: the six `CLAW_*` timeout and limit values,
`CLAW_WORKSPACE_DIR`, `OPENPAW_PYTHON_PATH`, `MINNS_API_KEY`, `MINNS_PROJECT_ID`,
`GOOGLE_CHAT_SERVICE_ACCOUNT_KEY`, `GOOGLE_CHAT_PROJECT_ID`, `PORT` and
`WHATSAPP_APP_SECRET`.

Three entries need a caveat, because "present in the template" does not mean "does
something":

| Variable | Caveat |
|----------|--------|
| `WHATSAPP_APP_SECRET` | Read by nothing. See the note under [WhatsApp](#whatsapp--meta-cloud-api-custom-webhook). |
| `VERCEL_URL` | Set by the platform, not by you. Mentioned in the template's Deployment comment but deliberately given no assignable entry. |
| `PATH` | Read and rewritten by `lib/python-sandbox.ts` to point at the workspace venv. It is process state, not project configuration, so it is not in the template. |

---

## Server-side state files

All under `.claw/` at the project root, all created on demand, all gitignored —
`.gitignore` excludes `.claw/` because it holds channel secrets. Losing the directory
loses configuration and cron definitions, not chat history.

| File | Written by | Contents |
|------|------------|----------|
| `api-keys.json` | `lib/chat/api-keys-store.ts` | Provider keys saved from Settings |
| `channels.json` | `lib/chat/channel-config-store.ts` | Channel tokens and secrets |
| `channel-sessions.json` | `lib/chat/session-store.ts` | Conversation state per channel thread |
| `crons.json` | `lib/crons/cron-store.ts` | Scheduled task definitions |
| `cron-sessions.json` | `lib/crons/cron-sessions.ts` | Sessions created by prompt crons |
| `workflows.json` | `lib/workflows/workflow-store.ts` | Saved workflows |
| `minns-config.json` | `lib/memory/minns-client.ts` | Minns key and project ID |
| `shared-sessions/` | `app/api/sessions/share/route.ts` | Snapshots backing `/shared/<id>` |

`.claw` is in the ignore set of the workspace context search
(`DEFAULT_IGNORE`, `lib/context/search.ts`), so secrets are not surfaced to the agent
through `searchContext`.

---

## Browser-side state

Chat lives in the browser, not on the server. Zustand `persist` middleware writes to
`localStorage` under these keys:

| Key | Store |
|-----|-------|
| `openpaw-sessions` | `lib/store/sessions.ts` — sessions and message history |
| `openpaw-theme` | `lib/store/theme.ts` |
| `openpaw-branches` | `lib/store/branches.ts` |

Consequences worth knowing: chat history is per-browser and does not sync across
devices, clearing site data deletes it, and it is never sent to the server except as
part of an active request.

---

## See also

- [Architecture](architecture.md) — how these pieces fit together
- [Contributing](../CONTRIBUTING.md) — setup and development commands
- [README](../README.md) — feature overview

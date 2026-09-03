# OpenPaw Configuration Reference

Every setting is optional — the app boots with none of them — but you need at
least one AI provider key for chat to work.

Two configuration surfaces exist:

1. **Environment variables** — read from `process.env`, typically via `.env`
2. **The Settings UI** — persisted as JSON under `.claw/`

**Environment variables always win.** For every setting that supports both, the
env var is checked first and the stored value is used only as a fallback. A key
saved in Settings will appear to have no effect if the corresponding env var is
also set; the UI surfaces this as `source: "env"`.

Copy [`.env.example`](../.env.example) to `.env` to get started.

---

## AI provider keys

At least one is required. Only providers with a configured key appear in the
model selector.

| Variable | Provider | Consumer |
|----------|----------|----------|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) | `lib/chat/api-keys-store.ts` |
| `OPENAI_API_KEY` | OpenAI (GPT) | `lib/chat/api-keys-store.ts` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google (Gemini) | `lib/chat/api-keys-store.ts` |
| `MOONSHOT_API_KEY` | Moonshot (Kimi) | `lib/chat/api-keys-store.ts` |

The mapping from provider name to variable lives in `PROVIDER_ENV_KEYS`. The
stored fallback is `.claw/api-keys.json`, keyed by provider slug (`anthropic`,
`openai`, `google`, `moonshotai`).

`npm run test:usage` additionally reads `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
and `GOOGLE_GENERATIVE_AI_API_KEY` directly (`scripts/test-usage.ts`).

---

## Workspace & runtime

| Variable | Purpose | Default | Consumer |
|----------|---------|---------|----------|
| `CLAW_WORKSPACE_DIR` | Default working directory for file ops, bash, and crons. Resolved to an absolute path at module load. | `<project>/workspace` | `lib/chat/config.ts` |
| `OPENPAW_PYTHON_PATH` | Explicit path to the Python interpreter used to build the workspace venv. Tried first, ahead of the Homebrew/`/usr/local` fallbacks. | — | `lib/python-sandbox.ts` |
| `PORT` | Only used to construct the base URL for cron notifications when `VERCEL_URL` is unset. Does **not** change the port Next.js listens on — pass `next dev -p` / `next start -p` for that. | `3000` | `lib/crons/runner.ts` |
| `VERCEL_URL` | Set automatically by Vercel. Used as `https://$VERCEL_URL` for the cron notification callback. | — | `lib/crons/runner.ts` |

`CLAW_WORKSPACE_DIR` is read once when `lib/chat/config.ts` is first imported —
changing it requires a restart. Note that if a request resolves a workspace equal
to the project root, `buildContext` redirects it to `<root>/workspace` so the
agent never operates directly on the repository.

---

## Timeouts & limits

All values are integers in milliseconds (except `CLAW_MAX_TOOL_STEPS`, a count).
An unparseable value silently falls back to the default. All are read in
`lib/chat/config.ts`.

| Variable | Purpose | Default |
|----------|---------|---------|
| `CLAW_BASH_TIMEOUT_MS` | Max runtime for one `executeBash` call | `30000` |
| `CLAW_CODE_EXEC_TIMEOUT_MS` | Max runtime for one `executeCode` snippet | `15000` |
| `CLAW_SKILL_INSTALL_TIMEOUT_MS` | Max runtime for `npx skills add` | `60000` |
| `CLAW_CHAT_STREAM_TIMEOUT_MS` | Streaming chat budget | `120000` |
| `CLAW_CHAT_BLOCKING_TIMEOUT_MS` | Blocking (webhook/cron) chat budget | `90000` |
| `CLAW_MAX_TOOL_STEPS` | Max agentic tool-use steps before force-stop | `15` |

Two related timeouts are **not** configurable: `/api/terminal` hard-codes 60s,
and `/api/chat/compare` hard-codes 30s per model. Route-level `maxDuration`
values (120s for chat, terminal, and webhooks; 60s for compare) are also
hard-coded and cap the values above on serverless platforms.

`CLAW_CHAT_STREAM_TIMEOUT_MS` is exported but currently unreferenced outside
`config.ts` — the streaming route is bounded by its `maxDuration` instead.

---

## Channels

Each channel accepts credentials from an env var or from the Settings → Channels
UI (stored in `.claw/channels.json`). A channel counts as **enabled** when its
token is present from either source.

| Variable | Channel | Stored fallback |
|----------|---------|-----------------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather | `telegram.token` |
| `TELEGRAM_WEBHOOK_SECRET` | Value compared against `X-Telegram-Bot-Api-Secret-Token` | `telegram.secret` |
| `SLACK_BOT_TOKEN` | Slack bot token (`xoxb-…`) | `slack.token` |
| `SLACK_SIGNING_SECRET` | Slack request signing secret | `slack.secret` |
| `DISCORD_BOT_TOKEN` | Discord bot token | `discord.token` |
| `DISCORD_PUBLIC_KEY` | Discord application public key | `discord.secret` |
| `GOOGLE_CHAT_SERVICE_ACCOUNT_KEY` | Google Chat service account JSON | `gchat.token` |
| `GOOGLE_CHAT_PROJECT_ID` | Google Cloud project ID | `gchat.secret` |
| `WHATSAPP_ACCESS_TOKEN` | Meta Cloud API access token | `whatsapp.token` |
| `WHATSAPP_VERIFY_TOKEN` | Your chosen string for Meta's subscription handshake | `whatsapp.secret` |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta phone number ID used as the sender | `whatsapp.phoneNumberId` |

Three caveats that matter in practice:

- **Slack and Discord must be configured via environment variables.**
  `lib/bot.ts` registers their Chat SDK adapters at module load, gated on
  `SLACK_BOT_TOKEN` / `DISCORD_BOT_TOKEN`. Saving these in the Settings UI
  updates `GET /api/channels` status but does **not** register an adapter, so
  the webhook will still 404. Set the env var and restart.
- **Google Chat has no adapter.** `GOOGLE_CHAT_*` feed the Channels UI status
  display only; `/api/webhooks/gchat` returns 404 because `lib/bot.ts` registers
  no Google Chat adapter.
- **`TELEGRAM_WEBHOOK_SECRET` is effectively required.** When no secret is
  configured, `verifyTelegram` returns `true` for every request, leaving the
  webhook open to anyone who finds the URL.

There is no `WHATSAPP_APP_SECRET` support. The name appears in a setup comment
in `app/api/webhooks/whatsapp/route.ts`, and `lib/chat/verify.ts` exports an
unused `verifyWhatsApp` helper, but nothing reads the variable and the POST
handler does not verify `X-Hub-Signature-256`.

---

## Memory (optional)

Long-term memory via [Minns](https://minns.ai). The app runs fine without it.

| Variable | Purpose | Stored fallback |
|----------|---------|-----------------|
| `MINNS_API_KEY` | Minns API key. Presence enables the feature. | `.claw/minns-config.json` → `apiKey` |
| `MINNS_PROJECT_ID` | Minns project ID | `.claw/minns-config.json` → `projectId` |

Precedence is slightly stricter here: if `MINNS_API_KEY` is set, the stored file
is not read at all, so a `projectId` saved in the UI is ignored unless
`MINNS_PROJECT_ID` is also exported. Config is loaded once and cached for the
process lifetime — restart after changing it.

When enabled, the agent recalls context before each response, records chat
events after each response, and gains `saveMemory` / `recallMemory` /
`listMemories` tools.

---

## Server-side state: `.claw/`

Created on demand at the project root and **git-ignored**, because several of
these files hold plaintext secrets. Also excluded from workspace context search.

| File | Contents | Written by |
|------|----------|-----------|
| `api-keys.json` | Provider API keys, plaintext | `POST /api/providers` |
| `channels.json` | Channel tokens and secrets, plaintext | `POST /api/channels` |
| `crons.json` | Scheduled task definitions | Crons API and cron tools |
| `cron-sessions.json` | Sessions created by prompt crons | `lib/crons/runner.ts` |
| `workflows.json` | Workflow definitions | Workflows API |
| `minns-config.json` | Minns API key and project ID | `POST /api/memory/config` |
| `channel-sessions.json` | Telegram/WhatsApp conversation state | `lib/chat/session-store.ts` |
| `shared-sessions/<id>.json` | Shared session snapshots and presence | `POST /api/sessions/share` |

Back up `.claw/` to preserve crons, workflows, and channel setup. Never commit
it.

Two kinds of state are **not** in `.claw/`:

- **Chat history** lives in the browser's `localStorage` (Zustand `persist`).
  Clearing site data deletes it.
- **Notifications and session usage** are in-process memory only and reset on
  restart.

---

## The workspace directory

`workspace/` (or `CLAW_WORKSPACE_DIR`) is the agent's sandbox. It is git-ignored.

| Path | Convention |
|------|-----------|
| `workspace/` | cwd for all bash commands; root for all file tool paths |
| `workspace/public/` | Served at `/api/files/<path>` — where tools must write user-visible output |
| `workspace/user-skills/` | Primary install target for `npx skills add` |
| `workspace/.claude/skills/` | Also scanned for skills |
| `workspace/.venv/` | Python virtualenv created by `lib/python-sandbox.ts` |

The `public/` convention matters: the system prompt instructs skills and tools to
write screenshots, PDFs, and exports to `public/` so the UI can display them.
This is `workspace/public/`, **not** the project-root `public/` directory that
Next.js serves. `lib/tools/bash.ts` rewrites relative output paths for
`agent-browser screenshot` and `agent-browser pdf` to absolute workspace paths,
because those commands otherwise resolve relative paths from the project root.

Path handling in file tools is guarded: `safeResolve` rejects any path that
escapes the workspace, and `/api/files` refuses to serve outside
`<workspace>/public`.

---

## Scheduling

`vercel.json` triggers `/api/crons/run` every minute:

```json
{ "crons": [ { "path": "/api/crons/run", "schedule": "* * * * *" } ] }
```

Self-hosted, add a system cron instead:

```
* * * * * curl -X POST https://your-app/api/crons/run
```

Nothing schedules itself in-process — if neither of the above is set up, crons
never fire.

---

## Security notes

The API has **no authentication layer**. `/api/terminal` and the `executeBash`
tool provide arbitrary command execution to any caller who can reach the port,
and `.claw/` stores secrets in plaintext. Run OpenPaw locally, or put your own
authentication in front of it before exposing it. `BLOCKED_PATTERNS` in
`lib/tools/bash.ts` blocks a handful of catastrophic commands (`rm -rf /`,
`mkfs`, `dd if=`, …) but is a guardrail against accidents, not a security
boundary.

---

## See also

- [api.md](./api.md) — HTTP reference
- [architecture.md](./architecture.md) — how the pieces fit together
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — development workflow

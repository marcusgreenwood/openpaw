# Contributing

Getting a working copy of OpenPaw running, the commands that matter, and the
conventions the codebase expects.

For the system design see [docs/architecture.md](docs/architecture.md); for every
setting see [docs/configuration.md](docs/configuration.md).

---

## Prerequisites

- **Node.js 20+**
- **npm**
- **Python 3.14** (optional) — only for Python code execution. `lib/python-sandbox.ts`
  falls back through several interpreter paths; set `OPENPAW_PYTHON_PATH` if it picks
  the wrong one.

No database, Docker, or external infrastructure is required.

---

## Setup

### 1. Install dependencies

```bash
npm install --legacy-peer-deps
```

`--legacy-peer-deps` is **required**, not optional — peer dependency conflicts
between the AI SDK and Chat SDK packages cause a plain `npm install` to fail.

The `postinstall` script runs `npx agent-browser install`, which downloads Chromium
(~280 MB). That is expected. On Linux, if system libraries are missing:

```bash
npx agent-browser install --with-deps
```

### 2. Configure at least one provider key

```bash
cp .env.local.example .env.local
```

Fill in one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`GOOGLE_GENERATIVE_AI_API_KEY` or `MOONSHOT_API_KEY`. Alternatively, start the app
and use **Settings → API Keys**, which writes to `.claw/api-keys.json`.

Environment variables take precedence over stored keys. Only configured providers
appear in the model selector, and the default model may not belong to the provider
you configured — switch models from the header selector if chat fails to start.

### 3. Run

```bash
npm run dev
```

Open <http://localhost:3000>.

---

## Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Serve a production build |
| `npm run lint` | ESLint across the repo |
| `npm run test:usage` | Usage and cost tracking checks (`scripts/test-usage.ts`) |

There is no unit test suite. `npm run test:usage` is the only test-shaped script; it
makes **live API calls** and needs real keys in the environment —
`GOOGLE_GENERATIVE_AI_API_KEY` at minimum, plus `OPENAI_API_KEY` and
`ANTHROPIC_API_KEY` for full coverage. It reads them straight from `process.env` and
does not fall back to `.claw/api-keys.json`.

`scripts/test-screenshot.ts` is a manual harness, not wired to an npm script. Run it
with `npx tsx scripts/test-screenshot.ts`.

### Known lint state

**`npm run lint` currently exits 1.** As of this commit it reports 16 problems —
5 errors and 11 warnings. All 5 errors are pre-existing
`react-hooks/set-state-in-effect` violations in components; the warnings are unused
variables.

This is a known repo condition, not a broken environment. When changing code, make
sure you have not *added* problems rather than expecting a clean run. Compare
against the baseline:

```bash
npm run lint 2>&1 | tail -1
```

### Build failure caused by the workspace Python venv

`npm run build` fails if a Python virtualenv exists at `workspace/.venv`:

```
Error [TurbopackInternalError]: Failed to write app endpoint /page
Caused by:
- [project]/lib/python-sandbox.ts [app-route] (ecmascript)
- Symlink workspace/.venv/bin/python is invalid, it points out of the filesystem root
```

The symlink is not actually broken. `workspace/.venv/bin/python` chains to
`/opt/homebrew/opt/python@3.14/bin/python3.14`, an absolute path outside the project,
and Turbopack refuses to follow it. It only looks at the venv at all because
`lib/python-sandbox.ts` builds paths dynamically, which makes Turbopack traverse the
whole workspace directory.

Anything that triggers the Python sandbox — asking the agent to run Python, or
installing a Python skill — creates the venv and breaks subsequent builds. Move it
aside to build:

```bash
mv workspace/.venv /tmp/venv-backup && npm run build; mv /tmp/venv-backup workspace/.venv
```

The venv is recreated automatically on the next Python execution, so deleting it is
also safe — just slower. A permanent fix belongs in `lib/python-sandbox.ts` or in a
Turbopack ignore rule; neither is in place today.

---

## Conventions

**Imports** use the `@/` path alias, mapped to the project root in `tsconfig.json`.
Prefer `@/lib/chat/handler` over relative traversal.

**API routes** must declare `export const runtime = "nodejs"`. The agent spawns
subprocesses and touches the filesystem, so the Edge runtime cannot host them. Set
`maxDuration` on any route that can run long, and remember it caps the `CLAW_*`
timeouts rather than the other way round.

**Server-side state** goes in `.claw/` as JSON, following the shape of
`lib/crons/cron-store.ts` — load with a try/catch that returns a sensible empty
value, and `mkdir` recursively before writing. `.claw/` holds channel secrets and is
gitignored; never commit it, and never add a code path that reads it into a model
prompt.

**Client-side state** goes in `lib/store/` as a Zustand store. Persisted stores use
the `openpaw-` key prefix.

**Files produced by skills** must be written to `public/`, which resolves to
`workspace/public/` and is served at `/api/files/<name>`. The project-root `public/`
is the Next.js static directory and is not the right target. For CLI tools that
resolve paths from the project root, add an entry to `OUTPUT_PATH_REWRITE_PATTERNS`
in `lib/tools/bash.ts`. See `skills/README.md`.

**Never commit** `.env*`, `.claw/`, `workspace/` or `.openpaw` — all are gitignored,
and all can contain credentials or user data.

---

## Adding things

**A tool** — implement it in `lib/tools/`, following the existing pattern of a
factory that closes over `workspacePath`, then register it in `allTools()`
(`lib/tools/index.ts`). Binding the workspace at construction time is what keeps a
tool from being pointed anywhere else; keep it that way. Route filesystem access
through the resolver in `lib/tools/filesystem.ts` so the traversal guard applies.

**A skill** — create `skills/<name>/SKILL.md` with YAML frontmatter. Skills are
prompt-level extensions: they add instructions, not executable tool code.

**A model** — add an entry to `PROVIDER_REGISTRY` in `lib/models/providers.ts` with
`id`, `name`, `provider` and `contextWindow`. A whole new provider also needs an
entry in `PROVIDER_ENV_KEYS` (`lib/chat/api-keys-store.ts`) and a case in
`resolveModel()`.

**A channel** — if the Chat SDK supports it, add the adapter conditionally in
`lib/bot.ts` and it will route through `app/api/webhooks/[platform]`. Otherwise add
a dedicated route under `app/api/webhooks/`, a signature verifier in
`lib/chat/verify.ts`, and a message formatter in `lib/chat/formatters/`.

Create adapters conditionally on their env vars. An unconfigured platform should be
absent, never a boot failure.

---

## Before opening a PR

1. `npm run lint` — confirm you have not added problems to the baseline above.
2. `npm run build` — confirm the production build succeeds, moving `workspace/.venv`
   aside first if it exists (see above).
3. Exercise the affected path manually. There is no automated test suite to catch
   regressions for you, so for chat changes send a message that uses a tool, and for
   channel changes drive the webhook end to end.
4. Update `docs/configuration.md` if you added or changed an environment variable,
   and `docs/architecture.md` if you added a route, tool or module.

`AGENTS.md` carries additional notes for coding agents working in this repo.

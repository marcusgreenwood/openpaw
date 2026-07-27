# Contributing to OpenPaw

## Prerequisites

- **Node.js 20 or newer**
- **npm** (the repo ships `package-lock.json`)
- **Python 3** — optional, only for the `executeCode` Python path and Python skills. The app
  creates a per-workspace virtualenv on demand and prefers a Homebrew `python@3.14` if it
  finds one; override with `OPENPAW_PYTHON_PATH`.

No database, Docker, or external services are required.

## Setup

```bash
npm install --legacy-peer-deps
```

Two things to know about install:

- **`--legacy-peer-deps` is required.** Peer dependency conflicts between packages make a
  plain `npm install` fail.
- **`postinstall` downloads Chromium (~280 MB)** by running `npx agent-browser install`.
  This is expected and can take a while. On Linux, if system dependencies are missing:

  ```bash
  npx agent-browser install --with-deps
  ```

Then configure at least one AI provider:

```bash
cp .env.example .env.local
$EDITOR .env.local
```

Or start the app and use **Settings → API Keys**. Environment variables take precedence over
keys saved in the UI. The default model is `anthropic/claude-sonnet-4-6` — if you configured a
different provider, switch models with the selector in the header.

See [docs/configuration.md](./docs/configuration.md) for every supported variable.

## Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run test:usage` | Usage-tracking test script (`scripts/test-usage.ts`) |

### Known caveats

- **`npm run lint` exits 1 on a clean checkout.** There are pre-existing
  `react-hooks/set-state-in-effect` errors in the repo. This is a known issue, not a problem
  with your environment. Compare your output against `main` before assuming you introduced
  something; don't "fix" unrelated pre-existing errors as part of another change.
- **`npm run test:usage` requires `GOOGLE_GENERATIVE_AI_API_KEY`.** It makes a real API call.
- There is no unit test suite. Verify changes by running the app.

## Project conventions

**Layout** — see [docs/architecture.md](./docs/architecture.md) for the full module map. In
short: `app/` for routes and API handlers, `components/` for React UI grouped by area, `lib/`
for all logic, `types/` for shared types, `skills/` for built-in skills.

**Imports** — use the `@/` alias for anything non-relative (`@/lib/tools`, `@/components/ui/Button`).

**Server code** — API routes declare `export const runtime = "nodejs"`. Long-running routes
also set `maxDuration`. Node built-ins are imported with the `node:` prefix
(`import * as fs from "node:fs/promises"`).

**Client code** — components that use hooks or browser APIs start with `"use client"`.
Client state goes in a Zustand store under `lib/store/`; persist with the `persist` middleware
and an `openpaw-*` key, using `partialize` to keep transient fields out of storage.

**Server persistence** — new server-side config belongs in `.claw/<name>.json`. Follow the
existing store shape (`lib/crons/cron-store.ts` is the canonical example): async
`load`/`save` helpers, `fs.mkdir(..., { recursive: true })` before writing, and a `try/catch`
that returns an empty default when the file is missing.

**Tools** — a tool is a factory taking `workspacePath` and returning `tool({ description,
inputSchema, execute })` with a Zod schema. Register it in `lib/tools/index.ts`. File paths
must go through the traversal guard; shell commands must go through `BLOCKED_PATTERNS`.

**Secrets** — never log or return raw credentials. Mask with `maskApiKey` / `maskValue`
(`****abcd`). Env vars always take precedence over stored values.

**Formatting** — match the surrounding file. Two-space indent, double quotes, semicolons,
TypeScript throughout. `any` is disallowed by lint; when a third-party shape genuinely can't
be typed, narrow it locally rather than widening.

**Documentation** — if you add or change an endpoint, an env var, or a storage key, update the
matching page in `docs/`. If you add a user-facing feature, add it to
[docs/features.md](./docs/features.md) and the README's feature list.

## Branch and PR flow

1. Branch off `main` — never commit to `main` directly.

   ```bash
   git checkout main && git pull
   git checkout -b <type>/<short-description>
   ```

   Prefixes in use: `feat/`, `fix/`, `docs/`, `chore/`.

2. Keep commits focused, with an imperative subject line
   (`docs: backfill API reference`, `fix: guard against empty workspace path`).

3. Before pushing:

   ```bash
   npm run build
   npm run lint      # compare against main — exit 1 is pre-existing
   ```

4. Open a PR against `main`:

   ```bash
   git push -u origin <branch>
   gh pr create --base main
   ```

   Describe what changed and how you verified it. Call out anything that changes an API
   response shape, a storage key, or an environment variable, since both are effectively
   public contracts for existing installs.

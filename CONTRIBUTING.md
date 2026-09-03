# Contributing to OpenPaw

OpenPaw is a single-service Next.js 16 (App Router) application. There is no
database, no Docker, and no external infrastructure to stand up — just Node and
npm.

---

## Prerequisites

- **Node.js 20.9 or newer.** `package.json` declares no `engines` field, but the
  pinned `next@16.1.6` requires `>=20.9.0`.
- npm

---

## Setup

```bash
npm install --legacy-peer-deps
```

Two things about this command are not optional:

- **`--legacy-peer-deps` is required.** Several packages have conflicting peer
  dependency ranges, and a plain `npm install` fails.
- **`postinstall` downloads Chromium (~280 MB)** by running
  `npx agent-browser install`. This is expected and can take a while on a cold
  cache. On Linux, if you hit missing system libraries:

  ```bash
  npx agent-browser install --with-deps
  ```

`package.json` also declares `"prepare": "husky"`, but **husky itself is not a
declared dependency** — it appears in neither `dependencies`, `devDependencies`,
nor `package-lock.json`. So this step fails:

```
$ npm run prepare
sh: husky: command not found     # exit 127
```

npm runs `prepare` as part of `npm install`, so expect it to report a failure
there. Everything else installs; see [Git hooks](#git-hooks) for what this means
for commits and how to wire them up.

Then configure at least one AI provider key — either copy `.env.example` to
`.env` and fill one in, or start the app and use **Settings → API Keys**.
Environment variables take precedence over anything saved in the UI. See
[docs/configuration.md](./docs/configuration.md) for the full reference.

---

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (`eslint-config-next`, core-web-vitals + TypeScript) |
| `npm run test:usage` | Usage-tracking tests (`scripts/test-usage.ts` via tsx) |
| `npm run commitlint` | Lint the most recent commit message |

`npm run lint` is clean on `main` and exits 0. Treat any error it reports as
introduced by your change.

### Tests

`npm run test:usage` is the only test script. It exercises token/cost accounting
and needs a real API key — `GOOGLE_GENERATIVE_AI_API_KEY` at minimum; the script
also reads `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`. **It makes real API calls
and therefore costs money.** There is no offline unit-test suite.

---

## Commit message format

This project enforces [Conventional Commits](https://www.conventionalcommits.org/)
via commitlint. All commits must follow this format:

```
<type>(<optional scope>): <subject>
```

### Allowed types

| Type       | Use for                                      |
|------------|----------------------------------------------|
| `feat`     | A new feature                                |
| `fix`      | A bug fix                                    |
| `chore`    | Build process, tooling, or dependency updates|
| `docs`     | Documentation changes only                   |
| `style`    | Formatting, whitespace (no logic change)     |
| `refactor` | Code restructuring without behavior change   |
| `test`     | Adding or updating tests                     |
| `ci`       | CI/CD configuration changes                  |
| `build`    | Build system changes                         |
| `revert`   | Revert a previous commit                     |

### Rules

- Subject line must not exceed **100 characters**
- Use **imperative mood** ("add feature" not "added feature")
- Do not end the subject with a period

### Examples

```
feat: add streaming support for Claude responses
fix: resolve token count overflow on long conversations
chore: update @ai-sdk/anthropic to v3.1.0
docs: add API usage examples to README
refactor: extract message formatting into utility function
test: add unit tests for streaming parser
```

### Multi-line commits

For more context, add a blank line after the subject and write a body:

```
feat(chat): add message retry on network failure

Automatically retries failed messages up to 3 times with
exponential backoff. Users see a loading indicator during retry.
```

The enforced rules live in `commitlint.config.js` (`@commitlint/config-conventional`
plus the type list and 100-character subject cap above).

### Git hooks

Two hook scripts are checked in, intended to be wired up by
[husky](https://typicode.github.io/husky/):

- **`.husky/commit-msg`** runs `npx --no -- commitlint --edit $1`, rejecting a
  commit whose message violates the rules above.
- **`.husky/pre-commit`** is a placeholder and runs nothing.

**They are not active on a fresh clone.** husky is missing from `package.json`,
so `prepare` fails (above) and never generates `.husky/_/` — the dispatcher
directory that git's `core.hooksPath` points at, and which is git-ignored rather
than checked in. Without it, git uses its default hooks path and neither script
runs.

To enable them locally:

```bash
npm install --save-dev husky   # also fixes the failing prepare script
npx husky                      # generates .husky/_/ and sets core.hooksPath
```

`@commitlint/cli` *is* installed, so you can validate a message without husky
either way:

```bash
npm run commitlint                        # lint the last commit
echo "docs: my subject" | npx commitlint  # lint a message from stdin
```

Whether or not the hook fires on your machine, the commit format above is still
expected in review.

---

## Branching and pull requests

- Branch off `main`; never commit directly to it.
- Use a descriptive prefix: `feat/`, `fix/`, `docs/`, `refactor/`.
- Before opening a PR: `npm run build` and `npm run lint` must both pass.
- Keep PRs scoped to one concern. Note in the description whether you touched
  anything under `.claw/` semantics or the system prompt, since both change agent
  behavior globally.

Do not commit `.claw/`, `.env`, or `workspace/` — all are git-ignored, and the
first two contain plaintext secrets. `.env.example` is the one exception, kept
trackable by an explicit `!.env.example` negation in `.gitignore`.

---

## How to add things

### A new tool

1. Create `lib/tools/my-tool.ts` exporting a factory that takes the workspace
   path and returns an AI SDK `tool({ description, inputSchema, execute })`.
   Tools are curried over the workspace so the model can't redirect them:

   ```ts
   import { tool } from "ai";
   import { z } from "zod";

   export const myTool = (workspacePath: string) =>
     tool({
       description: "What this does and when the model should reach for it.",
       inputSchema: z.object({ path: z.string().describe("Relative to workspace root") }),
       execute: async ({ path }) => {
         // ...
         return { ok: true };
       },
     });
   ```

2. Register it in the object returned by `allTools()` in `lib/tools/index.ts`.
   That's the only registration step.

Guidelines: resolve every filesystem path through a workspace-relative guard
(see `safeResolve` in `lib/tools/filesystem.ts`), cap returned output so a large
result can't blow the context window, and return structured errors rather than
throwing — a thrown error aborts the whole tool loop. Write the `description`
for the model, not for humans: it is the only thing driving tool selection.

### A new API route

1. Create `app/api/<name>/route.ts` and export the HTTP methods you need.
2. Add `export const runtime = "nodejs";` — the default edge runtime can't spawn
   processes or touch the filesystem. Add `export const maxDuration` if the route
   can run long.
3. Return `NextResponse.json(...)`, with explicit status codes for errors.
   Follow the existing shape: `{ "error": "message" }` with a 4xx/5xx status.
4. Dynamic params are async in Next 16:
   `{ params }: { params: Promise<{ id: string }> }` — you must `await params`.
5. Document it in [docs/api.md](./docs/api.md).

For server-side state, add a store module under `lib/` that reads and writes a
JSON file in `.claw/` — follow `lib/crons/cron-store.ts`, which returns a safe
default when the file is missing rather than throwing.

### A new built-in skill

Create `skills/<skill-name>/SKILL.md` with YAML frontmatter:

```markdown
---
name: my-skill
description: One line telling the model when to activate this skill.
version: "1.0"
author: your-name
tags: [tag1, tag2]
---

## Guidance

Markdown instructions the agent follows when this skill is loaded.
```

`name` and `description` are required — a file missing either is silently
skipped. Bodies are stripped of HTML and truncated to 4000 characters before
they reach the prompt, so keep them tight. Skills in `skills/` are `built-in` and
the API refuses to edit or delete them; user skills install to
`<workspace>/user-skills/`.

The skill loader caches for 10 seconds, so a new skill shows up a moment after
you create it without a restart.

### Changing agent behavior

Base agent instructions live in `lib/system-prompt.md`, not in TypeScript.
`lib/system-prompt.ts` only substitutes `{{CURRENT_DATETIME}}`,
`{{WORKSPACE_SECTION}}`, and `{{SKILL_BLOCKS}}`. Edit the markdown.

---

## Things worth knowing before you dig in

- **Chat history lives in the browser**, not the server — Zustand `persist` into
  `localStorage`. The server has no list of conversations.
- **Server state is JSON files in `.claw/`**, which assumes a single long-lived
  instance. Notifications and usage tracking are in-process memory and reset on
  restart.
- **There is no authentication** on any API route, and `/api/terminal` plus
  `executeBash` are arbitrary command execution. Keep that in mind before
  exposing a dev server.

[docs/architecture.md](./docs/architecture.md) covers all of this in depth.

---

## Documentation

- [docs/api.md](./docs/api.md) — HTTP API reference
- [docs/architecture.md](./docs/architecture.md) — system design and data flow
- [docs/configuration.md](./docs/configuration.md) — environment variables and file layout
- [AGENTS.md](./AGENTS.md) — notes for AI coding agents working in this repo

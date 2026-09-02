# Contributing to OpenPaw

## Prerequisites

- **Node.js 20+** — Next.js 16 requires it. There is no `engines` field in `package.json`; 20 is the floor documented in `AGENTS.md`.
- **npm** — a `package-lock.json` is committed, so use npm rather than another package manager.
- Optional: a Python 3 interpreter for `executeCode` with `language: "python"`. The app prefers `OPENPAW_PYTHON_PATH`, then Homebrew Python 3.14 paths, then `/usr/local/bin/python3`, then `python3`.

## Setup

```bash
npm install --legacy-peer-deps
```

`--legacy-peer-deps` is **required** — several packages have conflicting peer dependency ranges and a plain `npm install` fails.

The `postinstall` script runs `npx agent-browser install`, which downloads Chromium (~280 MB). This is expected; the first install is slow. On Linux, if you hit missing system libraries:

```bash
npx agent-browser install --with-deps
```

Then add at least one provider key — via environment variable or **Settings → API Keys** in the UI — and start the dev server:

```bash
npm run dev
```

See [docs/configuration.md](docs/configuration.md) for every supported variable.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (`eslint`, flat config in `eslint.config.mjs`) |
| `npm run test:usage` | `tsx scripts/test-usage.ts` — usage/cost tracking checks; needs `GOOGLE_GENERATIVE_AI_API_KEY` |

`scripts/test-screenshot.ts` exists as a manual agent-browser check and is not wired to an npm script.

### Known lint failure

**`npm run lint` exits 1 on a clean checkout.** It currently reports 5 errors and 11 warnings; all five errors are `react-hooks/set-state-in-effect` ("Calling setState synchronously within an effect can trigger cascading renders") in existing components. This is a pre-existing condition, not something your branch introduced.

Before assuming you broke something, compare against the baseline:

```bash
git stash && npm run lint 2>&1 | tail -3 ; git stash pop
```

Treat *new* errors or warnings as yours; leave the existing ones alone unless you are deliberately fixing them.

### Git hooks

`core.hooksPath` is set to `.husky/_`, but `.husky/` contains no user hook scripts — only Husky's internal `_` directory — and `husky` is not in `package.json`'s dependencies. **No pre-commit checks run today.** If you add one, put the script at `.husky/pre-commit` and add `husky` as a dev dependency.

## Code layout

```
app/              Next.js App Router pages and API routes
components/       React components, grouped by feature
lib/              Server and client logic (see docs/architecture.md)
skills/           Built-in skills, one directory per skill with SKILL.md
types/            Shared TypeScript types (types/index.ts, imported as "@/types")
scripts/          Standalone tsx scripts
workspace/        Default agent working directory (gitignored)
```

Conventions used throughout:

- **Path alias.** `@/` maps to the project root — `@/lib/chat/config`, `@/components/ui/Button`.
- **Node imports are prefixed.** `import * as fs from "node:fs/promises"`, not `"fs"`.
- **Route handlers declare their runtime.** Nearly every route sets `export const runtime = "nodejs"`; long-running ones also set `maxDuration`.
- **Stores follow one shape.** Server JSON stores expose `load*` / `save*` / `create*` / `update*` / `delete*` and swallow read errors by returning an empty default — see `lib/crons/cron-store.ts` as the template.
- **Errors are values in tool code.** Agent tools return `{ error: "…" }` rather than throwing, so a failure becomes a tool result the model can react to.
- **Env beats stored config**, everywhere. Follow the pattern in `lib/chat/config.ts`.
- `"use client"` goes at the top of any component or store that uses React state or browser APIs.

## Adding a new tool

1. Create `lib/tools/<name>.ts`. Export either a `tool({...})` object or, when the tool needs the workspace, a factory `(workspacePath: string) => tool({...})`.
2. Give it a `description` written for the model — say when to use it, not just what it does — and a Zod `inputSchema` with `.describe()` on every parameter. The model only sees these strings.
3. Resolve any user-supplied path through a workspace-relative helper. Copy `safeResolve` from `lib/tools/filesystem.ts`; do not accept absolute paths.
4. Return a plain serialisable object. Truncate large payloads (`executeBash` caps stdout at 50 000 chars) and catch errors into the return value.
5. Register it in `allTools()` in `lib/tools/index.ts`.
6. If it should render specially, add a component under `components/generative-ui/` and wire it into the `toolName` switch in `components/chat/MessageBubble.tsx`.
7. Document it in [docs/tools.md](docs/tools.md).

## Adding a new API route

1. Create `app/api/<segment>/route.ts` and export the HTTP methods you support.
2. Add `export const runtime = "nodejs"` (required for anything touching `fs`, `child_process`, or the stores), plus `export const maxDuration` if it can run long.
3. Validate inputs explicitly and return `NextResponse.json({ error: "…" }, { status })`. Match the existing vocabulary: `400` for bad input, `403` for forbidden operations, `404` for unknown ids, `503` for an unconfigured integration.
4. Put the real logic in a `lib/` module and keep the route as request parsing plus response shaping — that is what lets webhooks and the browser share one code path.
5. Add a header comment listing the methods and their purpose, as in `app/api/crons/route.ts`.
6. For streaming, return a `ReadableStream` with `Content-Type: text/event-stream` and `Cache-Control: no-cache`; see `app/api/terminal/route.ts` and `app/api/workflows/run/route.ts` for the two conventions in use (bare `data:` lines vs. named `event:` types).
7. Document it in [docs/api-reference.md](docs/api-reference.md).

## Adding a built-in skill

1. Create `skills/<skill-name>/SKILL.md`.
2. Start with YAML front matter. `name` and `description` are **required** — the loader silently skips files missing either:

   ```markdown
   ---
   name: my-skill
   description: One line telling the model when to reach for this skill.
   version: 0.1.0
   author: you
   tags: [example]
   ---

   Instructions for the agent…
   ```

3. Keep the body under **4 000 characters** — `lib/skills/loader.ts` truncates past that, and HTML tags are stripped.
4. Supporting files can live alongside `SKILL.md` in the same directory.
5. Skills under `skills/` load as `source: "built-in"` and are read-only through the API — `PUT` and `DELETE /api/skills/[name]` reject them with `403`. Name conflicts resolve in favour of `skills/`.
6. The loader caches for 10 s; restart the dev server or call `invalidateSkillsCache()` if a change does not show up.

## Before you open a PR

- `npm run build` (or at minimum `npx tsc --noEmit`) passes.
- `npm run lint` introduces no errors or warnings beyond the documented baseline.
- Docs under `docs/` are updated when you add or change an endpoint, tool, env var, or state file.
- Claims in docs are checked against the code, not inferred from names.

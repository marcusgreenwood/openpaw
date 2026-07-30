# AGENTS.md

## Cursor Cloud specific instructions

### Overview

OpenPaw is a single-service Next.js 16 (App Router) AI chat application. No database, Docker, or external infrastructure is required — just npm and Node.js v20+.

### Commands

See `package.json` scripts and `README.md` for full details:

- **Dev server:** `npm run dev` (port 3000)
- **Build:** `npm run build`
- **Lint:** `npm run lint` (ESLint; has pre-existing warnings/errors in the repo)
- **Lint commits:** `npm run lint:commits` (Conventional Commits check over `origin/main..HEAD`)
- **Test:** `npm run test:usage` (usage tracking tests; requires `GOOGLE_GENERATIVE_AI_API_KEY`)
- **Test commit messages:** `npm run test:commit-msg` (`node:test` unit tests, no API key needed)

### Commit conventions

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) and
are enforced by the `.husky/commit-msg` hook. Full rules live in `CONTRIBUTING.md`; the short
version for agents working in this repo:

- Format: `<type>(<optional scope>)<!>: <subject>` — e.g. `feat(crons): add Run now button`.
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Subject: imperative, lowercase first word (identifiers/acronyms exempt), no trailing period, ≤ 72 chars.
- Blank line between subject and body; git trailers (`Co-Authored-By`, `Nightshift-Task`, …) in the
  final paragraph, one `Key: value` per line.
- The hook auto-fixes casing, a missing space after the colon, a trailing period and a missing blank
  line; it rejects a missing or unknown type rather than guessing one.
- Merge/revert/`fixup!`/`squash!` messages are exempt. Bypass with `SKIP_COMMIT_LINT=1 git commit`.
- Hooks self-install via the `prepare` npm script; re-run with `npm run prepare` if they go missing.
- Existing history predates the standard and is **not** rewritten.

### Key caveats

- **`--legacy-peer-deps` is required** when running `npm install` due to peer dependency conflicts between packages.
- The `postinstall` script runs `npx agent-browser install` which downloads Chromium (~280 MB). This is expected and normal.
- At least one LLM API key must be configured for chat to work. Keys can be set via environment variables (`GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MOONSHOT_API_KEY`) or through the in-app Settings UI. The default model may not match your configured key — use the model selector (top-right) to switch to a provider you have configured.
- Chat state is stored in browser `localStorage` (Zustand/persist). Server-side config (API keys, crons, Minns memory) is stored as JSON files in `.claw/` directory.
- The lint command (`npm run lint`) exits with code 1 due to pre-existing `react-hooks/set-state-in-effect` errors — this is a known issue in the repo, not an environment problem.

### LiveTerminal (streaming bash output)

The `/api/terminal` endpoint streams bash command output via SSE. The `LiveTerminal` component renders real-time output during `executeBash` tool calls (shown while the tool is in `input-streaming`/`input-available` state). After the tool completes, the regular `TerminalOutput` takes over. The terminal API reuses `BLOCKED_PATTERNS` from `lib/tools/bash.ts` and has a 60s timeout.

### Memory feature (Minns Memory Layer)

The agent has persistent long-term memory powered by [Minns](https://minns.ai). When configured, the agent automatically:
- Recalls relevant memories/claims/strategies before each response (injected into system prompt)
- Records chat events after each response (for episodic memory formation and claim extraction)
- Has `saveMemory`, `recallMemory`, `listMemories` tools available

Configure via `MINNS_API_KEY` and `MINNS_PROJECT_ID` env vars, or through Settings > Memory in the UI. Memory is optional — the app works without it.

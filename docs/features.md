# Feature Guide

Features that ship in OpenPaw but aren't covered by the top-level README. Each entry says what
it does, how to use it, and where its state lives.

---

## Workflows

Sequential automation: run a command, feed its output into the next step, branch on a
condition.

**Where** — Sidebar → **Workflows** tab (`components/workflows/WorkflowsPanel.tsx`).

**Step types**

| Type | Behaviour |
|------|-----------|
| `command` | Runs a shell command in the workspace. `{{previousOutput}}` is substituted with the previous step's output. Default timeout 60 s. |
| `condition` | Evaluates a JS expression against a variable named `output` (the previous step's output) and jumps to the `onTrue` or `onFalse` step id. |
| `prompt` | **Placeholder.** The server substitutes `{{previousOutput}}` and returns `"[Prompt sent to AI]\n\n<prompt>"` — it does not call a model. See `app/api/workflows/run/route.ts`. |

A failed step ends the run unless it sets `continueOnError`.

**Built-in workflows** (`BUILT_IN_WORKFLOWS` in `lib/store/workflows.ts`) — *Test & Fix*
(`npm test` → condition → prompt → re-run), *Build & Deploy* (lint → build → test → deploy),
and *Daily Report* (git log → summarize). They can be run and used as an editing starting
point, but not deleted; editing one saves a new copy rather than mutating the built-in.

**Running one** — Click ▶️ Run. `WorkflowsPanel` POSTs the steps to `/api/workflows/run` and
consumes the SSE stream, driving the `WorkflowRunner` progress view (per-step status icons,
durations, output). Cancel aborts the fetch and marks the run `cancelled`; the server-side
process is not separately signalled.

**State** — Custom workflows are in localStorage under `openpaw-workflows`. The active run is
in-memory only. There is *also* a server-side store at `.claw/workflows.json` behind
`/api/workflows` (GET/POST/PUT/DELETE); the sidebar does not use it today, so the two are
independent.

> `condition` steps are evaluated with `new Function`. Only run workflows whose steps you
> wrote.

---

## Conversation branching

Fork a conversation at any message and explore a different direction without losing the
original.

**Where** — Hover any message bubble and click the fork icon in its top-right corner. Once a
session has at least one branch, a `BranchSelector` bar appears above the message list.

**How it works** — `createBranch(sessionId, forkFromMessageId)` records the branch (its
`parentBranchId` is whatever branch was active) and makes it active.
`forkMessagesIntoBranch` copies messages from the source branch up to and including the fork
point into the new branch's storage key. Switching branches swaps which localStorage key the
chat reads and writes.

Branches are auto-named `Branch 1`, `Branch 2`, … The base conversation is always shown as
**Main**. Deleting the active branch returns you to Main; the branch's messages are **not**
cleaned up from localStorage.

**State** — `openpaw-branches` (`{ branches, activeBranch }`, both keyed by session id) plus
one `openpaw-messages-<sessionId>:<branchId>` key per branch.

---

## Compare mode

Send one prompt to 2–3 models side by side and pick the winner.

**Where** — Command palette (⌘K / Ctrl+K) → the compare action, which dispatches an
`openpaw-open-compare` event and opens `ModelPickerDialog`.

**How to use** — Type your prompt into the input bar *first*, then open compare and pick
models. If the input is empty, nothing is sent.

`ChatInterface` POSTs to `/api/chat/compare`, which runs `generateText` against every model in
parallel with a 30 s per-model timeout. Results render as columns with the response, input and
output token counts, and duration. "Use this response" appends the prompt and the winning
response to the conversation as a normal user/assistant pair, then exits compare mode.

**Limitations** — compare runs have **no tools**, and their token usage is not recorded to
`.openpaw/usage.json`. A model that errors shows the error in its column; the others still
render.

**State** — `lib/store/compare.ts`, in-memory only.

---

## Session sharing and presence

Publish a read-only snapshot of a conversation at a URL.

**Where** — Sidebar → Sessions tab → the share action on a session.

**Sharing** — The client loads the session's messages from localStorage and POSTs them to
`/api/sessions/share`, which writes `.claw/shared-sessions/<sessionId>.json`. The returned
`/shared/<sessionId>` path is turned into an absolute URL and copied to the clipboard
("Link copied!").

**Viewing** — `app/shared/[id]/page.tsx` reads the file server-side and renders
`SharedSessionView`: a banner, the message list, a viewer count, and a **Fork to my sessions**
button that copies the messages into a new local session. Unknown ids render a "Session Not
Found" page.

**Presence** — The viewer generates a per-tab id stored in `sessionStorage` under
`openpaw-viewer-id`, then polls
`GET /api/sessions/share?id=…&presence=true&viewerId=…` every 10 seconds. Each poll
refreshes the messages and records a heartbeat. Entries older than 30 s are pruned, and
`PresenceIndicator` renders up to five colored dots plus an "N viewers" label.

**Caveats** — the snapshot is **not** live: it only updates when the owner shares again. There
is no unshare endpoint — delete the JSON file to revoke. Anyone with the URL can read the
conversation.

**State** — `.claw/shared-sessions/<id>.json` server-side; `openpaw-viewer-id` in
`sessionStorage`.

---

## Notifications

A bell in the header with an unread badge, fed by cron runs.

**Where** — `components/layout/NotificationBell.tsx`.

**How it works** — The bell polls `GET /api/notifications` every 30 s, passing `since` (the
newest timestamp it has seen) after the first fetch. New items are added to the local store,
de-duplicated by id, and trigger a ring animation. The cron runner POSTs a `cron_success` or
`cron_failure` notification after every job, with the job name and, for prompt crons, the
`sessionId` of the created chat.

Clicking a notification marks it read and — if it carries a `sessionId` — switches to that
session. The dropdown shows the 20 most recent, with "Mark all read" and "Clear all".

**Caveats** — the server list is an in-memory array (max 100, GET returns at most 50) and the
client store holds 50 and does not persist. Everything resets on restart or reload.

**State** — `lib/store/notifications.ts` (in-memory) on the client; a module-level array in
`app/api/notifications/route.ts` on the server.

---

## Tool audit log

**Where** — Sidebar → **Audit** tab (`components/layout/ToolAuditLog.tsx`).

Shows a reverse-chronological list of tool executions — timestamp, tool name, an
`approved` / `denied` / `auto` status badge, duration, and expandable parameters and result.
"Clear" empties it. The store keeps the 100 most recent entries.

**Current status** — the only code that writes entries is `ToolApproval.tsx`, and that
component is not rendered anywhere in the app today. In practice the panel stays empty. It is
scaffolding for the approval flow described in
[Architecture → Approval path](./architecture.md#approval-path), not a working audit trail.

**State** — `lib/store/audit-log.ts`, in-memory only.

---

## Memory (Minns)

Persistent long-term memory across sessions, powered by [Minns](https://minns.ai). Entirely
optional — everything degrades to a no-op when unconfigured.

**Setup** — Set `MINNS_API_KEY` (and optionally `MINNS_PROJECT_ID`), or use
**Settings → Memory**, which writes `.claw/minns-config.json` via `/api/memory/config`.
Environment variables take precedence.

**What it does**

- **Recall before responding.** When the last user message is present, `buildContext` calls
  `recallMemories(query)` and appends up to 5 known facts, 3 past experiences, and 2 learned
  strategies to the system prompt under `## Memory Context`.
- **Record after responding.** `onFinish` sends the user/assistant exchange plus the list of
  tool names used, as both a semantic context event and an action/outcome event.
- **Tools.** `saveMemory` (store a fact or preference), `recallMemory` (search claims and
  memories), and `listMemories` (list stored memories with tier, takeaway, and causal note).

**Browsing** — `GET /api/memory` lists memories and stats; `GET /api/memory?q=…` searches
claims.

**Caveats** — session ids are hashed to a numeric id, all calls use agent id `1`, and every
Minns failure is swallowed so chat never breaks. The client caches its config at first use, so
changing credentials requires a server restart.

---

## Live terminal

Real-time bash output while a command is still running.

**How it appears** — While an `executeBash` tool call is in the `input-streaming` or
`input-available` state, `MessageBubble` renders `LiveTerminal` with the command. The
component auto-runs, opening an SSE connection to `/api/terminal` via `useLiveTerminal`, and
appends stdout/stderr as it arrives. Output is colorized: stderr red, lines matching
`error` red, `warn`/`warning` yellow, `success`/`done`/`passed`/`complete`/`ok` green.

It auto-scrolls unless you scroll up yourself, and can be collapsed. When the tool call
completes, the regular `TerminalOutput` component takes over the final result.

**Caveats** — this means the command runs **twice**: once as the model's tool call, once via
`/api/terminal` for display. The terminal endpoint has its own 60 s timeout (exit code `124`)
and enforces the same `BLOCKED_PATTERNS` as `executeBash`.

---

## File and image attachments

**Where** — The paperclip in the input bar, or drag-and-drop anywhere over the chat
(`FileDropZone`).

**Supported** — Text files by MIME type or by extension (`ts`, `tsx`, `js`, `jsx`, `py`, `md`,
`json`, `txt`, `css`, `html`, `svg`, `sh`, `yaml`, `yml`, `toml`, `xml`, `sql`, `rs`, `go`,
`java`, `rb`, `php`, `c`, `cpp`, `h`, `hpp`, `swift`, `kt`, `lua`, `r`) up to **100 KB**, and
images (`png`, `jpg`, `jpeg`, `gif`, `webp`) up to **5 MB**. Anything else is rejected with a
toast.

**How it works** — Files are read in the browser: text with `readAsText`, images with
`readAsDataURL`. On send, `formatForMessage()` serializes them into the message text — text
files as fenced blocks with a language tag inferred from the extension, images as
`[Attached image: name (base64)]` followed by the data URL — and prepends that to your typed
message. Attached chips render above the input via `FileChips`.

**State** — `useFileAttachments` component state; cleared after send.

---

## Context search

Keyword search over the workspace, used two ways.

**As a tool** — `searchContext` is available to the agent (top 5 files, 500-line budget). The
system prompt tells it to prefer this over browsing directories.

**Automatically** — `buildContext` injects context when the last user message contains any of
~60 code-related keywords (`function`, `bug`, `refactor`, `deploy`, `typescript`, …), pulling
the top 3 files and up to 200 lines into the system prompt.

**As an endpoint** — `GET /api/context?q=…&workspace=…`.

**How it ranks** (`lib/context/search.ts`) — walks the workspace skipping `node_modules`,
`.git`, `.next`, `.claw`, `.openpaw`, `dist`, `build`, `.cache`, `__pycache__`, `.venv`,
`venv`, `.turbo`, `coverage`; keeps files with a known code/text extension under 100 KB;
scores +10 per query token in the filename, +5 in the relative path, +1 per matching line.
Matching lines are returned with one line of surrounding context, capped at 30 per file.

It is a plain substring scorer — no index, no embeddings — so it re-walks the tree on every
call.

---

## Voice input

**Where** — The microphone button in the input bar (`components/chat/VoiceInput.tsx`).

Uses the browser's Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`). The
button renders only where the API exists — in practice Chromium-based browsers; it is absent
in Firefox and on the server. Configured as `continuous: false`, `interimResults: true`,
`lang: "en-US"`, so it transcribes a single utterance and stops.

Interim transcripts replace the input text as you speak. Click again to stop; recognition is
aborted on unmount.

---

## Cat avatar

A small ambient companion that reacts to the conversation (`components/cat/CatAvatar.tsx`,
`CatFace.tsx`). `MessageBubble` also uses `CatFace` as the assistant's avatar.

`useCatReactions(status, messageCount, hasError)` maps chat state to moods:

| Trigger | Mood |
|---------|------|
| Error | `error` — "Hiss! Something broke..." |
| `ready` → `submitted` | `curious` |
| Streaming | `typing` |
| Streaming → `ready` with new messages | `happy`, back to `idle` after 5 s |
| 2 minutes idle | `sleeping` |

Idle picks a random flavour message ("Purring softly...", "*stretches*", …).

**State** — `lib/store/cat.ts` (`mood`, `message`, `visible`), in-memory only.

---

## Session templates and projects

Two smaller quality-of-life features in `lib/store/sessions.ts`.

**Templates** — `BUILT_IN_TEMPLATES` provides Code Review, Debug Session, Documentation,
Project Setup, and Test Writer. They render as a grid (`TemplatesGrid`) in the empty state of
a new chat. Creating a session from a template names it after the template, applies the
template's `modelId` if set, and queues its `openingMessage` as a pending message that
`ChatInterface` sends automatically. Custom templates can be added and deleted.

**Projects** (`ProjectProfile`) — Named profiles with an icon, a `workspacePath`, and an
optional `preferredModelId`. Activating one via `ProjectSwitcher` switches the workspace path
and, when set, the model.

Both `SessionTemplate` and `ProjectProfile` also declare a `systemPromptAddition` field, but
nothing reads it — it is not appended to the system prompt today.

Both persist under `openpaw-sessions`.

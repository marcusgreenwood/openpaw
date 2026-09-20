# OpenPaw

AI agent chat app with tools, skills, scheduled tasks, and multi-channel support. Chat in the browser, or connect via Telegram, Slack, or WhatsApp.

---

## Core Features

- **Chat** — Multi-model support (Claude, GPT, Gemini, Kimi) with streaming, tool use, and persistent sessions
- **Tools** — Bash, filesystem, code execution, browser automation (agent-browser)
- **Skills** — Built-in and installable skills for coding, bash, agent-browser, scheduled tasks, and more
- **Scheduled Tasks** — Cron jobs that run bash commands or AI prompts on a schedule
- **Workflows** — Multi-step pipelines of commands, prompts, and conditions with live run output
- **Memory** — Optional long-term memory via Minns: the agent recalls facts and past sessions
- **Compare Mode** — Run one prompt against 2-3 models side by side
- **Conversation Branches** — Fork a conversation at any message and explore alternatives
- **Session Sharing** — Publish a read-only snapshot of a session with live viewer presence
- **Workspace** — Configurable working directory for file ops and commands
- **Context Search** — Keyword search over the workspace, auto-injected into code-related chats
- **Git Status** — Live branch and working-tree state for the workspace
- **Tool Approval & Audit Log** — Optionally approve each tool call; review everything that ran
- **Notifications** — In-app alerts for cron successes and failures
- **Voice Input** — Dictate messages using the browser's speech recognition
- **Channels** — Optional webhooks for Telegram, Slack, WhatsApp, Discord, Google Chat
- **Usage Tracking** — Per-session token usage and cost estimates

---

## Chat

- **Sessions** — Multiple chat sessions with persistent message history (stored in localStorage)
- **Model Switcher** — Switch between Claude, GPT, Gemini, and Kimi models per session
- **Streaming** — Real-time streaming responses with tool calls and multi-step reasoning
- **Generative UI** — Renders Tailwind HTML blocks, Tremor charts, code blocks, file diffs, and terminal output
- **askChoice** — The agent can present clickable multiple-choice options for quick user decisions
- **Attachments** — Drop in text files (up to 100KB) and images (up to 5MB) to include in a message
- **Voice Input** — Dictate a message with the microphone button (browser speech recognition)
- **Templates & Projects** — Start a session from a template, or switch projects to swap workspace and model together

---

## Workflows

Chain steps into a repeatable pipeline from the **Workflows** panel:

- **Command steps** — Run a shell command in the workspace
- **Prompt steps** — Send text to the agent; `{{previousOutput}}` is substituted with the previous step's output
- **Condition steps** — Branch to a named step based on an expression over the previous output

Runs stream step-by-step over SSE, so you see each step start, finish, and fail in
real time. A failing step stops the run unless it is marked "continue on error".
Built-in examples ship with the app: **Test & Fix**, **Build & Deploy**, and
**Daily Report**.

---

## Memory (Minns)

Optional long-term memory powered by [Minns](https://minns.ai). When configured,
the agent recalls relevant facts, past experiences, and learned strategies before
each response and records the exchange afterwards. It also gets `saveMemory`,
`recallMemory`, and `listMemories` tools.

Configure via `MINNS_API_KEY` / `MINNS_PROJECT_ID`, or in **Settings → Memory**.
Everything works without it — memory simply stays disabled.

---

## Compare Mode

Run the same prompt against two or three models at once and see their answers,
token counts, and latency side by side. Each model is raced against a 30 s
timeout, so one slow provider does not hold up the rest, and a model that fails
reports its error in place rather than breaking the comparison. Compare mode uses
plain text generation — no tools.

---

## Conversation Branches

Fork a conversation from any message to explore an alternative direction without
losing the original. Each branch keeps its own message history, and the branch
selector switches between them. Deleting a branch returns you to the main thread.

---

## Session Sharing

Publish a read-only snapshot of a session to `/shared/<id>`. Re-sharing updates
the snapshot in place. Viewers are tracked with a 30-second presence window, so
the presence indicator shows who is currently reading along.

---

## Notifications

Cron results and other alerts appear in the notification bell in the header, with
an unread count. Notifications are transient — the server keeps the most recent
100 in memory and the browser keeps 50 — so they are a live feed, not an archive.

---

## Tool Approval & Audit Log

Turn on tool approval to review each tool call before it runs, with its
parameters shown. Every invocation — approved, denied, or auto-run — is recorded
in the tool audit log with its duration and result, so you can review what the
agent actually did. The log holds the 100 most recent entries and resets on
reload.

---

## Git Status

The header shows the current branch and working-tree state of the workspace, with
counts of staged, modified, and untracked files. Non-repository workspaces simply
show nothing.

---

## Context Search

A dependency-free keyword search over the workspace ranks files by filename,
path, and content matches, returning the best matches with surrounding lines. It
powers three things: the `searchContext` tool, the `/api/context` endpoint, and
automatic context injection — when a message looks code-related, the top matches
are inlined into the system prompt so the agent starts with the right files in
view.

---

## Tools

| Tool | Description |
|------|-------------|
| `executeBash` | Run bash commands in the workspace (scripts, CLI tools, package managers) |
| `readFile` / `writeFile` | Read and write files relative to the workspace |
| `listDirectory` / `createDirectory` | Browse and create directories |
| `executeCode` | Run JavaScript/TypeScript and Python snippets for quick computations |
| `askChoice` | Present multiple-choice options to the user |
| `createCron` / `updateCron` / `deleteCron` / `listCrons` | Create and manage scheduled tasks |

---

## Skills

Skills extend the agent with domain-specific knowledge and workflows. Built-in skills include:

- **agent-browser** — Browser automation: navigate, fill forms, click, screenshot, scrape data
- **coding** — Code generation, refactoring, and project structure
- **bash** — Shell scripting and CLI workflows
- **scheduled-tasks** — Create cron jobs (commands or AI prompts)
- **find-skills** — Search and install skills from the ecosystem
- **skill-manager** — Manage installed skills

Install additional skills with `npx skills add <owner/repo>`. Skills load from `skills/` (built-in) and `workspace/user-skills/` (installed).

---

## Scheduled Tasks (Crons)

Create recurring jobs from the **Crons** panel in the sidebar or via the agent:

- **Command crons** — Run bash commands on a schedule (backups, sync, reports)
- **Prompt crons** — Send an AI prompt and create a new chat session each run (summaries, analysis)

**Run now** — Click "Run now" next to any cron to immediately open a new chat session and execute it there (streaming in real time).

**Scheduling** — Crons run when `/api/crons/run` is called. On Vercel, this is triggered every minute via `vercel.json`. For self-hosted, add a system cron: `* * * * * curl -X POST https://your-app/api/crons/run`.

---

## Workspace

- **Configurable path** — Set in Settings → Workspace (default: `workspace/`)
- **File operations** — All read/write/list/create operations are relative to the workspace
- **Bash commands** — Execute in the workspace directory
- **Public files** — Files in `workspace/public/` are served at `/api/files/<filename>` (screenshots, exports, etc.)

---

## Channels

Connect the agent to external chat platforms via webhooks:

| Channel | Type | Setup |
|---------|------|-------|
| **Telegram** | Custom webhook | Bot token, webhook URL |
| **WhatsApp** | Custom webhook | API credentials |
| **Slack** | Chat SDK | Bot token, signing secret |
| **Discord** | Chat SDK | Bot token, public key |
| **Google Chat** | Chat SDK | Service account key, project ID |

Configure in **Settings → Channels**. Each channel maintains its own conversation sessions.

---

## Command Palette

Press **⌘K** (Mac) or **Ctrl+K** (Windows/Linux) to open:

- **Quick send** — Type a message and send as a new chat
- **Sessions** — Create new chat or switch between recent sessions
- **Switch model** — Change the active model
- **Actions** — Set workspace directory

---

## Settings

Open via the gear icon in the header:

- **Workspace** — Set the working directory for file ops and commands
- **API Keys** — Add Anthropic, OpenAI, Google, or Moonshot API keys (env vars take precedence)
- **Channels** — Configure Telegram, Slack, WhatsApp, Discord, Google Chat webhooks

---

## Documentation

- **[docs/API.md](docs/API.md)** — Complete REST reference for every endpoint, including streaming formats, request/response shapes, and error codes
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Module map, the chat request data flow, and where state lives (server `.claw/` files vs. browser `localStorage`)

---

## Getting Started

### 1. Install dependencies

```bash
npm install --legacy-peer-deps
```

This installs the app, agent-browser, and Chromium. On Linux, if you hit system dependency issues:

```bash
npx agent-browser install --with-deps
```

### 2. Configure API keys

Open the app → **Settings** (gear icon) → **API Keys**. Add at least one provider:

- **Anthropic** — `ANTHROPIC_API_KEY` or save in settings
- **OpenAI** — `OPENAI_API_KEY` or save in settings
- **Google** — `GOOGLE_GENERATIVE_AI_API_KEY` or save in settings
- **Moonshot** — `MOONSHOT_API_KEY` or save in settings

Environment variables take precedence. Only configured providers appear in the model selector.

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start chatting.

---

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Run production server |
| `npm run test:usage` | Run usage tracking tests |

---

## Project Structure

```
app/                    # Next.js app and API routes
  api/
    chat/               # Chat streaming endpoint, plus compare/
    config/             # Default workspace for the client
    context/            # Workspace context search
    crons/              # Cron CRUD and run
    cron-sessions/      # Sessions created by prompt crons
    files/              # Serve workspace/public files
    git/                # Workspace git status
    memory/             # Minns memory browsing and config
    notifications/      # In-app notification feed
    providers/          # API key status and storage
    sessions/           # Per-session usage, session sharing
    skills/             # List, edit, install, and search skills
    terminal/           # Streaming bash execution (SSE)
    webhooks/           # Telegram, WhatsApp, and Chat SDK platforms
    workflows/          # Workflow CRUD and streaming runner
    workspace/          # Directory browsing
  shared/[id]/          # Read-only shared session view
components/             # React UI
  chat/                 # ChatInterface, MessageList, InputBar, CompareMode
  layout/               # Header, Sidebar, CommandPalette, CronsPanel, GitStatus
  generative-ui/        # CodeBlock, FileDiff, TerminalOutput, charts
  workflows/            # Workflow editor, runner, panel
  settings/             # Provider keys, memory settings
  skills/               # Skill cards, editor, marketplace
lib/                    # Core logic
  chat/                 # Handler, config, session store, formatters
  tools/                # Bash, filesystem, executeCode, cron, memory tools
  skills/               # Skill loader and manager
  crons/                # Cron store, runner, cron sessions
  workflows/            # Workflow types and store
  memory/               # Minns client
  models/               # Provider registry and model resolution
  store/                # Zustand stores (sessions, branches, workflows, theme, …)
  usage/                # Token usage and cost tracking
  context/              # Workspace keyword search
  hooks/                # React hooks (providers, attachments, live terminal)
skills/                 # Built-in skills (agent-browser, coding, bash, etc.)
types/                  # Shared TypeScript types
docs/                   # API reference and architecture guide
workspace/              # Default working directory
```

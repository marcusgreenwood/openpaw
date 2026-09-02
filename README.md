# OpenPaw

AI agent chat app with tools, skills, scheduled tasks, and multi-channel support. Chat in the browser, or connect via Telegram, Slack, or WhatsApp.

---

## Documentation

| Document | Contents |
|----------|----------|
| [docs/api-reference.md](docs/api-reference.md) | Every HTTP endpoint: parameters, request/response shapes, status codes |
| [docs/tools.md](docs/tools.md) | The 15 agent tools, their schemas, and the bash safety denylist |
| [docs/configuration.md](docs/configuration.md) | Environment variables, env-vs-UI precedence, and server-side state files |
| [docs/architecture.md](docs/architecture.md) | Chat-turn flow, module map, skills loading, multi-channel path |
| [docs/workflows.md](docs/workflows.md) | The Workflows subsystem: step types, branching, execution, storage |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, scripts, known lint baseline, and how to add tools/routes/skills |

---

## Core Features

- **Chat** — Multi-model support (Claude, GPT, Gemini, Kimi) with streaming, tool use, and persistent sessions
- **Tools** — Bash, filesystem, code execution, workspace search, browser automation (agent-browser)
- **Skills** — Built-in and installable skills for coding, bash, agent-browser, scheduled tasks, and more
- **Scheduled Tasks** — Cron jobs that run bash commands or AI prompts on a schedule
- **Workflows** — Multi-step command / prompt / condition pipelines run from the sidebar ([docs](docs/workflows.md))
- **Compare Mode** — Send one prompt to 2–3 models side by side and pick a winner
- **Memory** — Optional long-term memory via [Minns](https://minns.ai): recall before each turn, record after
- **Notifications** — In-app feed of cron successes and failures
- **Session Sharing** — Publish a session to a read-only `/shared/<id>` page with live viewer presence
- **Git Status** — Branch and working-tree state for the workspace, in the sidebar
- **Voice Input** — Dictate messages into the input bar
- **Command Palette** — ⌘K / Ctrl-K for quick send, session switching, and model changes
- **Workspace** — Configurable working directory for file ops and commands
- **Channels** — Optional webhooks for Telegram, Slack, WhatsApp, Discord, Google Chat
- **Usage Tracking** — Per-session token usage and cost estimates

---

## Chat

- **Sessions** — Multiple chat sessions with persistent message history (stored in localStorage)
- **Model Switcher** — Switch between Claude, GPT, Gemini, and Kimi models per session
- **Streaming** — Real-time streaming responses with tool calls and multi-step reasoning
- **Generative UI** — Renders Tailwind HTML blocks, Tremor charts, code blocks, file diffs, and terminal output
- **askChoice** — The agent can present clickable multiple-choice options for quick user decisions

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
| `searchContext` | Keyword-search the workspace for relevant files and code |
| `saveMemory` / `recallMemory` / `listMemories` | Long-term memory (requires Minns to be configured) |

Full schemas and return values: [docs/tools.md](docs/tools.md).

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
| `npm run lint` | Run ESLint (see [CONTRIBUTING.md](CONTRIBUTING.md) for the known baseline failure) |
| `npm run test:usage` | Run usage tracking tests |

---

## Project Structure

```
app/                    # Next.js app and API routes
  api/                  # 26 route handlers — see docs/api-reference.md
    chat/               #   Streaming chat + compare mode
    channels/           #   Channel status and credentials
    config/             #   Default workspace path
    context/            #   Workspace search
    crons/              #   Cron CRUD and run
    cron-sessions/      #   Sessions created by prompt crons
    files/              #   Serve workspace/public files
    git/                #   Branch and working-tree status
    memory/             #   Minns memories and config
    notifications/      #   In-memory notification feed
    providers/          #   LLM provider key status
    sessions/           #   Per-session usage, session sharing
    skills/             #   List, install, edit, search skills
    terminal/           #   Streaming shell execution
    webhooks/           #   Telegram, WhatsApp, and Chat SDK platforms
    workflows/          #   Workflow CRUD and execution
    workspace/          #   Directory validation and listing
  shared/[id]/          # Public read-only view of a shared session
components/             # React UI
  chat/                 # ChatInterface, MessageList, InputBar, CompareMode, VoiceInput
  layout/               # Header, Sidebar, CommandPalette, CronsPanel, GitStatus
  workflows/            # WorkflowsPanel, WorkflowEditor, WorkflowRunner
  settings/             # ProviderKeysPanel, MemorySettings
  skills/               # SkillCard, SkillEditor, SkillMarketplace
  generative-ui/        # CodeBlock, FileDiff, TerminalOutput, charts
  ui/                   # Shared primitives
lib/                    # Core logic — see docs/architecture.md
  chat/                 # Handler, config, session store, webhook verification
  models/               # Provider registry and model resolution
  tools/                # The 15 agent tools
  skills/               # Skill loader and manager
  crons/                # Cron store, runner, cron sessions
  workflows/            # Workflow types and server-side store
  memory/               # Minns long-term memory client
  context/              # Workspace keyword search
  store/                # Client-side Zustand stores (sessions, workflows, theme, …)
  usage/                # Per-session token and cost tracking
  hooks/                # Shared React hooks
types/                  # Shared TypeScript types
skills/                 # Built-in skills (agent-browser, coding, bash, etc.)
scripts/                # Standalone tsx scripts
workspace/              # Default working directory (gitignored)
```

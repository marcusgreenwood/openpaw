# OpenPaw

AI agent chat app with tools, skills, scheduled tasks, and multi-channel support. Chat in the browser, or connect via Telegram, Slack, or WhatsApp.

---

## Core Features

- **Chat** — Multi-model support (Claude, GPT, Gemini, Kimi) with streaming, tool use, and persistent sessions
- **Tools** — Bash, filesystem, code execution, context search, browser automation (agent-browser)
- **Skills** — Built-in and installable skills for coding, bash, agent-browser, scheduled tasks, and more
- **Scheduled Tasks** — Cron jobs that run bash commands or AI prompts on a schedule
- **Workflows** — Multi-step automations (commands, conditions) with live progress streaming
- **Branching** — Fork a conversation from any message and explore alternatives side by side
- **Compare Mode** — Send one prompt to 2–3 models at once and pick the best response
- **Session Sharing** — Publish a read-only session link with live viewer presence
- **Memory** — Optional long-term memory across sessions, powered by [Minns](https://minns.ai)
- **Live Terminal** — Real-time streaming bash output while a command is still running
- **Attachments** — Drag-and-drop text files and images straight into the conversation
- **Notifications** — In-app bell for cron successes and failures
- **Workspace** — Configurable working directory for file ops and commands
- **Channels** — Optional webhooks for Telegram, Slack, WhatsApp, Discord, Google Chat
- **Usage Tracking** — Per-session token usage and cost estimates

---

## Documentation

Full reference documentation lives in [`docs/`](./docs/README.md):

- **[API Reference](./docs/api.md)** — every REST endpoint with params, responses, status codes, and `curl` examples
- **[Architecture](./docs/architecture.md)** — module map, chat request lifecycle, tool execution, storage model, SSE paths
- **[Features](./docs/features.md)** — workflows, branching, compare mode, sharing, memory, live terminal, and more
- **[Configuration](./docs/configuration.md)** — environment variables, `.claw/` layout, workspace setup, cron scheduling
- **[Skill Authoring](./docs/skills.md)** — `SKILL.md` format, load order, writing and managing skills

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and conventions, and
[.env.example](./.env.example) for a copyable environment template.

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
| `searchContext` | Search the workspace for files and code relevant to a query |
| `askChoice` | Present multiple-choice options to the user |
| `createCron` / `updateCron` / `deleteCron` / `listCrons` | Create and manage scheduled tasks |
| `saveMemory` / `recallMemory` / `listMemories` | Long-term memory (only useful when Minns is configured) |

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
| `npm run lint` | Run ESLint (exits 1 on pre-existing errors — see [CONTRIBUTING.md](./CONTRIBUTING.md)) |
| `npm run test:usage` | Run usage tracking tests (requires `GOOGLE_GENERATIVE_AI_API_KEY`) |

---

## Project Structure

```
app/                    # Next.js app and API routes
  page.tsx              # Chat shell (Header + Sidebar + ChatInterface)
  shared/[id]/          # Read-only view of a shared session
  api/                  # 26 route handlers — see docs/api.md
    chat/               # Chat streaming endpoint (+ compare/)
    config/             # Default workspace
    providers/          # AI provider key status and storage
    sessions/           # Per-session usage, session sharing + presence
    crons/              # Cron CRUD and run
    cron-sessions/      # Sessions created by prompt crons
    workflows/          # Workflow CRUD and SSE run endpoint
    skills/             # List, install, edit, delete, search skills
    memory/             # Minns memory browse and config
    channels/           # Channel status and credentials
    webhooks/           # Telegram, WhatsApp, and Chat SDK platforms
    context/            # Workspace keyword search
    terminal/           # SSE streaming bash
    notifications/      # In-memory notification feed
    files/              # Serve workspace/public files
    git/                # Git status of a directory
    workspace/          # Validate and list a directory
components/             # React UI
  chat/                 # ChatInterface, MessageList, InputBar, BranchSelector,
                        # CompareMode, VoiceInput, SharedSessionView
  layout/               # Header, Sidebar, CommandPalette, CronsPanel,
                        # SettingsModal, NotificationBell, ToolAuditLog
  generative-ui/        # CodeBlock, FileDiff, TerminalOutput, LiveTerminal, charts
  workflows/            # WorkflowsPanel, WorkflowEditor, WorkflowRunner
  skills/               # SkillCard, SkillEditor, SkillMarketplace
  settings/             # ProviderKeysPanel, MemorySettings
  channels/             # ChannelsPanel, ChannelCard
  cat/                  # CatAvatar, CatFace
  ui/                   # Button, Badge, GlassCard, ThemeToggle
lib/                    # Core logic
  chat/                 # Handler, config, API key + channel stores, session stores
  models/               # Provider registry and model resolution
  tools/                # Bash, filesystem, executeCode, cron, memory, context tools
  skills/               # Skill loader and manager
  crons/                # Cron store, runner, cron sessions
  workflows/            # Workflow types and store
  memory/               # Minns client
  context/              # Workspace search
  usage/                # Per-session token usage and cost
  store/                # Zustand stores (sessions, branches, workflows, theme, …)
  hooks/                # useLiveTerminal, useFileAttachments, useCatReactions
  system-prompt.ts/.md  # System prompt template and assembly
types/                  # Shared TypeScript types
scripts/                # test-usage, test-screenshot
docs/                   # Reference documentation
skills/                 # Built-in skills (agent-browser, coding, bash, etc.)
workspace/              # Default working directory
```

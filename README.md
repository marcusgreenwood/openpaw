# OpenPaw

AI agent chat app with tools, skills, and multi-channel support. Chat in the browser, or connect via Telegram, Slack, or WhatsApp.

## Getting Started

### 1. Install dependencies

```bash
npm install --legacy-peer-deps
```

This installs the app, agent-browser, and Chromium (for browser automation). On Linux, if you hit system dependency issues, run:

```bash
npx agent-browser install --with-deps
```

### 2. Configure API keys

Open the app and go to **Settings** (gear icon) → **API Keys**. Add at least one provider:

- **Anthropic** — `ANTHROPIC_API_KEY` or save in settings
- **OpenAI** — `OPENAI_API_KEY` or save in settings
- **Google** — `GOOGLE_GENERATIVE_AI_API_KEY` or save in settings
- **Moonshot** — `MOONSHOT_API_KEY` or save in settings

Environment variables take precedence over saved keys. Only configured providers appear in the model selector.

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start chatting.

## What you get

- **Chat** — Multi-model support (Claude, GPT, Gemini, Kimi) with tool use
- **Tools** — Bash, filesystem, code execution, browser automation (agent-browser)
- **Skills** — Built-in skills for coding, bash, agent-browser, and more
- **Workspace** — File operations and commands run in a configurable workspace directory
- **Channels** — Optional webhooks for Telegram, Slack, WhatsApp

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Run production server |

## Project structure

- `app/` — Next.js app and API routes
- `components/` — React UI components
- `lib/` — Chat handler, tools, skills, config
- `skills/` — Built-in agent skills (agent-browser, coding, bash, etc.)
- `workspace/` — Default working directory for file ops and commands

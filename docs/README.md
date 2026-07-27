# OpenPaw Documentation

Reference documentation for OpenPaw — a Next.js AI agent chat app with tools, skills,
scheduled tasks, workflows, and multi-channel support.

| Page | What it covers |
|------|----------------|
| [API Reference](./api.md) | Every REST endpoint under `app/api/**` — method, path, params, request body, response shape, status codes, and a `curl` example |
| [Architecture](./architecture.md) | Module map, the end-to-end chat request lifecycle, tool execution, the storage model (localStorage vs `.claw/`), and the SSE streaming paths |
| [Features](./features.md) | Workflows, conversation branching, compare mode, session sharing + presence, notifications, tool audit log, Minns memory, live terminal, attachments, context search, voice input, and the cat avatar |
| [Configuration](./configuration.md) | Environment variable reference, env-vs-Settings precedence, the `.claw/` file layout, workspace configuration, and cron scheduling |
| [Skill Authoring](./skills.md) | `SKILL.md` format as parsed by the loader, load order, writing a skill, and installing/searching/editing via the skills manager |

## Also see

- [README.md](../README.md) — product overview and getting started
- [CONTRIBUTING.md](../CONTRIBUTING.md) — dev environment, commands, conventions, and the branch/PR flow
- [AGENTS.md](../AGENTS.md) — notes for agent runs in this repo
- [skills/README.md](../skills/README.md) — the file-output convention for skills
- [.env.example](../.env.example) — copyable template of every supported environment variable

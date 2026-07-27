# OpenPaw Skills

This directory holds the **built-in** skills that ship with OpenPaw. Each subdirectory
contains a `SKILL.md` whose frontmatter and body are injected into the agent's system prompt.

For the `SKILL.md` format, the load order across `skills/` and `workspace/user-skills/`, how
to author a new skill, and how to install/search/edit/delete skills via the skills manager and
the `/api/skills*` endpoints, see **[docs/skills.md](../docs/skills.md)**.

Built-in skills cannot be edited or deleted through the app (`/api/skills/[name]` returns
`403` for anything with `source: "built-in"`) — change them here in the repo instead.

## File output convention

**Skills that save files** (screenshots, images, PDFs, exports) must instruct the agent to use `public/` for output paths. Files in `workspace/public/` are served at `/api/files/<filename>`.

- ✅ `public/screenshot.png` → `/api/files/screenshot.png`
- ❌ Never use the project root `public/` (Next.js static folder)

The agent gets this from the system prompt. For CLI tools that resolve paths from project root (e.g. agent-browser), add them to `OUTPUT_PATH_REWRITE_PATTERNS` in `lib/tools/bash.ts`.

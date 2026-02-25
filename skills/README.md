# OpenPaw Skills

## File output convention

**Skills that save files** (screenshots, images, PDFs, exports) must instruct the agent to use `public/` for output paths. Files in `workspace/public/` are served at `/api/files/<filename>`.

- ✅ `public/screenshot.png` → `/api/files/screenshot.png`
- ❌ Never use the project root `public/` (Next.js static folder)

The agent gets this from the system prompt. For CLI tools that resolve paths from project root (e.g. agent-browser), add them to `OUTPUT_PATH_REWRITE_PATTERNS` in `lib/tools/bash.ts`.

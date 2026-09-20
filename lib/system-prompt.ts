/**
 * @file System prompt assembly.
 *
 * Renders `lib/system-prompt.md` by substituting the current date/time, a
 * workspace section, and the installed skills. The template is cached briefly so
 * repeated requests do not re-read it from disk.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Skill } from "@/types";

const PROMPT_PATH = path.join(process.cwd(), "lib", "system-prompt.md");

let cachedPrompt: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10_000;

async function loadPromptTemplate(): Promise<string> {
  if (cachedPrompt && Date.now() - cachedAt < CACHE_TTL_MS) return cachedPrompt;
  cachedPrompt = await fs.readFile(PROMPT_PATH, "utf-8");
  cachedAt = Date.now();
  return cachedPrompt;
}

/**
 * Builds the agent's system prompt from the markdown template.
 *
 * Substitutes three placeholders: `{{CURRENT_DATETIME}}` (so the agent knows the
 * current time), `{{WORKSPACE_SECTION}}` (working-directory and `public/` output
 * conventions, omitted entirely when no workspace is given), and
 * `{{SKILL_BLOCKS}}` (each skill's name, description, and body, or a hint about
 * installing skills when none are loaded).
 *
 * @param skills        - Skills to inline into the prompt.
 * @param workspacePath - Absolute workspace path, if the caller has one.
 * @returns The fully rendered system prompt.
 */
export async function buildSystemPrompt(
  skills: Skill[],
  workspacePath?: string
): Promise<string> {
  const template = await loadPromptTemplate();

  const currentDateTime = new Date().toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });

  const workspaceSection = workspacePath
    ? `## Workspace\n\nYour working directory is: \`${workspacePath}\`\n\n**All bash commands run in this directory** (e.g. \`npx agent-browser\`, scripts, CLI tools). File operations are relative to this directory.\n\n**Files for the frontend (applies to ALL skills and tools):** When any skill or tool saves files for the user to view or download (screenshots, images, PDFs, exports), save them in \`public/\` (i.e. \`workspace/public/\` — never the project root \`public/\`). These are exposed at \`/api/files/<filename>\`. Example: \`public/screenshot.png\` → \`/api/files/screenshot.png\`. Always use \`createDirectory\` to ensure \`public\` exists first. Use \`public/...\` for relative paths; the app rewrites paths for tools that resolve from project root.\n\n---\n\n`
    : "";

  const installedList =
    skills.length > 0
      ? `You have the following skills installed: **${skills.map((s) => s.name).join(", ")}**.\n\n`
      : "";

  const skillFileGuidance =
    skills.length > 0
      ? "**Skills that save files:** Always use `public/` for output paths (screenshots, PDFs, exports). The app rewrites these to the workspace so files are served at `/api/files/<filename>`.\n\n"
      : "";

  const skillBlocks =
    skills.length > 0
      ? installedList +
        skillFileGuidance +
        skills
          .map(
            (s) =>
              `### ${s.name}\n_${s.description}_\n\n${s.body}`
          )
          .join("\n\n---\n\n")
      : "No additional skills loaded. Use `npx skills find <query>` to discover and install skills from the ecosystem.";

  return template
    .replace("{{CURRENT_DATETIME}}", currentDateTime)
    .replace("{{WORKSPACE_SECTION}}", workspaceSection)
    .replace("{{SKILL_BLOCKS}}", skillBlocks);
}

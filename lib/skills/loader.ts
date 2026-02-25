import * as fs from "node:fs/promises";
import * as path from "node:path";
import matter from "gray-matter";
import type { Skill } from "@/types";
import { DEFAULT_WORKSPACE } from "@/lib/chat/config";

/**
 * Directories to scan for skills, in priority order.
 *  1. skills/                         — bundled / built-in skills (project root)
 *  2. user-skills/                    — legacy user-installed skills (project root)
 *  3. <workspace>/user-skills/        — user-installed skills (inside workspace)
 *  4. <workspace>/.claude/skills/    — Claude Code skills (e.g. from npx skills add)
 *
 * Built-in skills in skills/ win on name conflicts.
 * The workspace user-skills folder is the primary install target.
 */
const BUILT_IN_DIR = path.join(process.cwd(), "skills");
const LEGACY_USER_DIR = path.join(process.cwd(), "user-skills");

/** Where new skills are installed — inside the workspace */
export const USER_SKILLS_DIR = path.join(DEFAULT_WORKSPACE, "user-skills");

/**
 * Get workspace-specific skill directories.
 * Use workspacePath when provided (e.g. from active session), else DEFAULT_WORKSPACE.
 */
function getWorkspaceSkillDirs(workspacePath?: string): string[] {
  const workspace = workspacePath
    ? path.resolve(workspacePath)
    : DEFAULT_WORKSPACE;
  const userSkills = path.join(workspace, "user-skills");
  const claudeSkills = path.join(workspace, ".claude", "skills");
  return [userSkills, claudeSkills];
}

function getSkillsDirs(workspacePath?: string): string[] {
  const dirs = [BUILT_IN_DIR, LEGACY_USER_DIR];

  // Add workspace/user-skills/ and workspace/.claude/skills/
  const workspaceDirs = getWorkspaceSkillDirs(workspacePath);
  for (const d of workspaceDirs) {
    if (!dirs.includes(d)) dirs.push(d);
  }

  return dirs;
}

const MAX_SKILL_BODY_LENGTH = 4000;

/** Directories that hold user-installed (non-built-in) skills - varies by workspace */
function getUserDirs(workspacePath?: string): Set<string> {
  return new Set([
    LEGACY_USER_DIR,
    USER_SKILLS_DIR,
    ...getWorkspaceSkillDirs(workspacePath),
  ]);
}

/** List subdirectory names inside a directory (silently returns [] on error) */
async function listSubdirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function loadSkills(workspacePath?: string): Promise<Skill[]> {
  const skills: Skill[] = [];
  const seen = new Set<string>(); // dedupe by skill name
  const userDirs = getUserDirs(workspacePath);

  for (const baseDir of getSkillsDirs(workspacePath)) {
    const dirNames = await listSubdirs(baseDir);

    for (const name of dirNames) {
      const skillFilePath = path.join(baseDir, name, "SKILL.md");
      try {
        const raw = await fs.readFile(skillFilePath, "utf-8");
        const { data, content } = matter(raw);

        if (!data.name || !data.description) {
          continue;
        }

        // Skip duplicates — first directory wins
        if (seen.has(data.name as string)) continue;
        seen.add(data.name as string);

        // Sanitize: strip HTML tags, cap length
        const sanitizedBody = content
          .replace(/<[^>]*>/g, "")
          .trim()
          .slice(0, MAX_SKILL_BODY_LENGTH);

        const isUserSkill = userDirs.has(baseDir);

        skills.push({
          name: data.name as string,
          description: data.description as string,
          version: data.version,
          author: data.author,
          tags: data.tags ?? [],
          body: sanitizedBody,
          filePath: skillFilePath,
          source: isUserSkill ? "user" : "built-in",
        });
      } catch {
        // Missing or malformed SKILL.md — skip
      }
    }
  }

  return skills;
}

import { loadSkills, USER_SKILLS_DIR } from "./loader";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Skill } from "@/types";
import { SKILL_INSTALL_TIMEOUT_MS } from "@/lib/chat/config";

const cache = new Map<string, { skills: Skill[]; time: number }>();
const CACHE_TTL = 10_000;

export async function getSkills(workspacePath?: string): Promise<Skill[]> {
  const key = workspacePath || "__default__";
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.skills;
  }
  const skills = await loadSkills(workspacePath);
  cache.set(key, { skills, time: Date.now() });
  return skills;
}

export function invalidateSkillsCache() {
  cache.clear();
}

/**
 * Install a skill using the Skills CLI.
 *
 * Runs `npx skills add` from a temp directory so the CLI installs into
 * <tmpdir>/.claude/skills/. Then copies the result into user-skills/.
 */
export async function installSkill(
  skillName: string
): Promise<{ success: boolean; output: string }> {
  // Ensure user-skills/ exists
  await fs.mkdir(USER_SKILLS_DIR, { recursive: true });

  // Create a temp working directory for the CLI
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "claw-skills-"));

  return new Promise((resolve) => {
    let output = "";

    const args = [
      "skills",
      "add",
      skillName,
      "--agent",
      "claude-code",
      "--copy",
      "-y",
    ];

    const proc = spawn("npx", args, {
      cwd: tmpDir,
      env: { ...process.env },
      timeout: SKILL_INSTALL_TIMEOUT_MS,
    });

    proc.stdout.on("data", (d: Buffer) => {
      output += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      output += d.toString();
    });

    proc.on("close", async (code) => {
      try {
        if (code === 0) {
          // The CLI installs to <tmpDir>/.claude/skills/<skill-name>/
          const installedDir = path.join(tmpDir, ".claude", "skills");
          const entries = await fs.readdir(installedDir).catch(() => []);

          for (const entry of entries) {
            const src = path.join(installedDir, entry);
            const dest = path.join(USER_SKILLS_DIR, entry);

            // Copy skill directory to user-skills/
            await fs.cp(src, dest, { recursive: true, force: true });
          }
        }
      } catch (err) {
        output += `\nFailed to copy skills: ${err}`;
      } finally {
        // Clean up temp dir
        fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

        invalidateSkillsCache();
        resolve({ success: code === 0, output: output.trim() });
      }
    });

    proc.on("error", (err) => {
      fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      resolve({ success: false, output: err.message });
    });
  });
}

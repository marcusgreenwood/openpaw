import { NextResponse } from "next/server";
import { getSkills, installSkill } from "@/lib/skills/manager";

export const runtime = "nodejs";

/**
 * GET /api/skills
 *
 * Lists all installed skills for the given workspace.
 *
 * Query params:
 *   - `workspace` — optional workspace path override
 *
 * @returns `{ skills: Skill[] }`
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workspacePath = searchParams.get("workspace") || undefined;
  const skills = await getSkills(workspacePath);
  return NextResponse.json({ skills });
}

/**
 * POST /api/skills
 *
 * Installs a skill by name (e.g. "vercel-labs/agent-skills") via the skill
 * manager. Returns the installation result or a 400 error if `skillName` is
 * missing.
 *
 * @returns Installation result from `installSkill`
 */
export async function POST(req: Request) {
  const { skillName } = (await req.json()) as { skillName: string };

  if (!skillName || typeof skillName !== "string") {
    return NextResponse.json(
      { error: "skillName is required" },
      { status: 400 }
    );
  }

  const result = await installSkill(skillName);
  return NextResponse.json(result);
}

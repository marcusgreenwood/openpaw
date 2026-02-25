import { NextResponse } from "next/server";
import { getSkills, installSkill } from "@/lib/skills/manager";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workspacePath = searchParams.get("workspace") || undefined;
  const skills = await getSkills(workspacePath);
  return NextResponse.json({ skills });
}

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

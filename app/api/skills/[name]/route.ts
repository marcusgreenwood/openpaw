import { NextResponse } from "next/server";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getSkills, invalidateSkillsCache } from "@/lib/skills/manager";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const { searchParams } = new URL(req.url);
  const workspacePath = searchParams.get("workspace") || undefined;
  const skills = await getSkills(workspacePath);
  const skill = skills.find((s) => s.name === name);

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  let rawContent = "";
  try {
    rawContent = await fs.readFile(skill.filePath, "utf-8");
  } catch {
    rawContent = "";
  }

  return NextResponse.json({ skill, rawContent });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const { searchParams } = new URL(req.url);
  const workspacePath = searchParams.get("workspace") || undefined;
  const { content } = (await req.json()) as { content: string };

  const skills = await getSkills(workspacePath);
  const skill = skills.find((s) => s.name === name);

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  if (skill.source === "built-in") {
    return NextResponse.json(
      { error: "Cannot edit built-in skills" },
      { status: 403 }
    );
  }

  try {
    await fs.writeFile(skill.filePath, content, "utf-8");
    invalidateSkillsCache();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to save: ${err}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const skills = await getSkills();
  const skill = skills.find((s) => s.name === name);

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  if (skill.source === "built-in") {
    return NextResponse.json(
      { error: "Cannot delete built-in skills" },
      { status: 403 }
    );
  }

  try {
    const skillDir = path.dirname(skill.filePath);
    await fs.rm(skillDir, { recursive: true, force: true });
    invalidateSkillsCache();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to delete: ${err}` },
      { status: 500 }
    );
  }
}

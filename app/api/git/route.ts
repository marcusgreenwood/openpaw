import { NextResponse } from "next/server";
import { execSync } from "node:child_process";

export const runtime = "nodejs";

function runGit(command: string, cwd: string): string {
  try {
    return execSync(command, { cwd, timeout: 5000, encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workspace = searchParams.get("workspace") || process.cwd();

  try {
    const branch = runGit("git branch --show-current", workspace);
    if (!branch) {
      return NextResponse.json({ isRepo: false });
    }

    const porcelain = runGit("git status --porcelain", workspace);
    const lines = porcelain ? porcelain.split("\n").filter(Boolean) : [];

    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];

    for (const line of lines) {
      const index = line[0];
      const work = line[1];
      const file = line.slice(3);

      if (index === "?" && work === "?") {
        untracked.push(file);
      } else {
        if (index !== " " && index !== "?") {
          staged.push(file);
        }
        if (work !== " " && work !== "?") {
          modified.push(file);
        }
      }
    }

    return NextResponse.json({
      isRepo: true,
      branch,
      status: lines.length === 0 ? "clean" : "dirty",
      modified,
      staged,
      untracked,
    });
  } catch {
    return NextResponse.json({ isRepo: false });
  }
}

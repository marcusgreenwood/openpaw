import { NextResponse } from "next/server";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { DEFAULT_WORKSPACE } from "@/lib/chat/config";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dirPath = searchParams.get("path") || DEFAULT_WORKSPACE;

  // Validate path is absolute
  if (!path.isAbsolute(dirPath)) {
    return NextResponse.json(
      { error: "Path must be absolute" },
      { status: 400 }
    );
  }

  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      return NextResponse.json(
        { error: "Path is not a directory" },
        { status: 400 }
      );
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return NextResponse.json({
      path: dirPath,
      valid: true,
      entries: entries
        .filter((e) => !e.name.startsWith("."))
        .map((e) => ({
          name: e.name,
          type: e.isDirectory() ? "directory" : "file",
        }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name);
        }),
    });
  } catch {
    return NextResponse.json(
      { error: "Directory not found or not accessible" },
      { status: 404 }
    );
  }
}

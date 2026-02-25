import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { DEFAULT_WORKSPACE } from "@/lib/chat/config";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".txt": "text/plain",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const workspaceParam = request.nextUrl.searchParams.get("workspace");
  const workspacePath = workspaceParam
    ? path.resolve(workspaceParam)
    : path.resolve(DEFAULT_WORKSPACE);

  const publicDir = path.join(workspacePath, "public");
  const requestedPath = path.join(publicDir, ...pathSegments);
  const resolved = path.resolve(requestedPath);

  // Ensure we only serve from workspace/public (block path traversal)
  if (!resolved.startsWith(path.resolve(publicDir))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      return NextResponse.json({ error: "Not a file" }, { status: 400 });
    }

    const content = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

    return new NextResponse(content, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}

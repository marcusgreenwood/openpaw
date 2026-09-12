/**
 * Workspace context search over lib/context/search.ts.
 * GET /api/context?q=&workspace= — ranks workspace files by relevance to `q` and returns
 * each match's relative path, excerpt lines and score. Missing `q` returns 400.
 *
 * Note: the chat handler calls searchWorkspaceContext() directly to auto-inject context,
 * so this route is not currently consumed by the UI — it exists for external callers.
 */

import { NextRequest, NextResponse } from "next/server";
import * as path from "node:path";
import { searchWorkspaceContext } from "@/lib/context/search";
import { DEFAULT_WORKSPACE } from "@/lib/chat/config";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");
  const workspace = searchParams.get("workspace");

  if (!query) {
    return NextResponse.json(
      { error: "q query param is required" },
      { status: 400 }
    );
  }

  const raw = (workspace || "").trim() || DEFAULT_WORKSPACE;
  const projectRoot = process.cwd();
  let workspacePath = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(projectRoot, raw);
  if (path.resolve(workspacePath) === path.resolve(projectRoot)) {
    workspacePath = path.join(projectRoot, "workspace");
  }

  try {
    const results = await searchWorkspaceContext(query, workspacePath);
    return NextResponse.json({
      files: results.map((r) => ({
        path: r.relativePath,
        relevantLines: r.relevantLines,
        score: r.score,
      })),
    });
  } catch (err) {
    console.error("[context] search error:", err);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}

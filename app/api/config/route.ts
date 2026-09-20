/**
 * Client bootstrap configuration.
 * GET /api/config — returns the server's default workspace directory.
 */

import { NextResponse } from "next/server";
import { DEFAULT_WORKSPACE } from "@/lib/chat/config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ defaultWorkspace: DEFAULT_WORKSPACE });
}

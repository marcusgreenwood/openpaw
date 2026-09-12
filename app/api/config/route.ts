/**
 * Read-only client bootstrap config.
 * GET /api/config — returns { defaultWorkspace } so the Settings UI can show the
 * server-side default before the user picks a workspace.
 */

import { NextResponse } from "next/server";
import { DEFAULT_WORKSPACE } from "@/lib/chat/config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ defaultWorkspace: DEFAULT_WORKSPACE });
}

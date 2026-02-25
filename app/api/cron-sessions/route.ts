/**
 * GET /api/cron-sessions — returns sessions created by cron prompts.
 * DELETE /api/cron-sessions?sessionId=xxx — removes a cron session.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  loadCronSessions,
  deleteCronSession,
} from "@/lib/crons/cron-sessions";

export const runtime = "nodejs";

export async function GET() {
  const sessions = await loadCronSessions();
  return NextResponse.json({ sessions });
}

export async function DELETE(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing sessionId" },
      { status: 400 }
    );
  }
  const deleted = await deleteCronSession(sessionId);
  return NextResponse.json({ deleted });
}

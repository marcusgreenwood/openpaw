/**
 * Per-session token usage and estimated cost.
 * GET /api/sessions/<id>/usage — returns the summary accumulated by
 * lib/usage/session-usage-store.ts as chat responses stream in.
 */

import { NextResponse } from "next/server";
import { getSessionUsageSummary } from "@/lib/usage/session-usage-store";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing session id" }, { status: 400 });
  }
  const summary = getSessionUsageSummary(id);
  return NextResponse.json(summary);
}

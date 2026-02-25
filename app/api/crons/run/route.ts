/**
 * Run cron jobs.
 * POST /api/crons/run — run all due crons (or a single one if id provided)
 * GET /api/crons/run — run all due crons (for Vercel Cron or system cron)
 */

import { NextResponse } from "next/server";
import { runDueCrons, runCronById } from "@/lib/crons/runner";

export const runtime = "nodejs";

export async function GET() {
  const results = await runDueCrons(undefined);
  return Response.json({ ran: results.length, results });
}

export async function POST(req: Request) {
  let workspacePath: string | undefined;
  let id: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    workspacePath = typeof body?.workspacePath === "string" ? body.workspacePath : undefined;
    id = typeof body?.id === "string" ? body.id : undefined;
  } catch {
    workspacePath = undefined;
    id = undefined;
  }

  if (id) {
    const result = await runCronById(id, workspacePath);
    if (!result) {
      return NextResponse.json({ error: "Cron not found" }, { status: 404 });
    }
    return NextResponse.json({ ran: 1, results: [result] });
  }

  const results = await runDueCrons(workspacePath);
  return NextResponse.json({ ran: results.length, results });
}

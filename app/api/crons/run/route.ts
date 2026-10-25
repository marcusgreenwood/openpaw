/**
 * Run cron jobs.
 * POST /api/crons/run — run all due crons (or a single one if id provided)
 * GET /api/crons/run — run all due crons (for Vercel Cron or system cron)
 */

import { NextResponse } from "next/server";
import { runDueCrons, runCronById } from "@/lib/crons/runner";

export const runtime = "nodejs";

/**
 * Run every enabled cron job that is due.
 *
 * `vercel.json` schedules this route every minute (`* * * * *`); a system
 * cron can call it the same way. A job is due when the next fire time of its
 * schedule, counted from `lastRunAt` (or the epoch if it has never run), is
 * not in the future. Jobs run sequentially and the request waits for all of
 * them. No auth or `CRON_SECRET` check is performed, so anyone who can reach
 * the route can trigger due jobs.
 *
 * @returns 200 `{ ran, results: CronRunResult[] }`. Jobs with an invalid
 *   schedule appear in `results` with `success: false`.
 */
export async function GET() {
  const results = await runDueCrons(undefined);
  return Response.json({ ran: results.length, results });
}

/**
 * Run cron jobs on demand.
 *
 * Optional JSON body: `{ id?, workspacePath? }`. A missing or malformed body
 * is treated as empty. With `id`, that job runs immediately whether or not it
 * is due or enabled. Without `id`, this behaves like GET and runs all due
 * jobs. `workspacePath` is a fallback used only by jobs that have no
 * `workspacePath` of their own. As with GET, there is no auth check.
 *
 * @returns 200 `{ ran, results: CronRunResult[] }`, or 404
 *   `{ error: "Cron not found" }` when `id` matches no job.
 */
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

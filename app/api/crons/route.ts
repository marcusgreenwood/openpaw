/**
 * CRUD for scheduled tasks (cron jobs).
 * GET /api/crons — list all
 * POST /api/crons — create or update
 * DELETE /api/crons — delete by id
 */

import { NextResponse } from "next/server";
import {
  loadCrons,
  createCron,
  updateCron,
  deleteCron,
  type CronJob,
} from "@/lib/crons/cron-store";

export const runtime = "nodejs";

/**
 * List all cron jobs stored in `.claw/crons.json`.
 *
 * @returns 200 `{ jobs: CronJob[] }` (an empty array if the file is missing).
 */
export async function GET() {
  const jobs = await loadCrons();
  return NextResponse.json({ jobs });
}

/**
 * Create a cron job, or update one when the body contains an `id`.
 *
 * Update (`id` present): forwards `name`, `schedule`, `type`, `command`,
 * `prompt`, `modelId`, `workspacePath` and `enabled` to `updateCron`. No
 * validation runs, and fields missing from the body are passed as
 * `undefined`, which overwrites the stored value, so send the full job.
 * Responds 404 `{ error: "Cron not found" }` for an unknown id.
 *
 * Create (no `id`): `name` and `schedule` (a cron expression) are required.
 * `type` defaults to `"prompt"` when `prompt` is set, otherwise `"command"`;
 * a `command` job needs `command` and a `prompt` job needs `prompt`.
 * `enabled` defaults to true. The schedule is not parsed here; an invalid
 * expression is only reported when the runner tries to evaluate it.
 *
 * @returns 200 with the created or updated `CronJob`, 400 `{ error }` when a
 *   required field is missing, or 404 on update of an unknown id.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as Partial<CronJob> & { id?: string };

  if (body.id) {
    const updated = await updateCron(body.id, {
      name: body.name,
      schedule: body.schedule,
      type: body.type,
      command: body.command,
      prompt: body.prompt,
      modelId: body.modelId,
      workspacePath: body.workspacePath,
      enabled: body.enabled,
    });
    if (!updated) {
      return NextResponse.json({ error: "Cron not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  }

  const { name, schedule, type, command, prompt, modelId, workspacePath, enabled } = body;
  if (!name || !schedule) {
    return NextResponse.json(
      { error: "name and schedule are required" },
      { status: 400 }
    );
  }
  const jobType = type ?? (prompt ? "prompt" : "command");
  if (jobType === "command" && !command) {
    return NextResponse.json(
      { error: "command is required for type 'command'" },
      { status: 400 }
    );
  }
  if (jobType === "prompt" && !prompt) {
    return NextResponse.json(
      { error: "prompt is required for type 'prompt'" },
      { status: 400 }
    );
  }

  const job = await createCron({
    name,
    schedule,
    type: jobType,
    command,
    prompt,
    modelId,
    workspacePath: workspacePath ?? undefined,
    enabled: enabled ?? true,
  });
  return NextResponse.json(job);
}

/**
 * Delete a cron job by id.
 *
 * The id is read from the `id` query parameter (`DELETE /api/crons?id=...`).
 *
 * @returns 200 `{ success: true }`, 400 `{ error: "id is required" }`, or
 *   404 `{ error: "Cron not found" }`.
 */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const ok = await deleteCron(id);
  if (!ok) {
    return NextResponse.json({ error: "Cron not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

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

export async function GET() {
  const jobs = await loadCrons();
  return NextResponse.json({ jobs });
}

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

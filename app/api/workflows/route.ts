/**
 * CRUD for workflows.
 * GET /api/workflows — list all
 * POST /api/workflows — create workflow
 * PUT /api/workflows — update workflow
 * DELETE /api/workflows — delete by id
 */

import { NextResponse } from "next/server";
import {
  loadWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
} from "@/lib/workflows/workflow-store";
import type { Workflow } from "@/lib/workflows/types";

export const runtime = "nodejs";

/**
 * List all workflows from the workflow store.
 *
 * @returns 200 `{ workflows: Workflow[] }`.
 */
export async function GET() {
  const workflows = await loadWorkflows();
  return NextResponse.json({ workflows });
}

/**
 * Create a workflow.
 *
 * Body: `{ name, steps, description?, icon? }` (see `Workflow` in
 * `lib/workflows/types.ts`). `name` and a non-empty `steps` array are
 * required. `description` defaults to `""` and `icon` to `"⚡"`. Steps are
 * stored as given, without validating their fields. The store assigns `id`,
 * `createdAt` and `updatedAt`.
 *
 * @returns 200 with the created `Workflow`, or
 *   400 `{ error: "name and steps are required" }`.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Workflow>;

  const { name, description, icon, steps } = body;
  if (!name || !steps || steps.length === 0) {
    return NextResponse.json(
      { error: "name and steps are required" },
      { status: 400 }
    );
  }

  const workflow = await createWorkflow({
    name,
    description: description ?? "",
    icon: icon ?? "⚡",
    steps,
  });
  return NextResponse.json(workflow);
}

/**
 * Update a workflow by id.
 *
 * Body: `{ id, name?, description?, icon?, steps? }`, with `id` in the JSON
 * body. The four fields are always forwarded, so any field missing from the
 * body is passed as `undefined` and overwrites the stored value. Send the
 * full workflow.
 *
 * @returns 200 with the updated `Workflow`, 400 `{ error: "id is required" }`,
 *   or 404 `{ error: "Workflow not found" }`.
 */
export async function PUT(req: Request) {
  const body = (await req.json()) as Partial<Workflow> & { id: string };

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updated = await updateWorkflow(body.id, {
    name: body.name,
    description: body.description,
    icon: body.icon,
    steps: body.steps,
  });

  if (!updated) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

/**
 * Delete a workflow by id.
 *
 * The id is read from the `id` query parameter (`DELETE /api/workflows?id=...`).
 *
 * @returns 200 `{ success: true }`, 400 `{ error: "id is required" }`, or
 *   404 `{ error: "Workflow not found" }`.
 */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const ok = await deleteWorkflow(id);
  if (!ok) {
    return NextResponse.json(
      { error: "Workflow not found" },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true });
}

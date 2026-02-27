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

export async function GET() {
  const workflows = await loadWorkflows();
  return NextResponse.json({ workflows });
}

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

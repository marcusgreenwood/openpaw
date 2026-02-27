/**
 * Server-side persistence for workflows.
 * Stores in .claw/workflows.json (same pattern as cron-store.ts)
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Workflow } from "./types";

const CONFIG_PATH = path.join(process.cwd(), ".claw", "workflows.json");

interface StoredWorkflows {
  workflows: Workflow[];
}

export async function loadWorkflows(): Promise<Workflow[]> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const data = JSON.parse(raw) as StoredWorkflows;
    return data.workflows ?? [];
  } catch {
    return [];
  }
}

export async function saveWorkflows(workflows: Workflow[]): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(
    CONFIG_PATH,
    JSON.stringify({ workflows }, null, 2),
    "utf-8"
  );
}

export async function createWorkflow(
  workflow: Omit<Workflow, "id" | "createdAt" | "updatedAt">
): Promise<Workflow> {
  const workflows = await loadWorkflows();
  const id = `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const newWorkflow: Workflow = {
    ...workflow,
    id,
    createdAt: now,
    updatedAt: now,
  };
  workflows.push(newWorkflow);
  await saveWorkflows(workflows);
  return newWorkflow;
}

export async function updateWorkflow(
  id: string,
  updates: Partial<Omit<Workflow, "id" | "createdAt">>
): Promise<Workflow | null> {
  const workflows = await loadWorkflows();
  const idx = workflows.findIndex((w) => w.id === id);
  if (idx < 0) return null;
  workflows[idx] = {
    ...workflows[idx],
    ...updates,
    updatedAt: Date.now(),
  };
  await saveWorkflows(workflows);
  return workflows[idx];
}

export async function deleteWorkflow(id: string): Promise<boolean> {
  const workflows = await loadWorkflows();
  const filtered = workflows.filter((w) => w.id !== id);
  if (filtered.length === workflows.length) return false;
  await saveWorkflows(filtered);
  return true;
}

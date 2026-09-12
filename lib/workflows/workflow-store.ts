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

/**
 * Reads all saved workflows.
 *
 * @returns The stored workflows, or an empty array if the file is missing or unparseable.
 */
export async function loadWorkflows(): Promise<Workflow[]> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const data = JSON.parse(raw) as StoredWorkflows;
    return data.workflows ?? [];
  } catch {
    return [];
  }
}

/**
 * Overwrites the store with `workflows`, creating `.claw/` if needed.
 *
 * @param workflows - The complete list to persist; this is a replace, not a merge.
 */
export async function saveWorkflows(workflows: Workflow[]): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(
    CONFIG_PATH,
    JSON.stringify({ workflows }, null, 2),
    "utf-8"
  );
}

/**
 * Appends a new workflow, assigning its id and timestamps.
 *
 * @param workflow - The definition without `id`, `createdAt` or `updatedAt`.
 * @returns The stored workflow, including the generated `wf_`-prefixed id.
 */
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

/**
 * Merges `updates` into an existing workflow and bumps its `updatedAt`.
 *
 * Note that explicit `undefined` values in `updates` overwrite the stored field, so
 * callers should omit keys they do not intend to change.
 *
 * @param id - Id of the workflow to update.
 * @param updates - Fields to merge; `id` and `createdAt` cannot be changed.
 * @returns The updated workflow, or `null` if no workflow has that id.
 */
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

/**
 * Removes a workflow by id.
 *
 * @param id - Id of the workflow to delete.
 * @returns `true` if a workflow was removed, `false` if the id was not found.
 */
export async function deleteWorkflow(id: string): Promise<boolean> {
  const workflows = await loadWorkflows();
  const filtered = workflows.filter((w) => w.id !== id);
  if (filtered.length === workflows.length) return false;
  await saveWorkflows(filtered);
  return true;
}

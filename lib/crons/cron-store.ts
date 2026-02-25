/**
 * Persistence for scheduled tasks (cron jobs).
 * Stores in .claw/crons.json
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

const CONFIG_PATH = path.join(process.cwd(), ".claw", "crons.json");

export type CronJobType = "command" | "prompt";

export interface CronJob {
  id: string;
  name: string;
  schedule: string; // cron expression, e.g. "0 * * * *" (every hour)
  type: CronJobType;
  /** Bash command when type is "command" */
  command?: string;
  /** AI prompt when type is "prompt" — creates new chat session and sends this */
  prompt?: string;
  workspacePath?: string;
  modelId?: string;
  enabled: boolean;
  lastRunAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface StoredCrons {
  jobs: CronJob[];
}

export async function loadCrons(): Promise<CronJob[]> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const data = JSON.parse(raw) as StoredCrons;
    const jobs = data.jobs ?? [];
    // Migrate legacy crons (no type) to "command"
    return jobs.map((j) => ({
      ...j,
      type: (j as CronJob).type ?? ("command" as CronJobType),
    }));
  } catch {
    return [];
  }
}

export async function saveCrons(jobs: CronJob[]): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(
    CONFIG_PATH,
    JSON.stringify({ jobs }, null, 2),
    "utf-8"
  );
}

export async function createCron(
  job: Omit<CronJob, "id" | "createdAt" | "updatedAt">
): Promise<CronJob> {
  const jobs = await loadCrons();
  const id = `cron_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const type = job.type ?? (job.prompt ? "prompt" : "command");
  const newJob: CronJob = {
    ...job,
    type,
    id,
    createdAt: now,
    updatedAt: now,
  };
  jobs.push(newJob);
  await saveCrons(jobs);
  return newJob;
}

export async function updateCron(
  id: string,
  updates: Partial<Omit<CronJob, "id" | "createdAt">>
): Promise<CronJob | null> {
  const jobs = await loadCrons();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx < 0) return null;
  jobs[idx] = {
    ...jobs[idx],
    ...updates,
    updatedAt: Date.now(),
  };
  await saveCrons(jobs);
  return jobs[idx];
}

export async function deleteCron(id: string): Promise<boolean> {
  const jobs = await loadCrons();
  const filtered = jobs.filter((j) => j.id !== id);
  if (filtered.length === jobs.length) return false;
  await saveCrons(filtered);
  return true;
}

export async function getCron(id: string): Promise<CronJob | null> {
  const jobs = await loadCrons();
  return jobs.find((j) => j.id === id) ?? null;
}

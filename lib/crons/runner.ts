/**
 * Runs due cron jobs. Call from /api/crons/run (e.g. via Vercel Cron or system cron every minute).
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import { loadCrons, updateCron, type CronJob } from "./cron-store";
import { saveCronSession } from "./cron-sessions";
import { DEFAULT_WORKSPACE } from "@/lib/chat/config";
import { getVenvEnv } from "@/lib/python-sandbox";
import { handleChatBlocking } from "@/lib/chat/handler";
import { DEFAULT_MODEL_ID } from "@/lib/models/providers";
import CronExpressionParser from "cron-parser";

export interface CronRunResult {
  id: string;
  name: string;
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
  sessionId?: string;
}

export async function runCronById(
  id: string,
  workspacePath?: string
): Promise<CronRunResult | null> {
  const jobs = await loadCrons();
  const job = jobs.find((j) => j.id === id);
  if (!job) return null;

  const ws = (job.workspacePath || workspacePath || "").trim() || DEFAULT_WORKSPACE;
  const projectRoot = process.cwd();
  const cwd = path.isAbsolute(ws)
    ? path.resolve(ws)
    : path.resolve(projectRoot, ws);

  const type = job.type ?? (job.prompt ? "prompt" : "command");
  let result: CronRunResult;
  if (type === "prompt") {
    const r = await executeCronPrompt(job, ws);
    result = { id: job.id, name: job.name, ...r };
  } else {
    const r = await executeCronCommand(job.command ?? "", cwd);
    result = { id: job.id, name: job.name, ...r };
  }
  await updateCron(job.id, { lastRunAt: Date.now() });
  return result;
}

export async function runDueCrons(
  workspacePath?: string
): Promise<CronRunResult[]> {
  const jobs = await loadCrons();
  const results: CronRunResult[] = [];
  const now = Date.now();

  for (const job of jobs) {
    if (!job.enabled) continue;

    const ws = (job.workspacePath || workspacePath || "").trim() || DEFAULT_WORKSPACE;
    const projectRoot = process.cwd();
    const cwd = path.isAbsolute(ws)
      ? path.resolve(ws)
      : path.resolve(projectRoot, ws);

    try {
      const from = job.lastRunAt ? new Date(job.lastRunAt) : new Date(0);
      const expr = CronExpressionParser.parse(job.schedule, { currentDate: from });
      const next = expr.next().getTime();
      if (now < next) continue; // not due yet
    } catch {
      results.push({ id: job.id, name: job.name, success: false, error: "Invalid cron expression" });
      continue;
    }

    const type = job.type ?? (job.prompt ? "prompt" : "command");
    if (type === "prompt") {
      const result = await executeCronPrompt(job, ws);
      results.push({ id: job.id, name: job.name, ...result });
    } else {
      const result = await executeCronCommand(job.command ?? "", cwd);
      results.push({ id: job.id, name: job.name, ...result });
    }
    await updateCron(job.id, { lastRunAt: now });
  }

  return results;
}

async function executeCronPrompt(
  job: CronJob,
  workspacePath: string
): Promise<{ success: boolean; error?: string; sessionId?: string }> {
  const prompt = job.prompt?.trim();
  if (!prompt) {
    return { success: false, error: "No prompt configured" };
  }

  const sessionId = `cron_${job.id}_${Date.now()}`;
  const modelId = job.modelId ?? DEFAULT_MODEL_ID;
  const title = job.name || prompt.slice(0, 50).replace(/\n/g, " ").trim();

  try {
    const result = await handleChatBlocking(
      [{ role: "user", content: prompt }],
      modelId,
      workspacePath
    );

    const userMessage = {
      id: `user-${sessionId}`,
      role: "user" as const,
      parts: [{ type: "text" as const, text: prompt }],
    };
    const assistantMessage = {
      id: `assistant-${sessionId}`,
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: result.text }],
    };

    await saveCronSession({
      session: {
        id: sessionId,
        title,
        modelId,
        workspacePath,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      messages: [userMessage, assistantMessage],
    });

    return { success: true, sessionId };
  } catch (err) {
    return { success: false, error: String(err), sessionId };
  }
}

async function executeCronCommand(
  command: string,
  cwd: string
): Promise<{ success: boolean; stdout?: string; stderr?: string; exitCode?: number }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    const env = { ...process.env, TERM: "dumb" };
    try {
      const venvEnv = getVenvEnv(cwd);
      Object.assign(env, venvEnv);
    } catch {
      // venv optional
    }

    const proc = spawn("sh", ["-c", `cd '${cwd}' && ${command}`], {
      cwd,
      env,
      timeout: 60_000,
    });

    proc.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        stdout: stdout || undefined,
        stderr: stderr || undefined,
        exitCode: code ?? undefined,
      });
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        stderr: err.message,
      });
    });
  });
}

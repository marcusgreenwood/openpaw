/**
 * @file Cron management tools — create, update, delete, and list scheduled tasks.
 *
 * Supports two task types:
 *  - `command` — executes a bash command in the workspace on each run.
 *  - `prompt`  — spawns a new AI chat session with a detailed prompt on each run.
 *
 * All tools delegate persistence to {@link createCronJob}/{@link updateCronJob}/
 * {@link deleteCronJob}/{@link loadCrons} from the cron-store module.
 */

import { tool } from "ai";
import { z } from "zod";
import {
  createCron as createCronJob,
  updateCron as updateCronJob,
  deleteCron as deleteCronJob,
  loadCrons,
} from "@/lib/crons/cron-store";

/** Shared Zod schema describing the fields common to create and update operations. */
const cronSchema = z.object({
  name: z.string().describe("Short descriptive name for the scheduled task"),
  schedule: z
    .string()
    .describe(
      "Cron expression (e.g. '0 * * * *' = every hour, '0 0 * * *' = daily at midnight, '*/5 * * * *' = every 5 minutes)"
    ),
  type: z
    .enum(["command", "prompt"])
    .optional()
    .describe(
      "Type: 'command' runs a bash command; 'prompt' sends an AI prompt and creates a new chat session"
    ),
  command: z
    .string()
    .optional()
    .describe("Bash command when type is 'command' (executes in workspace directory)"),
  prompt: z
    .string()
    .optional()
    .describe(
      "Detailed AI prompt when type is 'prompt'. Be very specific: include context, desired output format, and any constraints. Creates a new chat session each run."
    ),
  modelId: z
    .string()
    .optional()
    .describe("Model ID for prompt crons (e.g. anthropic/claude-sonnet-4-6)"),
  workspacePath: z.string().optional().describe("Workspace path (default: from session)"),
  enabled: z.boolean().optional().default(true),
});

/**
 * Factory that returns an AI tool for creating a new cron job.
 *
 * Infers `type` from the presence of `prompt` or `command` if not supplied explicitly.
 *
 * @param workspacePath - Default workspace path applied when none is provided in the input.
 * @returns A configured AI tool instance.
 */
export const createCronTool = (workspacePath: string) =>
  tool({
    description:
      "Create a scheduled task (cron job). Use type 'command' for bash scripts (backups, sync, reports). Use type 'prompt' for AI-driven tasks (summaries, analysis, reminders) — the prompt runs in a new chat session each time. For prompts, write a very detailed prompt with full context.",
    inputSchema: cronSchema,
    execute: async (input) => {
      try {
        const type = input.type ?? (input.prompt ? "prompt" : "command");
        if (type === "command" && !input.command) {
          return { error: "command is required for type 'command'" };
        }
        if (type === "prompt" && !input.prompt) {
          return { error: "prompt is required for type 'prompt'" };
        }
        const cron = await createCronJob({
          ...input,
          type,
          command: input.command,
          prompt: input.prompt,
          modelId: input.modelId,
          workspacePath: input.workspacePath || workspacePath || undefined,
        });
        return { success: true, cron };
      } catch (err) {
        return { error: String(err) };
      }
    },
  });

/** Extends {@link cronSchema} with the `id` field required to identify the target job. */
const updateCronSchema = cronSchema.extend({
  id: z.string().describe("ID of the cron job to update"),
});

/**
 * Factory that returns an AI tool for updating an existing cron job.
 *
 * Only fields present in the input are forwarded to the store; omitted optional
 * fields leave the existing values unchanged.
 *
 * @param workspacePath - Fallback workspace path when none is provided in the input.
 * @returns A configured AI tool instance.
 */
export const updateCronTool = (workspacePath: string) =>
  tool({
    description:
      "Update an existing scheduled task. Use when the user wants to change the schedule, command, or enable/disable a cron job.",
    inputSchema: updateCronSchema,
    execute: async (input) => {
      try {
        const updates: Record<string, unknown> = {
          name: input.name,
          schedule: input.schedule,
          workspacePath: input.workspacePath || workspacePath || undefined,
          enabled: input.enabled,
        };
        if (input.type !== undefined) updates.type = input.type;
        if (input.command !== undefined) updates.command = input.command;
        if (input.prompt !== undefined) updates.prompt = input.prompt;
        if (input.modelId !== undefined) updates.modelId = input.modelId;
        const cron = await updateCronJob(input.id, updates);
        if (!cron) return { error: "Cron not found" };
        return { success: true, cron };
      } catch (err) {
        return { error: String(err) };
      }
    },
  });

/**
 * Returns an AI tool for permanently removing a cron job by ID.
 *
 * @returns A configured AI tool instance.
 */
export const deleteCronTool = () =>
  tool({
    description: "Delete a scheduled task. Use when the user wants to remove a cron job.",
    inputSchema: z.object({
      id: z.string().describe("ID of the cron job to delete"),
    }),
    execute: async ({ id }) => {
      try {
        const ok = await deleteCronJob(id);
        if (!ok) return { error: "Cron not found" };
        return { success: true };
      } catch (err) {
        return { error: String(err) };
      }
    },
  });

/**
 * Returns an AI tool that lists all configured cron jobs.
 *
 * @returns A configured AI tool instance.
 */
export const listCronsTool = () =>
  tool({
    description:
      "List all scheduled tasks. Use when the user wants to see what cron jobs are configured.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const jobs = await loadCrons();
        return { crons: jobs };
      } catch (err) {
        return { error: String(err) };
      }
    },
  });

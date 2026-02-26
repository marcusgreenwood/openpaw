import { tool } from "ai";
import { z } from "zod";
import {
  createCron as createCronJob,
  updateCron as updateCronJob,
  deleteCron as deleteCronJob,
  loadCrons,
} from "@/lib/crons/cron-store";

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
 * AI tool factory that creates a new scheduled cron job.
 *
 * Supports two job types:
 *   - `command` — executes a bash command in the workspace directory
 *   - `prompt` — starts a new AI chat session with the supplied prompt each run
 *
 * @param workspacePath - Default workspace path used when none is specified in input
 * @returns Vercel AI SDK tool definition
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

const updateCronSchema = cronSchema.extend({
  id: z.string().describe("ID of the cron job to update"),
});

/**
 * AI tool factory that updates fields on an existing cron job by ID.
 *
 * @param workspacePath - Default workspace path fallback
 * @returns Vercel AI SDK tool definition
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
 * AI tool factory that permanently deletes a cron job by ID.
 *
 * @returns Vercel AI SDK tool definition
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
 * AI tool factory that lists all configured cron jobs.
 *
 * @returns Vercel AI SDK tool definition
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

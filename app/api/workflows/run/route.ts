/**
 * Workflow execution API with SSE streaming.
 * POST /api/workflows/run — accepts { workflowId, workspacePath, steps }
 * Executes steps sequentially and streams results via SSE.
 */

import { exec } from "node:child_process";
import type { WorkflowStep, WorkflowStepResult } from "@/lib/workflows/types";

export const runtime = "nodejs";

/**
 * Run a shell command with `child_process.exec` and capture its output.
 *
 * The command runs as given. Unlike the `executeBash` tool, it is not checked
 * against `BLOCKED_PATTERNS`. Output is capped at 1 MiB per stream. The
 * promise never rejects. On a non-zero exit, timeout or buffer overflow,
 * `exitCode` is taken from the exec error's `code` (1 when that is absent),
 * and a spawn failure resolves with `exitCode: 1`.
 *
 * @param command - Shell command line.
 * @param cwd - Working directory.
 * @param timeout - Kill the process after this many milliseconds.
 * @returns `{ stdout, stderr, exitCode }`.
 */
function execCommand(
  command: string,
  cwd: string,
  timeout: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = exec(
      command,
      { cwd, timeout, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          exitCode: error ? (error as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0,
        });
      }
    );
    child.on("error", () => {
      resolve({ stdout: "", stderr: "Failed to execute command", exitCode: 1 });
    });
  });
}

/**
 * Evaluate a condition step's expression against the previous step's output.
 *
 * `expression` is arbitrary JavaScript, compiled with `new Function` and run
 * on the server, with the previous output in scope as the string `output`
 * (e.g. `output.includes("PASS")`). The result is coerced to a boolean.
 * Syntax or runtime errors evaluate to false.
 *
 * @param expression - JavaScript expression.
 * @param output - Previous step's output.
 */
function evaluateCondition(expression: string, output: string): boolean {
  try {
    const fn = new Function("output", `return Boolean(${expression})`);
    return fn(output);
  } catch {
    return false;
  }
}

/**
 * Execute workflow steps in order and stream progress as Server-Sent Events.
 *
 * Body: `{ workflowId, workspacePath?, steps }`. The steps in the body are
 * what runs. `workflowId` is not used to load a stored workflow.
 * `workspacePath` (default `process.cwd()`) is the working directory for
 * command steps.
 *
 * Step behaviour, with `{{previousOutput}}` in commands and prompts replaced
 * by the previous step's output:
 * - `command`: runs via {@link execCommand} with `step.timeout` (default
 *   60s). It fails on a non-zero exit code.
 * - `prompt`: not sent to a model. It succeeds immediately and echoes the
 *   expanded prompt as its output.
 * - `condition`: evaluates `step.condition` with {@link evaluateCondition},
 *   then jumps to the step whose id is `onTrue`/`onFalse`. With no target, or
 *   a target id that does not exist, it continues with the next step. Jumps
 *   may go backwards, and nothing guards against loops.
 * - unknown type: marked `skipped`.
 *
 * Events: `step-start` `{ stepId, stepIndex, name, type }`, `step-complete`
 * (a `WorkflowStepResult`) and a final `run-complete` `{ status }` that is
 * `"completed"`, or `"failed"` when a step fails without `continueOnError`.
 *
 * @returns A `text/event-stream` response, or 400 JSON
 *   `{ error: "steps are required" }` when `steps` is missing or empty.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    workflowId: string;
    workspacePath?: string;
    steps: WorkflowStep[];
  };

  const { steps, workspacePath } = body;
  if (!steps || steps.length === 0) {
    return new Response(JSON.stringify({ error: "steps are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cwd = workspacePath || process.cwd();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      let previousOutput = "";
      let currentIndex = 0;

      while (currentIndex < steps.length) {
        const step = steps[currentIndex];
        const timeout = step.timeout ?? 60000;
        const startTime = Date.now();

        send("step-start", {
          stepId: step.id,
          stepIndex: currentIndex,
          name: step.name,
          type: step.type,
        });

        let result: WorkflowStepResult;

        try {
          if (step.type === "command") {
            const cmd = (step.command ?? "").replace(
              /\{\{previousOutput\}\}/g,
              previousOutput
            );
            const { stdout, stderr, exitCode } = await execCommand(cmd, cwd, timeout);
            const output = stdout + (stderr ? `\n${stderr}` : "");
            const success = exitCode === 0;

            result = {
              stepId: step.id,
              status: success ? "success" : "failure",
              output: output.trim(),
              error: success ? undefined : `Exit code: ${exitCode}`,
              durationMs: Date.now() - startTime,
            };
            previousOutput = output.trim();
          } else if (step.type === "prompt") {
            const prompt = (step.prompt ?? "").replace(
              /\{\{previousOutput\}\}/g,
              previousOutput
            );
            result = {
              stepId: step.id,
              status: "success",
              output: `[Prompt sent to AI]\n\n${prompt}`,
              durationMs: Date.now() - startTime,
            };
            previousOutput = prompt;
          } else if (step.type === "condition") {
            const conditionResult = evaluateCondition(
              step.condition ?? "false",
              previousOutput
            );

            result = {
              stepId: step.id,
              status: "success",
              output: `Condition evaluated to: ${conditionResult}`,
              durationMs: Date.now() - startTime,
            };

            send("step-complete", result);

            const targetId = conditionResult ? step.onTrue : step.onFalse;
            if (targetId) {
              const targetIndex = steps.findIndex((s) => s.id === targetId);
              if (targetIndex >= 0) {
                currentIndex = targetIndex;
                continue;
              }
            }
            currentIndex++;
            continue;
          } else {
            result = {
              stepId: step.id,
              status: "skipped",
              output: "Unknown step type",
              durationMs: Date.now() - startTime,
            };
          }
        } catch (err) {
          result = {
            stepId: step.id,
            status: "failure",
            error: err instanceof Error ? err.message : "Unknown error",
            durationMs: Date.now() - startTime,
          };
        }

        send("step-complete", result);

        if (result.status === "failure" && !step.continueOnError) {
          send("run-complete", { status: "failed" });
          controller.close();
          return;
        }

        currentIndex++;
      }

      send("run-complete", { status: "completed" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

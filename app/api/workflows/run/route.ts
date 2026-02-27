/**
 * Workflow execution API with SSE streaming.
 * POST /api/workflows/run — accepts { workflowId, workspacePath, steps }
 * Executes steps sequentially and streams results via SSE.
 */

import { exec } from "node:child_process";
import type { WorkflowStep, WorkflowStepResult } from "@/lib/workflows/types";

export const runtime = "nodejs";

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

function evaluateCondition(expression: string, output: string): boolean {
  try {
    const fn = new Function("output", `return Boolean(${expression})`);
    return fn(output);
  } catch {
    return false;
  }
}

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

import { spawn } from "node:child_process";
import * as path from "node:path";
import { DEFAULT_WORKSPACE } from "@/lib/chat/config";
import { ensureVenv, getVenvEnv } from "@/lib/python-sandbox";
import { BLOCKED_PATTERNS } from "@/lib/tools/bash";

export const runtime = "nodejs";
export const maxDuration = 120;

const TERMINAL_TIMEOUT_MS = 60_000;

export async function POST(req: Request) {
  const { command, workspacePath: rawWorkspacePath } = (await req.json()) as {
    command?: string;
    workspacePath?: string;
  };

  if (!command || typeof command !== "string") {
    return new Response(JSON.stringify({ error: "command is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return new Response(
        JSON.stringify({ error: "Command matches dangerous pattern" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  const workspacePath = rawWorkspacePath || DEFAULT_WORKSPACE;
  const cwd = path.isAbsolute(workspacePath)
    ? workspacePath
    : path.resolve(process.cwd(), workspacePath);

  await ensureVenv(workspacePath);
  const venvEnv = getVenvEnv(workspacePath);
  const env = { ...process.env, ...venvEnv, TERM: "dumb" };

  const escapedCwd = cwd.replace(/'/g, "'\\''");
  const wrappedCommand = `cd '${escapedCwd}' && ${command}`;

  const encoder = new TextEncoder();
  const startTime = Date.now();

  const stream = new ReadableStream({
    start(controller) {
      const proc = spawn("bash", ["-c", wrappedCommand], { cwd, env });

      let closed = false;
      function close() {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }

      function send(data: Record<string, unknown>) {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // stream may have been cancelled
        }
      }

      const timeout = setTimeout(() => {
        send({
          type: "stderr",
          text: `\nCommand timed out after ${TERMINAL_TIMEOUT_MS / 1000}s`,
        });
        send({
          type: "exit",
          code: 124,
          duration: Date.now() - startTime,
        });
        try {
          process.kill(-proc.pid!, "SIGKILL");
        } catch {
          proc.kill("SIGKILL");
        }
        close();
      }, TERMINAL_TIMEOUT_MS);

      proc.stdout.on("data", (chunk: Buffer) => {
        send({ type: "stdout", text: chunk.toString() });
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        send({ type: "stderr", text: chunk.toString() });
      });

      proc.on("close", (code) => {
        clearTimeout(timeout);
        send({
          type: "exit",
          code: code ?? 0,
          duration: Date.now() - startTime,
        });
        close();
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        send({ type: "stderr", text: err.message });
        send({ type: "exit", code: 1, duration: Date.now() - startTime });
        close();
      });

      // Handle client abort
      if (req.signal) {
        req.signal.addEventListener("abort", () => {
          clearTimeout(timeout);
          try {
            process.kill(-proc.pid!, "SIGINT");
          } catch {
            proc.kill("SIGINT");
          }
          setTimeout(() => {
            try {
              proc.kill("SIGKILL");
            } catch {
              // already dead
            }
          }, 3000);
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

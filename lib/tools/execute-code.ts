import { tool } from "ai";
import { z } from "zod";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { CODE_EXEC_TIMEOUT_MS } from "@/lib/chat/config";
import {
  ensureVenv,
  getVenvPython,
  getVenvEnv,
} from "@/lib/python-sandbox";

function runSpawn(
  cmd: string,
  args: string[],
  opts: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeout: number;
    language: string;
  }
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  language: string;
  timedOut: boolean;
  durationMs: number;
}> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const startTime = Date.now();

    const proc = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-proc.pid!, "SIGKILL");
      } catch {
        proc.kill("SIGKILL");
      }
    }, opts.timeout);

    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout: stdout.trim().slice(0, 50000),
        stderr: timedOut
          ? `Code execution timed out after ${opts.timeout}ms. ${stderr.trim()}`.slice(0, 10000)
          : stderr.trim().slice(0, 10000),
        exitCode: timedOut ? 124 : (code ?? 0),
        language: opts.language,
        timedOut,
        durationMs: Date.now() - startTime,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        stdout: "",
        stderr: err.message,
        exitCode: 1,
        language: opts.language,
        timedOut: false,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

export const executeCode = (workspacePath: string) =>
  tool({
    description:
      "Execute a code snippet in JavaScript/TypeScript (Node.js) or Python. The code is written to a temporary file and executed. Returns stdout, stderr, and exit code.",
    inputSchema: z.object({
      code: z.string().describe("The code to execute"),
      language: z
        .enum(["javascript", "typescript", "python"])
        .describe("The programming language"),
      timeout: z
        .number()
        .optional()
        .default(CODE_EXEC_TIMEOUT_MS)
        .describe(
          `Timeout in milliseconds (default ${CODE_EXEC_TIMEOUT_MS}ms, configurable via CLAW_CODE_EXEC_TIMEOUT_MS env var)`
        ),
    }),
    execute: async ({ code, language, timeout = CODE_EXEC_TIMEOUT_MS }) => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "claw-exec-"));
      const ext =
        language === "python" ? "py" : language === "typescript" ? "ts" : "mjs";
      const tmpFile = path.join(tmpDir, `script.${ext}`);

      try {
        await fs.writeFile(tmpFile, code, "utf-8");

        const baseOpts = {
          cwd: workspacePath,
          timeout,
          language,
        };

        if (language === "python") {
          const useVenv = await ensureVenv(workspacePath);
          if (useVenv) {
            return runSpawn(getVenvPython(workspacePath), [tmpFile], {
              ...baseOpts,
              env: getVenvEnv(workspacePath) as NodeJS.ProcessEnv,
            });
          }
          return runSpawn("python3", [tmpFile], {
            ...baseOpts,
            env: process.env,
          });
        }

        if (language === "typescript") {
          return runSpawn("npx", ["tsx", tmpFile], {
            ...baseOpts,
            env: process.env,
          });
        }

        return runSpawn("node", [tmpFile], {
          ...baseOpts,
          env: process.env,
        });
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    },
  });

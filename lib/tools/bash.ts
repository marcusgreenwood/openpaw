import { tool } from "ai";
import { z } from "zod";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { BASH_TIMEOUT_MS } from "@/lib/chat/config";
import { ensureVenv, getVenvEnv } from "@/lib/python-sandbox";

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,
  /sudo\s+rm/,
  /mkfs/,
  /dd\s+if=/,
  />\s*\/dev\/sd/,
  /chmod\s+-R\s+777\s+\//,
];

/**
 * CLI tools that resolve relative output paths from project root instead of cwd.
 * Add patterns here when a new skill's tool has this behavior.
 * Format: { command: "tool subcommand", subcommand: "screenshot" }
 */
const OUTPUT_PATH_REWRITE_PATTERNS: { command: string; subcommand: string }[] = [
  { command: "agent-browser", subcommand: "screenshot" },
  { command: "agent-browser", subcommand: "pdf" },
];

export const executeBash = (workspacePath: string) =>
  tool({
    description:
      "Execute a bash command in the configured workspace directory. Returns stdout, stderr, and exit code. Use this for running shell commands, installing packages, running scripts, etc.",
    inputSchema: z.object({
      command: z.string().describe("The shell command to execute"),
      timeout: z
        .number()
        .optional()
        .default(BASH_TIMEOUT_MS)
        .describe(
          `Timeout in milliseconds (default ${BASH_TIMEOUT_MS}ms, configurable via CLAW_BASH_TIMEOUT_MS env var)`
        ),
    }),
    execute: async ({ command, timeout = BASH_TIMEOUT_MS }) => {
      for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(command)) {
          return {
            stdout: "",
            stderr: `Blocked: command matches dangerous pattern`,
            exitCode: 1,
            blocked: true,
            timedOut: false,
            durationMs: 0,
          };
        }
      }

      // Use workspace venv so pip install / python use the sandbox
      await ensureVenv(workspacePath);
      const venvEnv = getVenvEnv(workspacePath);
      const env = { ...process.env, ...venvEnv, TERM: "dumb" };

      const cwd = path.isAbsolute(workspacePath)
        ? workspacePath
        : path.resolve(process.cwd(), workspacePath);

      // Some CLI tools resolve relative output paths from project root, not cwd.
      // Rewrite to absolute workspace path so files land in workspace/public.
      let finalCommand = command;
      for (const { command: cmd, subcommand: subcmd } of OUTPUT_PATH_REWRITE_PATTERNS) {
        const re = new RegExp(
          `(npx\\s+)?${cmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+${subcmd}\\s+([^\\s&|;]+)`,
          "g"
        );
        finalCommand = finalCommand.replace(re, (match, npx, filePath) => {
          const p = filePath.replace(/^["']|["']$/g, "").trim();
          if (path.isAbsolute(p)) return match;
          const absolute = path.resolve(cwd, p).replace(/'/g, "'\\''");
          return `${npx ?? ""}${cmd} ${subcmd} '${absolute}'`;
        });
      }

      // Explicitly cd into workspace for other commands
      const escapedCwd = cwd.replace(/'/g, "'\\''");
      const wrappedCommand = `cd '${escapedCwd}' && ${finalCommand}`;

      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const startTime = Date.now();

        const proc = spawn("bash", ["-c", wrappedCommand], {
          cwd,
          env,
        });

        // Manual timeout with proper cleanup (kill entire process group)
        const timer = setTimeout(() => {
          timedOut = true;
          try {
            // Kill the process group to also kill any child processes
            process.kill(-proc.pid!, "SIGKILL");
          } catch {
            proc.kill("SIGKILL");
          }
        }, timeout);

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
              ? `Command timed out after ${timeout}ms. ${stderr.trim()}`.slice(0, 10000)
              : stderr.trim().slice(0, 10000),
            exitCode: timedOut ? 124 : (code ?? 0),
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
            timedOut: false,
            durationMs: Date.now() - startTime,
          });
        });
      });
    },
  });

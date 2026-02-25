/**
 * Python sandbox: workspace-level virtualenv so Python skills run in isolation.
 * - executeCode (Python) uses workspace/.venv/bin/python
 * - executeBash gets VIRTUAL_ENV + PATH so pip install goes to the venv
 *
 * Uses Python 3.14 when available (env OPENPAW_PYTHON_PATH or Homebrew paths)
 * so the app matches the user's shell Python even when Node inherits system PATH.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";

const VENV_DIR = ".venv";

/** Paths to try for Python 3.14 (order matters) */
const PYTHON314_PATHS = [
  process.env.OPENPAW_PYTHON_PATH,
  "/opt/homebrew/opt/python@3.14/bin/python3", // macOS Apple Silicon Homebrew
  "/usr/local/opt/python@3.14/bin/python3", // macOS Intel Homebrew
  "/usr/local/bin/python3", // Common symlink (Homebrew, pyenv, etc.)
].filter(Boolean) as string[];

let cachedPythonPath: string | null = null;

async function getPreferredPython(): Promise<string> {
  if (cachedPythonPath) return cachedPythonPath;
  for (const p of PYTHON314_PATHS) {
    try {
      await fs.access(p);
      cachedPythonPath = p;
      return p;
    } catch {
      continue;
    }
  }
  cachedPythonPath = "python3";
  return "python3";
}

export function getVenvPath(workspacePath: string): string {
  return path.join(workspacePath, VENV_DIR);
}

export function getVenvPython(workspacePath: string): string {
  return path.join(workspacePath, VENV_DIR, "bin", "python");
}

/**
 * Ensure workspace has a Python virtualenv. Creates it if missing.
 */
export async function ensureVenv(workspacePath: string): Promise<boolean> {
  const resolved = path.isAbsolute(workspacePath)
    ? workspacePath
    : path.resolve(process.cwd(), workspacePath);
  const venvPath = getVenvPath(resolved);
  const pythonPath = getVenvPython(resolved);

  try {
    await fs.access(pythonPath);
    return true;
  } catch {
    // Venv doesn't exist, create it
  }

  await fs.mkdir(resolved, { recursive: true });

  const pythonCmd = await getPreferredPython();
  console.log(`[OpenPaw] Creating venv with: ${pythonCmd}`);

  // When using bare "python3", prepend common Python 3.14 paths so it resolves correctly
  const baseEnv = { ...process.env };
  if (pythonCmd === "python3") {
    const extra = [
      "/opt/homebrew/opt/python@3.14/bin",
      "/usr/local/opt/python@3.14/bin",
      "/usr/local/bin",
    ].join(path.delimiter);
    baseEnv.PATH = `${extra}${path.delimiter}${baseEnv.PATH ?? ""}`;
  }

  return new Promise((resolve) => {
    const proc = spawn(pythonCmd, ["-m", "venv", venvPath], {
      cwd: resolved,
      env: baseEnv,
      stdio: "pipe",
    });

    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        console.warn(`[OpenPaw] Failed to create venv: ${stderr}`);
        resolve(false);
      }
    });

    proc.on("error", (err) => {
      console.warn(`[OpenPaw] venv creation error:`, err);
      resolve(false);
    });
  });
}

/**
 * Env vars to use so Python/pip use the workspace venv.
 * Use with executeBash so `pip install` goes to the sandbox.
 */
export function getVenvEnv(workspacePath: string): Record<string, string> {
  const venvPath = getVenvPath(workspacePath);
  const venvBin = path.join(venvPath, "bin");
  const pathSep = process.platform === "win32" ? ";" : ":";
  const existingPath = process.env.PATH ?? "";

  return {
    ...process.env,
    VIRTUAL_ENV: venvPath,
    PATH: `${venvBin}${pathSep}${existingPath}`,
  };
}

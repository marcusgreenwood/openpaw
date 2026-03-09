/**
 * @file Filesystem tools — sandboxed read, write, list, and mkdir operations.
 *
 * All paths are resolved relative to the workspace root and validated against a
 * path-traversal check ({@link safeResolve}) before any I/O occurs.
 */

import { tool } from "ai";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Resolves `filePath` relative to `workspacePath` and throws if the result
 * escapes the workspace root (path-traversal guard).
 *
 * @param workspacePath - Absolute path to the workspace root.
 * @param filePath      - User-supplied path (relative or absolute).
 * @returns The safe, resolved absolute path.
 * @throws {Error} If the resolved path is outside the workspace root.
 */
function safeResolve(workspacePath: string, filePath: string): string {
  const resolved = path.resolve(workspacePath, filePath);
  if (!resolved.startsWith(path.resolve(workspacePath))) {
    throw new Error(`Path traversal blocked: ${filePath}`);
  }
  return resolved;
}

/**
 * Factory that returns an AI tool for reading a file from the workspace.
 * Content is capped at 100 000 characters to avoid flooding the context window.
 *
 * @param workspacePath - Workspace root used for path resolution and sandboxing.
 * @returns A configured AI tool instance.
 */
export const readFile = (workspacePath: string) =>
  tool({
    description:
      "Read the contents of a file in the workspace. Returns the file content as text.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to workspace root"),
    }),
    execute: async ({ path: filePath }) => {
      const safePath = safeResolve(workspacePath, filePath);
      const content = await fs.readFile(safePath, "utf-8");
      return {
        path: filePath,
        content: content.slice(0, 100000),
        size: content.length,
      };
    },
  });

/**
 * Factory that returns an AI tool for writing or overwriting a file in the workspace.
 * Parent directories are created automatically. The previous content (if any) is
 * returned in the result so callers can diff or undo.
 *
 * @param workspacePath - Workspace root used for path resolution and sandboxing.
 * @returns A configured AI tool instance.
 */
export const writeFile = (workspacePath: string) =>
  tool({
    description:
      "Write or overwrite a file in the workspace. Creates parent directories automatically.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to workspace root"),
      content: z.string().describe("The content to write to the file"),
    }),
    execute: async ({ path: filePath, content }) => {
      const safePath = safeResolve(workspacePath, filePath);
      let previousContent: string | null = null;
      try {
        previousContent = await fs.readFile(safePath, "utf-8");
      } catch {
        // File doesn't exist yet
      }
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, content, "utf-8");
      return {
        path: filePath,
        written: true,
        previousContent,
        bytesWritten: Buffer.byteLength(content),
      };
    },
  });

/**
 * Factory that returns an AI tool for listing the contents of a workspace directory.
 * Each entry includes its name, type (`"file"` or `"directory"`), and relative path.
 *
 * @param workspacePath - Workspace root used for path resolution and sandboxing.
 * @returns A configured AI tool instance.
 */
export const listDirectory = (workspacePath: string) =>
  tool({
    description:
      "List files and directories at a given path in the workspace.",
    inputSchema: z.object({
      path: z
        .string()
        .default(".")
        .describe("Directory path relative to workspace root"),
    }),
    execute: async ({ path: dirPath }) => {
      const safePath = safeResolve(workspacePath, dirPath);
      const entries = await fs.readdir(safePath, { withFileTypes: true });
      return {
        path: dirPath,
        entries: entries.map((e) => ({
          name: e.name,
          type: e.isDirectory() ? ("directory" as const) : ("file" as const),
          path: path.join(dirPath, e.name),
        })),
      };
    },
  });

/**
 * Factory that returns an AI tool for creating a directory (and all parent directories)
 * inside the workspace. Equivalent to `mkdir -p`.
 *
 * @param workspacePath - Workspace root used for path resolution and sandboxing.
 * @returns A configured AI tool instance.
 */
export const createDirectory = (workspacePath: string) =>
  tool({
    description: "Create a directory (and parent directories) in the workspace.",
    inputSchema: z.object({
      path: z.string().describe("Directory path relative to workspace root"),
    }),
    execute: async ({ path: dirPath }) => {
      const safePath = safeResolve(workspacePath, dirPath);
      await fs.mkdir(safePath, { recursive: true });
      return { path: dirPath, created: true };
    },
  });

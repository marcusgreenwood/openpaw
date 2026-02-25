import { tool } from "ai";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";

function safeResolve(workspacePath: string, filePath: string): string {
  const resolved = path.resolve(workspacePath, filePath);
  if (!resolved.startsWith(path.resolve(workspacePath))) {
    throw new Error(`Path traversal blocked: ${filePath}`);
  }
  return resolved;
}

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

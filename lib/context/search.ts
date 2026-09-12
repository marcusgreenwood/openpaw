/**
 * Keyword search over the files in a workspace.
 *
 * Used to auto-inject relevant source files into the system prompt for code-related
 * questions (see lib/chat/handler.ts) and exposed directly at GET /api/context.
 *
 * This is a dependency-free scan, not an index: every call walks the workspace and reads
 * each candidate file, so results are always current but cost grows with workspace size.
 * Build artifacts and vendor directories are skipped, and files over 100KB are ignored.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

/** Directory names never descended into, to keep the walk off vendored and generated trees. */
const DEFAULT_IGNORE = new Set([
  "node_modules",
  ".git",
  ".next",
  ".claw",
  ".openpaw",
  "dist",
  "build",
  ".cache",
  "__pycache__",
  ".venv",
  "venv",
  ".turbo",
  "coverage",
]);

/** File extensions and bare filenames treated as searchable source. */
const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".swift",
  ".kt",
  ".scala",
  ".php",
  ".lua",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".sql",
  ".graphql",
  ".gql",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".html",
  ".css",
  ".scss",
  ".less",
  ".md",
  ".mdx",
  ".txt",
  ".env",
  ".gitignore",
  ".dockerignore",
  ".editorconfig",
  ".eslintrc",
  ".prettierrc",
  "Makefile",
  "Dockerfile",
  "Procfile",
]);

/** Files larger than this are skipped entirely. */
const MAX_FILE_SIZE = 100 * 1024; // 100KB

/** A single matching file and the lines that matched. */
export interface SearchResult {
  /** Absolute path to the file. */
  path: string;
  /** Path relative to the workspace root, suitable for display. */
  relativePath: string;
  /** Matching lines with surrounding context, each prefixed `<lineNumber>: `. */
  relevantLines: string[];
  /** Relevance score: 10 per filename hit, 5 per path hit, 1 per matching line. */
  score: number;
}

/**
 * Recursively collects every file under `dir`, skipping ignored directory names.
 * Unreadable directories yield an empty list rather than throwing.
 */
async function walkDirectory(
  dir: string,
  ignore: Set<string>
): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (ignore.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDirectory(fullPath, ignore)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

/** True if the file's extension or bare name is in {@link CODE_EXTENSIONS}. */
function isCodeFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);
  return CODE_EXTENSIONS.has(ext) || CODE_EXTENSIONS.has(basename);
}

/** Lowercases the query and splits it into alphanumeric tokens, dropping single characters. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * Finds the workspace files most relevant to a natural-language query.
 *
 * Scores each candidate file by filename, path and line-content matches against the
 * query's tokens, then returns the highest scoring files. Results are additionally capped
 * by `maxTotalLines` across the whole result set so callers can bound how much text this
 * adds to a prompt; files past that budget are returned with an empty `relevantLines`.
 *
 * Per-file failures (unreadable, too large, vanished mid-walk) skip that file silently.
 *
 * @param query - Natural-language text; tokenized to drive matching.
 * @param workspacePath - Absolute path to the workspace root to search.
 * @param maxResults - Maximum number of files to return. Defaults to 5.
 * @param maxTotalLines - Maximum excerpt lines across all results. Defaults to 500.
 * @returns Matching files sorted by descending score. Empty if the query has no usable tokens.
 */
export async function searchWorkspaceContext(
  query: string,
  workspacePath: string,
  maxResults = 5,
  maxTotalLines = 500
): Promise<SearchResult[]> {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const allFiles = await walkDirectory(workspacePath, DEFAULT_IGNORE);
  const codeFiles = allFiles.filter(isCodeFile);

  const results: SearchResult[] = [];

  for (const filePath of codeFiles) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > MAX_FILE_SIZE) continue;
    } catch {
      continue;
    }

    const relativePath = path.relative(workspacePath, filePath);
    const fileNameLower = path.basename(filePath).toLowerCase();
    const relPathLower = relativePath.toLowerCase();

    let score = 0;
    const relevantLines: string[] = [];

    // Score filename matches (higher weight)
    for (const token of queryTokens) {
      if (fileNameLower.includes(token)) {
        score += 10;
      }
      if (relPathLower.includes(token)) {
        score += 5;
      }
    }

    // Score content matches
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    const seenLineIndices = new Set<number>();

    for (const token of queryTokens) {
      for (let i = 0; i < lines.length; i++) {
        if (seenLineIndices.has(i)) continue;
        if (lines[i].toLowerCase().includes(token)) {
          score += 1;
          seenLineIndices.add(i);
          // Include surrounding context (1 line before and after)
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length - 1, i + 1);
          for (let j = start; j <= end; j++) {
            const line = `${j + 1}: ${lines[j]}`;
            if (!relevantLines.includes(line)) {
              relevantLines.push(line);
            }
          }
        }
      }
    }

    if (score > 0) {
      results.push({
        path: filePath,
        relativePath,
        relevantLines: relevantLines.slice(0, 30),
        score,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, maxResults);

  // Enforce total line limit
  let totalLines = 0;
  for (const r of topResults) {
    const remaining = maxTotalLines - totalLines;
    if (remaining <= 0) {
      r.relevantLines = [];
    } else if (r.relevantLines.length > remaining) {
      r.relevantLines = r.relevantLines.slice(0, remaining);
    }
    totalLines += r.relevantLines.length;
  }

  return topResults;
}

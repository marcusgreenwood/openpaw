import * as fs from "node:fs/promises";
import * as path from "node:path";

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

const MAX_FILE_SIZE = 100 * 1024; // 100KB

export interface SearchResult {
  path: string;
  relativePath: string;
  relevantLines: string[];
  score: number;
}

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

function isCodeFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);
  return CODE_EXTENSIONS.has(ext) || CODE_EXTENSIONS.has(basename);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

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

import { NextResponse } from "next/server";
import { spawn } from "node:child_process";

export const runtime = "nodejs";

export interface SkillSearchResult {
  name: string;
  owner: string;
  repo: string;
  description: string;
  stars?: number;
  tags?: string[];
}

const FEATURED_SKILLS: SkillSearchResult[] = [
  {
    name: "agent-browser",
    owner: "nicepkg",
    repo: "agent-skills",
    description:
      "Browser automation: navigate, fill forms, click, screenshot, scrape data",
    tags: ["browser", "automation", "scraping"],
  },
  {
    name: "coding",
    owner: "nicepkg",
    repo: "agent-skills",
    description: "Code generation, refactoring, and project structure",
    tags: ["code", "generation", "refactoring"],
  },
  {
    name: "vercel-composition-patterns",
    owner: "vercel-labs",
    repo: "agent-skills",
    description:
      "Vercel composition patterns for React Server Components and Next.js",
    tags: ["vercel", "react", "nextjs"],
  },
  {
    name: "vercel-react-best-practices",
    owner: "vercel-labs",
    repo: "agent-skills",
    description:
      "Best practices for building React applications with modern patterns",
    tags: ["vercel", "react", "best-practices"],
  },
  {
    name: "vercel-react-native-skills",
    owner: "vercel-labs",
    repo: "agent-skills",
    description: "React Native development patterns and mobile best practices",
    tags: ["vercel", "react-native", "mobile"],
  },
  {
    name: "web-design-guidelines",
    owner: "vercel-labs",
    repo: "agent-skills",
    description:
      "Web design guidelines for accessible, performant UI development",
    tags: ["design", "ui", "accessibility"],
  },
  {
    name: "trello",
    owner: "steipete",
    repo: "clawdis",
    description:
      "Trello board management: create cards, move lists, manage projects",
    tags: ["trello", "project-management", "productivity"],
  },
  {
    name: "weather",
    owner: "steipete",
    repo: "clawdis",
    description: "Weather data retrieval and forecasting utilities",
    tags: ["weather", "api", "data"],
  },
  {
    name: "bash",
    owner: "nicepkg",
    repo: "agent-skills",
    description: "Shell scripting and CLI workflow automation",
    tags: ["bash", "shell", "cli"],
  },
  {
    name: "scheduled-tasks",
    owner: "nicepkg",
    repo: "agent-skills",
    description: "Create and manage cron jobs for recurring tasks and prompts",
    tags: ["cron", "scheduling", "automation"],
  },
  {
    name: "find-skills",
    owner: "nicepkg",
    repo: "agent-skills",
    description: "Search and install skills from the skills ecosystem",
    tags: ["skills", "search", "ecosystem"],
  },
  {
    name: "skill-manager",
    owner: "nicepkg",
    repo: "agent-skills",
    description: "Manage installed skills: list, update, and remove",
    tags: ["skills", "management"],
  },
];

interface CacheEntry {
  results: SkillSearchResult[];
  time: number;
}

const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000;

function parseCliOutput(output: string): SkillSearchResult[] {
  const results: SkillSearchResult[] = [];
  const lines = output.split("\n").filter((l) => l.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(/^(.+?)\s*-\s*(.+?)\s*\((.+?)\/(.+?)\)\s*$/);
    if (match) {
      const [, name, description, owner, repo] = match;
      const tags: string[] = [];
      if (i + 1 < lines.length) {
        const tagLine = lines[i + 1].trim();
        const tagMatch = tagLine.match(/^Tags:\s*(.+)$/i);
        if (tagMatch) {
          tags.push(...tagMatch[1].split(",").map((t) => t.trim()));
          i++;
        }
      }
      results.push({
        name: name.trim(),
        owner: owner.trim(),
        repo: repo.trim(),
        description: description.trim(),
        tags,
      });
    }
  }
  return results;
}

function runSkillsFind(query: string): Promise<string> {
  return new Promise((resolve) => {
    let output = "";
    const proc = spawn("npx", ["skills", "find", query], {
      cwd: process.cwd(),
      env: { ...process.env },
      timeout: 15_000,
    });

    proc.stdout.on("data", (d: Buffer) => {
      output += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      output += d.toString();
    });

    proc.on("close", () => resolve(output));
    proc.on("error", () => resolve(""));
  });
}

function searchFeatured(query: string): SkillSearchResult[] {
  const q = query.toLowerCase();
  return FEATURED_SKILLS.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.owner.toLowerCase().includes(q) ||
      s.repo.toLowerCase().includes(q) ||
      s.tags?.some((t) => t.toLowerCase().includes(q))
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim() || "";

  if (!query) {
    return NextResponse.json({ results: FEATURED_SKILLS });
  }

  const cached = searchCache.get(query);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return NextResponse.json({ results: cached.results });
  }

  let results: SkillSearchResult[] = [];

  try {
    const cliOutput = await runSkillsFind(query);
    results = parseCliOutput(cliOutput);
  } catch {
    // CLI failed — fall through to featured search
  }

  if (results.length === 0) {
    results = searchFeatured(query);
  }

  searchCache.set(query, { results, time: Date.now() });
  return NextResponse.json({ results });
}

import { tool } from "ai";
import { z } from "zod";
import { searchWorkspaceContext } from "@/lib/context/search";

export const searchContext = (workspacePath: string) =>
  tool({
    description:
      "Search the workspace for files and code relevant to a query. Use this to find relevant source files, functions, configurations, or documentation in the project.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Search query — keywords, function names, file names, or concepts to search for"
        ),
    }),
    execute: async ({ query }) => {
      try {
        const results = await searchWorkspaceContext(
          query,
          workspacePath,
          5,
          500
        );

        if (results.length === 0) {
          return {
            results: "No relevant files found for the given query.",
            files: [],
          };
        }

        const formatted = results.map((r) => {
          const header = `## ${r.relativePath} (score: ${r.score})`;
          const snippet =
            r.relevantLines.length > 0
              ? "```\n" + r.relevantLines.join("\n") + "\n```"
              : "(filename match only)";
          return `${header}\n${snippet}`;
        });

        return {
          results: formatted.join("\n\n"),
          files: results.map((r) => ({
            path: r.relativePath,
            score: r.score,
            lineCount: r.relevantLines.length,
          })),
        };
      } catch (err) {
        return {
          results: `Error searching workspace: ${String(err)}`,
          files: [],
        };
      }
    },
  });

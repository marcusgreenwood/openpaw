import { tool } from "ai";
import { z } from "zod";
import {
  isMemoryEnabled,
  saveUserContext,
  searchMemoryFacts,
  getMemories,
  recallMemories,
} from "@/lib/memory/minns-client";

export const saveMemoryTool = (sessionId: string) =>
  tool({
    description:
      "Save a piece of information to long-term memory. Use this to remember user preferences, important facts, or project context for future conversations.",
    inputSchema: z.object({
      text: z
        .string()
        .describe("The fact, preference, or context to remember"),
      type: z
        .string()
        .optional()
        .describe(
          "Category of memory, e.g. 'user_preference', 'project_context', 'important_fact'"
        ),
    }),
    execute: async ({ text }) => {
      try {
        await saveUserContext(text, sessionId);
        return { saved: true, text };
      } catch (err) {
        return { saved: false, error: String(err) };
      }
    },
  });

export const recallMemory = tool({
  description:
    "Search memories for relevant context. Use this to recall previously saved information that may be useful for the current conversation.",
  inputSchema: z.object({
    query: z.string().describe("What to search for in stored memories"),
  }),
  execute: async ({ query }) => {
    try {
      const [claims, memories] = await Promise.all([
        searchMemoryFacts(query),
        getMemories(1, 5),
      ]);

      const parts: string[] = [];

      if (claims && claims.length > 0) {
        parts.push("## Relevant Claims");
        for (const claim of claims) {
          parts.push(`- ${typeof claim === "string" ? claim : JSON.stringify(claim)}`);
        }
      }

      if (memories && memories.length > 0) {
        parts.push("");
        parts.push("## Recent Memories");
        for (const memory of memories) {
          const summary =
            typeof memory === "object" && memory !== null && "summary" in memory
              ? (memory as Record<string, unknown>).summary
              : memory;
          parts.push(`- ${typeof summary === "string" ? summary : JSON.stringify(summary)}`);
        }
      }

      if (parts.length === 0) {
        return { results: "No relevant memories found." };
      }

      return { results: parts.join("\n") };
    } catch (err) {
      return { results: `Error searching memories: ${String(err)}` };
    }
  },
});

export const listMemories = tool({
  description:
    "List the agent's stored memories. Use this to see what information has been saved to long-term memory.",
  inputSchema: z.object({
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of memories to return (default 10)"),
  }),
  execute: async ({ limit = 10 }) => {
    try {
      const memories = await getMemories(1, limit);

      if (!memories || memories.length === 0) {
        return { memories: "No memories stored yet." };
      }

      const parts: string[] = ["## Stored Memories"];
      for (const memory of memories) {
        if (typeof memory === "object" && memory !== null) {
          const m = memory as Record<string, unknown>;
          const summary = m.summary ?? m.text ?? "Unknown";
          const takeaways = m.takeaways ?? m.key_takeaways;
          parts.push(`- **${String(summary)}**`);
          if (takeaways) {
            if (Array.isArray(takeaways)) {
              for (const t of takeaways) {
                parts.push(`  - ${String(t)}`);
              }
            } else {
              parts.push(`  - ${String(takeaways)}`);
            }
          }
        } else {
          parts.push(`- ${String(memory)}`);
        }
      }

      return { memories: parts.join("\n") };
    } catch (err) {
      return { memories: `Error listing memories: ${String(err)}` };
    }
  },
});

export function memoryTools(sessionId: string) {
  if (!isMemoryEnabled()) {
    return {};
  }

  return {
    saveMemory: saveMemoryTool(sessionId),
    recallMemory,
    listMemories,
  };
}

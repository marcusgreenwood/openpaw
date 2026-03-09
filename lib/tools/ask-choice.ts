/**
 * @file Ask-choice tool — presents the user with a set of clickable button options.
 *
 * The tool performs no side effects; it returns the question and options back to
 * the UI layer which renders them as interactive buttons rather than plain text.
 */

import { tool } from "ai";
import { z } from "zod";

/**
 * AI tool that prompts the user to pick one of several predefined options.
 *
 * Renders as clickable buttons in the UI, making it ideal for guided flows
 * such as skill selection, approach confirmation, or file choice.
 *
 * @example
 * askChoice.execute({ question: "Which file?", options: ["a.ts", "b.ts"] });
 */
export const askChoice = tool({
  description:
    "Present the user with multiple choice options to select from. Use when you need the user to pick one option (e.g. which skill to install, which file to edit, which approach to take). The user will see clickable buttons and can respond by clicking. Call this instead of listing options in text.",
  inputSchema: z.object({
    question: z
      .string()
      .describe("Short question or prompt (e.g. 'Which skill would you like to install?')"),
    options: z
      .array(z.string())
      .min(1)
      .max(10)
      .describe("List of options the user can choose from. Each string is one clickable choice."),
  }),
  execute: async ({ question, options }) => {
    return { question, options };
  },
});

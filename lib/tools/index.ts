/**
 * @file Tool registry — composes all per-workspace AI tools into a single record.
 *
 * Call {@link allTools} once per session to obtain the full tool set. Each tool
 * factory receives the workspace path (and optionally the session ID for memory
 * tools) so they can resolve paths and correlate memory entries correctly.
 */

import { executeBash } from "./bash";
import {
  readFile,
  writeFile,
  listDirectory,
  createDirectory,
} from "./filesystem";
import { executeCode } from "./execute-code";
import { askChoice } from "./ask-choice";
import {
  createCronTool,
  updateCronTool,
  deleteCronTool,
  listCronsTool,
} from "./cron";
import { memoryTools } from "./memory";
import { searchContext } from "./context";

/**
 * Assembles the complete set of AI tools for a chat session.
 *
 * All workspace-scoped tools (bash, filesystem, code execution, cron, context search)
 * are bound to `workspacePath`. Memory tools are additionally bound to `sessionId`
 * so that saved facts are correlated to the correct session.
 *
 * @param workspacePath - Absolute path to the active workspace directory.
 * @param sessionId     - Optional session identifier for memory correlation; defaults to `"default"`.
 * @returns A flat record of tool name → tool instance, ready to pass to the AI SDK.
 */
export function allTools(workspacePath: string, sessionId?: string) {
  return {
    askChoice,
    executeBash: executeBash(workspacePath),
    readFile: readFile(workspacePath),
    writeFile: writeFile(workspacePath),
    listDirectory: listDirectory(workspacePath),
    createDirectory: createDirectory(workspacePath),
    executeCode: executeCode(workspacePath),
    createCron: createCronTool(workspacePath),
    updateCron: updateCronTool(workspacePath),
    deleteCron: deleteCronTool(),
    listCrons: listCronsTool(),
    searchContext: searchContext(workspacePath),
    ...memoryTools(sessionId ?? "default"),
  };
}

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
    ...memoryTools(sessionId ?? "default"),
  };
}

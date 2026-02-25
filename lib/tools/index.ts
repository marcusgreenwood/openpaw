import { executeBash } from "./bash";
import {
  readFile,
  writeFile,
  listDirectory,
  createDirectory,
} from "./filesystem";
import { executeCode } from "./execute-code";
import { askChoice } from "./ask-choice";

export function allTools(workspacePath: string) {
  return {
    askChoice,
    executeBash: executeBash(workspacePath),
    readFile: readFile(workspacePath),
    writeFile: writeFile(workspacePath),
    listDirectory: listDirectory(workspacePath),
    createDirectory: createDirectory(workspacePath),
    executeCode: executeCode(workspacePath),
  };
}

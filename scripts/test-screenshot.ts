/**
 * Test that agent-browser screenshots save to workspace/public, not project/public.
 * Run: npx tsx scripts/test-screenshot.ts
 */
import * as path from "node:path";
import * as fs from "node:fs/promises";

const PROJECT_ROOT = path.resolve(process.cwd());
const WORKSPACE = path.join(PROJECT_ROOT, "workspace");
const WORKSPACE_PUBLIC = path.join(WORKSPACE, "public");
const PROJECT_PUBLIC = path.join(PROJECT_ROOT, "public");

async function main() {
  console.log("Testing executeBash agent-browser screenshot path rewrite...\n");

  // Import the actual executeBash tool
  const { DEFAULT_WORKSPACE } = await import("../lib/chat/config");
  const workspacePath = path.resolve(DEFAULT_WORKSPACE);
  const { allTools } = await import("../lib/tools");
  const tools = allTools(workspacePath);
  const executeBash = tools.executeBash as { execute: (args: { command: string }) => Promise<unknown> };

  await fs.mkdir(WORKSPACE_PUBLIC, { recursive: true });

  const testFile = "public/test-screenshot.png";
  const command = `npx agent-browser open https://example.com && npx agent-browser screenshot ${testFile}`;

  console.log("Command:", command);
  console.log("Workspace:", workspacePath);

  const result = (await executeBash.execute({ command })) as {
    stdout: string;
    stderr: string;
    exitCode: number;
  };

  console.log("\nExit code:", result.exitCode);
  if (result.stderr) console.log("Stderr:", result.stderr.slice(0, 300));

  const workspaceFile = path.join(WORKSPACE, testFile);
  const projectFile = path.join(PROJECT_ROOT, testFile);
  const inWorkspace = await fs.stat(workspaceFile).then(() => true).catch(() => false);
  const inProject = await fs.stat(projectFile).then(() => true).catch(() => false);

  console.log("\n--- Result ---");
  console.log("File in workspace/public?", inWorkspace);
  console.log("File in project/public?", inProject);

  if (inWorkspace && !inProject) {
    console.log("\n✓ SUCCESS: Screenshot saved to workspace/public");
  } else if (inProject && !inWorkspace) {
    console.log("\n✗ FAIL: Screenshot saved to project/public");
    process.exit(1);
  } else {
    console.log("\n? Unexpected state");
    process.exit(1);
  }

  await fs.unlink(workspaceFile).catch(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

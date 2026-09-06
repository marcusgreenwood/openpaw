#!/usr/bin/env node
/**
 * Self-install the repo's git hooks. Wired to the `prepare` npm script so a
 * fresh clone gets the commit-msg hook without adding a dependency, and exposed
 * as `npm run hooks:install` for installing or repairing them by hand.
 *
 * Deliberately not on `postinstall`: that already runs `npx agent-browser
 * install`, which downloads Chromium, and a hook install has no business
 * waiting behind it.
 *
 * Deliberately silent no-op when there is nothing to install into: outside a
 * git work tree (tarball / Vercel build), in CI, or with HUSKY=0.
 */

import { chmodSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function bail(reason) {
  if (process.env.DEBUG_GIT_HOOKS) console.error(`install-git-hooks: skipped (${reason})`);
  process.exit(0);
}

if (process.env.CI || process.env.HUSKY === "0") bail("CI or HUSKY=0");

try {
  execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: repoRoot,
    stdio: "ignore",
  });
} catch {
  bail("not a git work tree");
}

const hook = join(repoRoot, ".husky", "commit-msg");
if (!existsSync(hook)) bail(".husky/commit-msg is missing");

// Both layouts resolve to .husky/commit-msg: husky's `_` shim dispatches to the
// sibling user hook, and pointing straight at .husky runs it directly. Only
// .husky/commit-msg is tracked here — husky is not a dependency, and any `_`
// left over from a previous install is untracked (husky writes .husky/_/.gitignore
// containing `*`). So a fresh clone has no `_` and takes the second branch.
const hooksPath = existsSync(join(repoRoot, ".husky", "_", "h")) ? ".husky/_" : ".husky";

// Paths this script is allowed to overwrite: unset, or one it set itself. Any
// other value is somebody else's hook setup (a .githooks/ dir, another tool) and
// silently repointing it would disable their hooks on `npm install`.
const OURS = new Set(["", ".husky", ".husky/_"]);

let current = "";
try {
  current = execFileSync("git", ["config", "--get", "core.hooksPath"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  current = ""; // unset — git exits 1
}

if (current === hooksPath) {
  // already correct
} else if (OURS.has(current)) {
  execFileSync("git", ["config", "core.hooksPath", hooksPath], { cwd: repoRoot });
  console.error(`install-git-hooks: set core.hooksPath=${hooksPath}`);
} else {
  console.error(
    `install-git-hooks: leaving core.hooksPath=${current} alone (not set by this repo).\n` +
      `  the commit-msg hook is NOT active. To enable it:\n` +
      `    git config core.hooksPath ${hooksPath}`,
  );
}

// git only runs hooks that are executable.
try {
  const mode = statSync(hook).mode;
  if ((mode & 0o111) !== 0o111) chmodSync(hook, mode | 0o755);
} catch (error) {
  console.error(`install-git-hooks: could not make ${hook} executable: ${error.message}`);
}

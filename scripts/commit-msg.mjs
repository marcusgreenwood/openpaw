#!/usr/bin/env node
/**
 * Conventional Commits normalizer and validator.
 *
 * Modes:
 *   commit-msg.mjs <file>           git `commit-msg` hook — rewrite the message file in place,
 *                                   reject with exit 1 only what cannot be fixed safely
 *   commit-msg.mjs --check <file>   validate a file, never write it (exit 1 if it needs a rewrite)
 *   commit-msg.mjs --stdin          read stdin, write the normalized message to stdout
 *   commit-msg.mjs --range [range]  audit past commits (default origin/main..HEAD) — read-only,
 *                                   it never rewrites history
 *
 * Invoked by .husky/commit-msg with the commit-message file as argv[2].
 * Bypass with `SKIP_COMMIT_MSG_HOOK=1 git commit ...` (`SKIP_COMMIT_LINT=1` and
 * `HUSKY=0` do the same). See CONTRIBUTING.md.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  EXAMPLES,
  SUBJECT_GRAMMAR,
  isExemptMessage,
  normalizeCommitMessage,
  splitCommitMessage,
  validateCommitMessage,
} from "./lib/commit-message.mjs";
import { lintRange } from "./lib/commit-range.mjs";

const DIM = "\u001b[2m";
const RED = "\u001b[31m";
const YELLOW = "\u001b[33m";
const RESET = "\u001b[0m";

const color = process.stderr.isTTY && !process.env.NO_COLOR;
const c = (code, text) => (color ? `${code}${text}${RESET}` : text);

const USAGE = `usage:
  commit-msg.mjs <file>           normalize and validate a commit-message file in place
  commit-msg.mjs --check <file>   validate only, never write
  commit-msg.mjs --stdin          normalize stdin to stdout
  commit-msg.mjs --range [range]  audit commits in a range (read-only)`;

/**
 * Skips that apply to the hook only. Every one of them is a case where a
 * non-zero exit would break a normal git flow rather than catch a bad message.
 */
function bypassReason() {
  if (process.env.SKIP_COMMIT_MSG_HOOK === "1") return "SKIP_COMMIT_MSG_HOOK=1";
  if (process.env.SKIP_COMMIT_LINT === "1") return "SKIP_COMMIT_LINT=1";
  if (process.env.HUSKY === "0") return "HUSKY=0";
  return null;
}

/**
 * Locate the git dir for the repo this hook is running in.
 *
 * The message file git hands us lives inside it (`<gitdir>/COMMIT_EDITMSG`,
 * `<gitdir>/MERGE_MSG`), so its directory is the fallback when shelling out to
 * git is not possible — that keeps the check working in a worktree or a
 * submodule, where `.git` is a file rather than a directory.
 */
function gitDir(messageFile) {
  try {
    return execFileSync("git", ["rev-parse", "--absolute-git-dir"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return messageFile ? dirname(messageFile) : ".git";
  }
}

/**
 * Is git midway through an operation that writes commit messages of its own?
 *
 * A conflicted merge, a rebase replaying old commits, a cherry-pick or a revert
 * all produce messages the author did not write and often cannot change. The
 * subject-prefix exemptions in commit-message.mjs catch the common shapes; this
 * catches the rest by asking git what it is doing, which is the only answer
 * that stays right when a rebase replays a subject from before the standard.
 *
 * @returns {string|null} the operation in progress, or null
 */
function operationInProgress(messageFile) {
  const dir = gitDir(messageFile);
  const states = [
    ["MERGE_HEAD", "a merge"],
    ["CHERRY_PICK_HEAD", "a cherry-pick"],
    ["REVERT_HEAD", "a revert"],
    ["rebase-merge", "a rebase"],
    ["rebase-apply", "a rebase"],
  ];
  for (const [entry, description] of states) {
    if (existsSync(join(dir, entry))) return description;
  }
  return null;
}

function readMessageFile(file) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    console.error(`commit-msg: cannot read ${file}: ${error.message}`);
    process.exit(1);
  }
}

/** Print the rejection an author has to act on: what is wrong, and what to write instead. */
function reportRejection(text, errors) {
  // The parsed subject, not line 0: git's editor template opens with a blank
  // line and a "#" comment block that the normalizer deliberately preserves, so
  // for an author who wrote below that block line 0 is blank, not the subject.
  const { subject } = splitCommitMessage(text);
  console.error("");
  console.error(c(RED, "✖ commit message does not follow Conventional Commits"));
  console.error("");
  console.error(`  subject: ${subject}`);
  console.error("");
  for (const error of errors) {
    console.error(c(RED, `  - ${error}`));
  }
  console.error("");
  console.error(`  expected: ${SUBJECT_GRAMMAR}`);
  console.error("  examples:");
  for (const example of EXAMPLES) {
    console.error(`    ${example}`);
  }
  console.error("");
  console.error(
    c(DIM, "  see CONTRIBUTING.md — bypass with: SKIP_COMMIT_MSG_HOOK=1 git commit ..."),
  );
  console.error("");
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

/** Hook mode: rewrite the file in place, then accept or reject. */
function runHook(file) {
  const bypass = bypassReason();
  if (bypass) process.exit(0);

  const raw = readMessageFile(file);

  if (isExemptMessage(raw)) process.exit(0);

  const operation = operationInProgress(file);
  if (operation) {
    console.error(c(DIM, `commit-msg: skipped — ${operation} is in progress`));
    process.exit(0);
  }

  const { text, changes } = normalizeCommitMessage(raw);
  if (text !== raw) {
    writeFileSync(file, text, "utf8");
    for (const change of changes) {
      console.error(c(DIM, `commit-msg: normalized: ${change}`));
    }
    const { subject } = splitCommitMessage(text);
    console.error(c(DIM, `commit-msg: subject is now: ${subject}`));
  }

  const { ok, errors, warnings } = validateCommitMessage(text);
  for (const warning of warnings) {
    console.error(c(YELLOW, `commit-msg: warning: ${warning}`));
  }
  if (ok) process.exit(0);

  reportRejection(text, errors);
  process.exit(1);
}

/** Check mode: report without writing. Exits 1 if the file needs a rewrite or fails. */
function runCheck(file) {
  const raw = readMessageFile(file);
  const { text, changes } = normalizeCommitMessage(raw);
  const { ok, errors, warnings } = validateCommitMessage(text);

  for (const warning of warnings) {
    console.error(c(YELLOW, `commit-msg: warning: ${warning}`));
  }

  if (!ok) {
    reportRejection(text, errors);
    process.exit(1);
  }

  if (text !== raw) {
    console.error(c(YELLOW, `commit-msg: ${file} needs normalizing:`));
    for (const change of changes) console.error(`  - ${change}`);
    console.error(`  would become: ${splitCommitMessage(text).subject}`);
    process.exit(1);
  }

  console.error(c(DIM, `commit-msg: ${file} is already conventional`));
  process.exit(0);
}

/** Stdin mode: normalized message to stdout, diagnostics to stderr. */
function runStdin() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch (error) {
    console.error(`commit-msg: cannot read stdin: ${error.message}`);
    process.exit(1);
  }

  const { text, changes } = normalizeCommitMessage(raw);
  process.stdout.write(text);

  for (const change of changes) {
    console.error(c(DIM, `commit-msg: normalized: ${change}`));
  }

  const { ok, errors } = validateCommitMessage(text);
  if (ok) process.exit(0);

  reportRejection(text, errors);
  process.exit(1);
}

/**
 * Range mode: audit past commits.
 *
 * Read-only on purpose. Commits from before this standard existed are expected
 * to fail; rewriting a shared `main` to make them pass would break every clone
 * and open PR for a cosmetic gain, so this mode reports and stops there.
 */
function runRange(range, reportOnly) {
  let result;
  try {
    result = lintRange(range, { log: (line) => console.log(line === "" ? "" : `  ${line}`) });
  } catch (error) {
    console.error(`commit-msg: cannot read the range: ${error.message}`);
    process.exit(reportOnly ? 0 : 1);
  }

  if (result.failed && reportOnly) {
    console.log("  --report-only, not failing the run");
  }
  process.exit(result.failed && !reportOnly ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Argument handling
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const reportOnly = args.includes("--report-only");
const positional = args.filter((arg) => !arg.startsWith("--"));

if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}

if (args.includes("--range")) {
  runRange(positional[0], reportOnly);
} else if (args.includes("--stdin")) {
  runStdin();
} else if (args.includes("--check")) {
  if (!positional[0]) {
    console.error(`commit-msg: --check needs a file\n\n${USAGE}`);
    process.exit(1);
  }
  runCheck(positional[0]);
} else if (positional[0]) {
  runHook(positional[0]);
} else {
  console.error(`commit-msg: no commit message file given\n\n${USAGE}`);
  process.exit(1);
}

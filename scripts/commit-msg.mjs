#!/usr/bin/env node
/**
 * git `commit-msg` hook: auto-fix safe deviations from Conventional Commits,
 * reject what cannot be fixed safely.
 *
 * Invoked by .husky/commit-msg with the commit-message file as argv[2].
 * Bypass with `SKIP_COMMIT_LINT=1 git commit ...` (or `HUSKY=0`).
 */

import { readFileSync, writeFileSync } from "node:fs";

import {
  EXAMPLES,
  SUBJECT_GRAMMAR,
  isExemptMessage,
  normalizeCommitMessage,
  validateCommitMessage,
} from "./lib/commit-message.mjs";

const DIM = "\u001b[2m";
const RED = "\u001b[31m";
const YELLOW = "\u001b[33m";
const RESET = "\u001b[0m";

const color = process.stderr.isTTY && !process.env.NO_COLOR;
const c = (code, text) => (color ? `${code}${text}${RESET}` : text);

if (process.env.SKIP_COMMIT_LINT === "1" || process.env.HUSKY === "0") {
  process.exit(0);
}

const file = process.argv[2];
if (!file) {
  console.error("commit-msg: no commit message file given");
  process.exit(1);
}

let raw;
try {
  raw = readFileSync(file, "utf8");
} catch (error) {
  console.error(`commit-msg: cannot read ${file}: ${error.message}`);
  process.exit(1);
}

if (isExemptMessage(raw)) {
  process.exit(0);
}

const { text, changes } = normalizeCommitMessage(raw);
if (text !== raw) {
  writeFileSync(file, text, "utf8");
  for (const change of changes) {
    console.error(c(DIM, `commit-msg: normalized: ${change}`));
  }
}

const { ok, errors, warnings } = validateCommitMessage(text);

for (const warning of warnings) {
  console.error(c(YELLOW, `commit-msg: warning: ${warning}`));
}

if (ok) {
  process.exit(0);
}

const subject = text.split("\n")[0];
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
console.error(c(DIM, "  see CONTRIBUTING.md — bypass with: SKIP_COMMIT_LINT=1 git commit ..."));
console.error("");
process.exit(1);

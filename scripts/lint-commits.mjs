#!/usr/bin/env node
/**
 * Lint every commit message in a range against the Conventional Commits rules
 * in scripts/lib/commit-message.mjs. Complements the local commit-msg hook by
 * giving CI / PR-level enforcement.
 *
 * Usage:
 *   npm run lint:commits                    # origin/main..HEAD
 *   npm run lint:commits -- <range>         # any git range
 *   npm run lint:commits -- --report-only   # never exit non-zero
 */

import { execFileSync } from "node:child_process";

import { isExemptMessage, validateCommitMessage } from "./lib/commit-message.mjs";

const args = process.argv.slice(2);
const reportOnly = args.includes("--report-only");
const explicitRange = args.find((arg) => !arg.startsWith("--"));

function git(...gitArgs) {
  return execFileSync("git", gitArgs, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function refExists(ref) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function resolveRange() {
  if (explicitRange) return explicitRange;
  for (const base of ["origin/main", "origin/HEAD", "main"]) {
    if (refExists(base)) return `${base}..HEAD`;
  }
  return "HEAD~1..HEAD";
}

const range = resolveRange();

let records;
try {
  // -z gives NUL-separated commits so multi-line bodies stay intact.
  // Merges are listed too, but reported as `skip` via isExemptMessage.
  records = git("log", "-z", "--format=%H%x1f%B", range)
    .split("\0")
    .filter((chunk) => chunk.trim() !== "");
} catch (error) {
  console.error(`lint:commits: cannot read range "${range}": ${error.message}`);
  process.exit(reportOnly ? 0 : 1);
}

if (records.length === 0) {
  console.log(`lint:commits: no commits in ${range}`);
  process.exit(0);
}

let failed = 0;
let exempt = 0;
const failures = [];

console.log(`lint:commits: checking ${records.length} commit(s) in ${range}\n`);

for (const record of records) {
  const separator = record.indexOf("\u001f");
  const sha = record.slice(0, separator).trim().slice(0, 8);
  const message = record.slice(separator + 1);
  const subject = message.split("\n")[0];

  if (isExemptMessage(message)) {
    exempt += 1;
    console.log(`  skip  ${sha}  ${subject}`);
    continue;
  }

  const { ok, errors, warnings } = validateCommitMessage(message);
  console.log(`  ${ok ? "pass" : "FAIL"}  ${sha}  ${subject}`);
  for (const warning of warnings) console.log(`          warning: ${warning}`);
  if (!ok) {
    failed += 1;
    failures.push({ sha, subject, errors });
  }
}

if (failures.length) {
  console.log("");
  for (const failure of failures) {
    console.log(`${failure.sha}  ${failure.subject}`);
    for (const error of failure.errors) console.log(`  - ${error}`);
  }
}

console.log(
  `\nlint:commits: ${records.length - failed - exempt} passed, ${failed} failed, ${exempt} exempt`,
);

if (failed && reportOnly) {
  console.log("lint:commits: --report-only, not failing the run");
}

process.exit(failed && !reportOnly ? 1 : 0);

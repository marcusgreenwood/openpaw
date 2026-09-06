/**
 * Check every commit message in a git rev-range against the rules in
 * ./commit-message.mjs.
 *
 * Read-only by design: it reports, it never rewrites history. Commits made
 * before the standard was written down are expected to fail, and that report is
 * documentation of where the line falls — not a task list. Rewriting a shared
 * `main` to make them pass would break every clone and open PR for a cosmetic
 * gain, so nothing here can do it.
 *
 * Shared by `scripts/lint-commits.mjs` and `scripts/commit-msg.mjs --range` so
 * the two cannot drift apart.
 */

import { execFileSync } from "node:child_process";

import {
  isExemptMessage,
  normalizeCommitMessage,
  splitCommitMessage,
  validateCommitMessage,
} from "./commit-message.mjs";

/** Bases tried, in order, when no range is given. */
const DEFAULT_BASES = ["origin/main", "origin/HEAD", "main"];

/** Separates the sha from the message inside one `git log` record. */
const FIELD_SEPARATOR = "\u001f";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

export function refExists(ref) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} [explicit] a range given on the command line
 * @returns {string} the range to check
 */
export function resolveRange(explicit) {
  if (explicit) return explicit;
  for (const base of DEFAULT_BASES) {
    if (refExists(base)) return `${base}..HEAD`;
  }
  return "HEAD~1..HEAD";
}

/**
 * @param {string} range
 * @returns {{sha: string, subject: string, message: string}[]} newest first, as `git log` orders
 */
export function readRange(range) {
  // -z gives NUL-separated commits, so a multi-line body cannot be mistaken for
  // the next record the way a newline-separated format would allow.
  return git("log", "-z", "--format=%H%x1f%B", range)
    .split("\0")
    .filter((chunk) => chunk.trim() !== "")
    .map((record) => {
      const separator = record.indexOf(FIELD_SEPARATOR);
      const message = record.slice(separator + 1);
      return {
        sha: record.slice(0, separator).trim().slice(0, 8),
        // The parsed subject rather than line 0, matching commit-msg.mjs. `git
        // log` output rarely differs, but a `--cleanup=verbatim` commit can
        // carry a leading blank line, and one rule for "the subject" is worth
        // more than the two characters this saves.
        subject: splitCommitMessage(message).subject,
        message,
      };
    });
}

/**
 * Check a range and print a per-commit report.
 *
 * A failing commit whose message the normalizer *could* have fixed is reported
 * as such, because that is the difference between "this predates the hook" and
 * "this needs a human to name a type".
 *
 * @param {string} [range]
 * @param {{log?: (line: string) => void}} [options]
 * @returns {{range: string, total: number, passed: number, failed: number, exempt: number,
 *            failures: {sha: string, subject: string, errors: string[]}[]}}
 */
export function lintRange(range, { log = console.log } = {}) {
  const resolved = resolveRange(range);
  const commits = readRange(resolved);

  const result = {
    range: resolved,
    total: commits.length,
    passed: 0,
    failed: 0,
    exempt: 0,
    failures: [],
  };

  if (commits.length === 0) {
    log(`no commits in ${resolved}`);
    return result;
  }

  log(`checking ${commits.length} commit(s) in ${resolved}`);
  log("");

  for (const { sha, subject, message } of commits) {
    if (isExemptMessage(message)) {
      result.exempt += 1;
      log(`  skip  ${sha}  ${subject}`);
      continue;
    }

    const { ok, errors, warnings } = validateCommitMessage(message);
    log(`  ${ok ? "pass" : "FAIL"}  ${sha}  ${subject}`);
    for (const warning of warnings) log(`          warning: ${warning}`);

    if (ok) {
      result.passed += 1;
      continue;
    }

    result.failed += 1;
    const normalized = normalizeCommitMessage(message).text;
    const fixed = splitCommitMessage(normalized).subject;
    const autoFixable = validateCommitMessage(normalized).ok;
    if (autoFixable) log(`          auto-fixable: the hook would have written "${fixed}"`);
    result.failures.push({
      sha,
      subject,
      errors: autoFixable ? [...errors, `auto-fixable: "${fixed}"`] : errors,
    });
  }

  if (result.failures.length) {
    log("");
    for (const failure of result.failures) {
      log(`${failure.sha}  ${failure.subject}`);
      for (const error of failure.errors) log(`  - ${error}`);
    }
  }

  log("");
  log(`${result.passed} passed, ${result.failed} failed, ${result.exempt} exempt`);
  return result;
}

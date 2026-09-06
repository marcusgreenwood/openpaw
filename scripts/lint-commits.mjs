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
 *
 * Read-only: it reports, it never rewrites history.
 */

import { lintRange } from "./lib/commit-range.mjs";

const args = process.argv.slice(2);
const reportOnly = args.includes("--report-only");
const explicitRange = args.find((arg) => !arg.startsWith("--"));

const log = (line) => console.log(line === "" ? "" : `lint:commits: ${line}`);

let result;
try {
  result = lintRange(explicitRange, { log });
} catch (error) {
  console.error(`lint:commits: cannot read the range: ${error.message}`);
  process.exit(reportOnly ? 0 : 1);
}

if (result.failed && reportOnly) {
  log("--report-only, not failing the run");
}

process.exit(result.failed && !reportOnly ? 1 : 0);

#!/usr/bin/env node
/**
 * Tests for the commit-msg CLI itself — the hook's exit codes and the text it
 * prints back to the author.
 *
 * test-commit-message.mjs covers the library (normalize/validate). That left the
 * script's own output paths unguarded, and a real bug lived there: the rejection
 * summary read line 0 instead of the parsed subject, so an author who typed
 * below git's editor template was shown `subject:` with nothing after it. These
 * run the CLI as a subprocess so what is asserted is what an author sees.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "commit-msg.mjs");

/**
 * Run the CLI and capture status plus both streams.
 *
 * spawnSync rather than execFileSync: the hook reports on stderr and exits 0 on
 * success, and execFileSync only hands back stdout when it does not throw.
 */
function run(args, { input, env } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    input: input ?? "",
    // NO_COLOR keeps the assertions free of ANSI escapes.
    env: { ...process.env, NO_COLOR: "1", ...env },
  });
  assert.equal(result.error, undefined, `could not run the CLI: ${result.error?.message}`);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Write a commit-message file into a scratch dir and return its path. */
function messageFile(contents) {
  const file = join(mkdtempSync(join(tmpdir(), "commit-msg-cli-")), "COMMIT_EDITMSG");
  writeFileSync(file, contents, "utf8");
  return file;
}

/**
 * The shape git's editor hands the hook: a blank line, git's own `#` block, and
 * the author's subject typed below it rather than on line 1.
 */
const template = (...authorLines) =>
  [
    "",
    ...authorLines,
    "# Please enter the commit message for your changes. Lines starting",
    "# with '#' will be ignored, and an empty message aborts the commit.",
    "#",
    "# On branch nightshift/commit-message-normalizer",
    "",
  ].join("\n");

const belowTemplate = (...authorLines) =>
  [
    "",
    "# Please enter the commit message for your changes. Lines starting",
    "# with '#' will be ignored, and an empty message aborts the commit.",
    "#",
    "# On branch nightshift/commit-message-normalizer",
    ...authorLines,
    "",
  ].join("\n");

// ---------------------------------------------------------------------------
// What a rejected author is shown
// ---------------------------------------------------------------------------

test("a rejection echoes the real subject, not a blank line 0", () => {
  const file = messageFile(belowTemplate("something bogus without a type"));
  const { status, stderr } = run(["--check", file]);

  assert.equal(status, 1);
  assert.match(stderr, /subject: something bogus without a type/);
  assert.doesNotMatch(stderr, /subject: *\n/, "the subject line must not be blank");
  assert.doesNotMatch(stderr, /subject: #/, "git's template must never be echoed as the subject");
});

test("a rejection echoes the subject when it is on line 0 too", () => {
  const file = messageFile(template("something bogus without a type"));
  const { status, stderr } = run(["--check", file]);

  assert.equal(status, 1);
  assert.match(stderr, /subject: something bogus without a type/);
});

test("a rejection names the failing rule and how to bypass", () => {
  const file = messageFile(belowTemplate("nope: not a real type"));
  const { status, stderr } = run(["--check", file]);

  assert.equal(status, 1);
  assert.match(stderr, /"nope"/);
  assert.match(stderr, /SKIP_COMMIT_MSG_HOOK=1/);
});

// ---------------------------------------------------------------------------
// --check
// ---------------------------------------------------------------------------

test("--check reports the normalized subject it would write, not a blank line 0", () => {
  const file = messageFile(belowTemplate("Feature: Added the thing."));
  const before = readFileSync(file, "utf8");
  const { status, stderr } = run(["--check", file]);

  assert.equal(status, 1);
  assert.match(stderr, /would become: feat: added the thing$/m);
  assert.doesNotMatch(stderr, /would become: *\n/, "the preview must not be blank");
  assert.equal(readFileSync(file, "utf8"), before, "--check must never write the file");
});

test("--check passes an already-conventional message without writing", () => {
  const file = messageFile("feat: add commit message normalizer\n");
  const { status, stderr } = run(["--check", file]);

  assert.equal(status, 0);
  assert.match(stderr, /already conventional/);
});

test("--check without a file exits 1 with usage", () => {
  const { status, stderr } = run(["--check"]);

  assert.equal(status, 1);
  assert.match(stderr, /usage:/);
});

// ---------------------------------------------------------------------------
// Hook mode
// ---------------------------------------------------------------------------

test("the hook rewrites the file in place and reports the new subject", () => {
  const file = messageFile("Feature: Added the thing.\n");
  const { status, stderr } = run([file]);

  assert.equal(status, 0);
  assert.match(readFileSync(file, "utf8"), /^feat: added the thing$/m);
  assert.match(stderr, /subject is now: feat: added the thing/);
});

test("the hook accepts a valid subject typed below git's template block", () => {
  const file = messageFile(belowTemplate("feat: add thing below comments"));
  const { status } = run([file]);

  assert.equal(status, 0);
  assert.match(readFileSync(file, "utf8"), /^feat: add thing below comments$/m);
});

test("re-running the hook on its own output is a no-op", () => {
  const file = messageFile(belowTemplate("Feature: Added the thing."));

  assert.equal(run([file]).status, 0);
  const once = readFileSync(file, "utf8");

  const second = run([file]);
  assert.equal(second.status, 0);
  assert.equal(readFileSync(file, "utf8"), once, "the hook must be idempotent");
  assert.doesNotMatch(second.stderr, /normalized:/, "a settled message needs no further changes");
});

test("the hook leaves a message it cannot fix on disk and exits 1", () => {
  const file = messageFile("something bogus without a type\n");
  const { status, stderr } = run([file]);

  assert.equal(status, 1);
  assert.match(stderr, /subject: something bogus without a type/);
});

test("the hook passes git-generated messages straight through", () => {
  const file = messageFile("Merge branch 'main' into nightshift/commit-message-normalizer\n");
  const before = readFileSync(file, "utf8");
  const { status } = run([file]);

  assert.equal(status, 0);
  assert.equal(readFileSync(file, "utf8"), before);
});

test("the documented escape hatches skip the hook entirely", () => {
  for (const env of [
    { SKIP_COMMIT_MSG_HOOK: "1" },
    { SKIP_COMMIT_LINT: "1" },
    { HUSKY: "0" },
  ]) {
    const file = messageFile("something bogus without a type\n");
    const before = readFileSync(file, "utf8");
    const { status } = run([file], { env });

    assert.equal(status, 0, `expected a bypass for ${JSON.stringify(env)}`);
    assert.equal(readFileSync(file, "utf8"), before, "a bypassed hook must not rewrite the file");
  }
});

test("a missing message file exits 1 rather than throwing", () => {
  const { status, stderr } = run([join(tmpdir(), "commit-msg-cli-does-not-exist", "MSG")]);

  assert.equal(status, 1);
  assert.match(stderr, /cannot read/);
});

// ---------------------------------------------------------------------------
// --stdin
// ---------------------------------------------------------------------------

test("--stdin writes the normalized message to stdout", () => {
  const { status, stdout } = run(["--stdin"], { input: "Feature: Added the thing.\n" });

  assert.equal(status, 0);
  assert.equal(stdout, "feat: added the thing\n");
});

test("--stdin exits 1 and reports the real subject when it cannot fix the message", () => {
  const { status, stderr } = run(["--stdin"], {
    input: belowTemplate("something bogus without a type"),
  });

  assert.equal(status, 1);
  assert.match(stderr, /subject: something bogus without a type/);
});

// ---------------------------------------------------------------------------
// --range and --help
// ---------------------------------------------------------------------------

test("--range audits without rewriting history", () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const { status, stdout } = run(["--range", "HEAD~1..HEAD", "--report-only"]);

  assert.equal(status, 0, "--report-only must not fail the run");
  assert.match(stdout, /\d+ passed/);
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    head,
    "an audit must leave history untouched",
  );
});

test("--help prints usage and exits 0", () => {
  const { status, stdout } = run(["--help"]);

  assert.equal(status, 0);
  assert.match(stdout, /commit-msg\.mjs --stdin/);
});

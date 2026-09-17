/**
 * Tests for scripts/prepare-commit-msg.mjs.
 *
 * Uses the built-in node:test runner so the suite adds no dependency.
 * The hook is driven as a real subprocess over a temp message file, which is
 * how git invokes it, so argument handling and exit codes are covered too.
 *
 * Run with: npm run test:commit-template
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HOOK = join(REPO_ROOT, 'scripts', 'prepare-commit-msg.mjs');

/** Git's own comment block, as present when the hook is invoked. */
const GIT_COMMENTS = [
  '',
  '# Please enter the commit message for your changes. Lines starting',
  "# with '#' will be ignored, and an empty message aborts the commit.",
  '#',
  '# On branch main',
  '',
].join('\n');

/** Git's scissors line, verbatim, as emitted under `commit -v`. */
const SCISSORS = '# ------------------------ >8 ------------------------';

/**
 * The buffer git hands the hook under `git commit -v` (or `commit.verbose`):
 * the usual comments, then the scissors line, then the raw staged diff. The
 * diff lines are not comments, so they must not read as author content.
 */
const VERBOSE_COMMENTS = [
  '',
  '# Please enter the commit message for your changes. Lines starting',
  "# with '#' will be ignored, and an empty message aborts the commit.",
  '#',
  '# On branch main',
  '# Changes to be committed:',
  '#\tmodified:   file.txt',
  '#',
  SCISSORS,
  '# Do not modify or remove the line above.',
  '# Everything below it will be ignored.',
  'diff --git a/file.txt b/file.txt',
  'index ce01362..2ee250a 100644',
  '--- a/file.txt',
  '+++ b/file.txt',
  '@@ -1 +1,2 @@',
  ' hello',
  '+change',
  '',
].join('\n');

/**
 * The buffer git hands the hook under `--cleanup=scissors` (or
 * `commit.cleanup=scissors`). Because that mode truncates at the scissors
 * instead of stripping comments, git moves its own status block *below* the
 * scissors and leaves the region above empty — so guidance inserted at the top
 * would be committed verbatim.
 */
const SCISSORS_COMMENTS = [
  '',
  SCISSORS,
  '# Do not modify or remove the line above.',
  '# Everything below it will be ignored.',
  '#',
  '# On branch main',
  '# Changes to be committed:',
  '#\tmodified:   file.txt',
  '',
].join('\n');

/**
 * Initializes a throwaway git repo with the given config, for the cases whose
 * behavior depends on `git config` rather than on the buffer.
 *
 * @param {string[][]} config Key/value config pairs to set.
 * @returns {string} Path to the new repo.
 */
function makeRepo(config = []) {
  const dir = mkdtempSync(join(tmpdir(), 'prepare-commit-msg-repo-'));
  assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
  for (const [key, value] of config) {
    assert.equal(spawnSync('git', ['-C', dir, 'config', key, value]).status, 0);
  }
  return dir;
}

/**
 * Runs the hook against a temp message file and returns the result.
 *
 * @param {string|null} contents Initial message-file contents, or null to omit
 *   the file argument entirely.
 * @param {string} [source] The commit source git would pass as `$2`.
 * @param {string} [cwd] Directory to run the hook in, for git-config cases.
 * @returns {{status: number|null, output: string}} Exit code and final file.
 */
function runHook(contents, source = '', cwd = REPO_ROOT) {
  const dir = mkdtempSync(join(tmpdir(), 'prepare-commit-msg-'));
  try {
    const args = [HOOK];
    let msgFile;
    if (contents !== null) {
      msgFile = join(dir, 'COMMIT_EDITMSG');
      writeFileSync(msgFile, contents);
      args.push(msgFile, source, '');
    }

    const result = spawnSync(process.execPath, args, {
      cwd,
      encoding: 'utf8',
    });

    return {
      status: result.status,
      output: msgFile ? readFileSync(msgFile, 'utf8') : '',
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('appends guidance to an empty interactive commit buffer', () => {
  const { status, output } = runHook(GIT_COMMENTS);
  assert.equal(status, 0);
  assert.match(output, /commit-template v1/);
  assert.match(output, /<type>\(<optional scope>\): <subject>/);
  // The subject line stays first and blank.
  assert.equal(output.split('\n')[0], '');
  // Git's own comment block survives.
  assert.match(output, /Please enter the commit message/);
});

test('lists exactly the ten types allowed by commitlint.config.js', () => {
  const { output } = runHook(GIT_COMMENTS);
  const config = readFileSync(join(REPO_ROOT, 'commitlint.config.js'), 'utf8');
  const afterRule = config.slice(config.indexOf("'type-enum'"));
  // The rule is [level, applicability, [...types]] - take the inner array.
  const enumBlock = afterRule.slice(afterRule.indexOf('[', afterRule.indexOf("'always'")));
  const types = [...enumBlock.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

  assert.equal(types.length, 10);
  for (const type of types) {
    assert.match(output, new RegExp(`^#\\s+${type}\\s`, 'm'), `missing ${type}`);
  }
});

for (const source of ['message', 'template', 'merge', 'squash', 'commit']) {
  test(`leaves the message untouched for source "${source}"`, () => {
    const { status, output } = runHook(GIT_COMMENTS, source);
    assert.equal(status, 0);
    assert.equal(output, GIT_COMMENTS);
  });
}

test('is idempotent when run twice', () => {
  const once = runHook(GIT_COMMENTS).output;
  const twice = runHook(once).output;
  assert.equal(twice, once);
});

test('is a no-op when the buffer already has a subject', () => {
  const existing = `feat: already written\n${GIT_COMMENTS}`;
  const { status, output } = runHook(existing);
  assert.equal(status, 0);
  assert.equal(output, existing);
});

test('exits 0 when the message file argument is missing', () => {
  const { status } = runHook(null);
  assert.equal(status, 0);
});

test('exits 0 when the message file does not exist', () => {
  const result = spawnSync(
    process.execPath,
    [HOOK, join(tmpdir(), 'definitely-not-here-COMMIT_EDITMSG'), '', ''],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  assert.equal(result.status, 0);
});

test('every guidance line is comment-prefixed, so git strips it all', () => {
  const { output } = runHook(GIT_COMMENTS);
  const stripped = spawnSync('git', ['stripspace', '--strip-comments'], {
    input: output,
    encoding: 'utf8',
  });
  assert.equal(stripped.status, 0);
  assert.equal(stripped.stdout, '');
});

test('appends guidance under `git commit -v`, below the scissors untouched', () => {
  const { status, output } = runHook(VERBOSE_COMMENTS);
  assert.equal(status, 0);
  // The whole point: verbose authoring is the mainstream interactive path.
  assert.match(output, /commit-template v1/);
  assert.equal(output.split('\n')[0], '');

  // Guidance sits above the scissors, so git strips it with the comments.
  const lines = output.split('\n');
  const scissors = lines.indexOf(SCISSORS);
  assert.ok(scissors > 0, 'scissors line survived');
  assert.ok(
    lines.indexOf('# commit-template v1 -- see .husky/prepare-commit-msg') <
      scissors,
    'guidance is above the scissors line'
  );

  // The diff below the scissors is passed through byte for byte.
  const diff = VERBOSE_COMMENTS.slice(VERBOSE_COMMENTS.indexOf(SCISSORS));
  assert.ok(output.endsWith(diff), 'diff below the scissors is unchanged');
});

test('is a no-op under `-v` when a subject is already written', () => {
  const existing = `feat: already written\n${VERBOSE_COMMENTS}`;
  const { status, output } = runHook(existing);
  assert.equal(status, 0);
  assert.equal(output, existing);
});

test('every guidance line under `-v` is comment-prefixed', () => {
  const { output } = runHook(VERBOSE_COMMENTS);
  // Take only what git keeps: everything above the scissors line.
  const kept = output.slice(0, output.indexOf(SCISSORS));
  const stripped = spawnSync('git', ['stripspace', '--strip-comments'], {
    input: kept,
    encoding: 'utf8',
  });
  assert.equal(stripped.status, 0);
  assert.equal(stripped.stdout, '');
});

test('under scissors cleanup, guidance goes below the scissors line', () => {
  const { status, output } = runHook(SCISSORS_COMMENTS);
  assert.equal(status, 0);
  // The feature still works -- the author sees the guidance in the editor.
  assert.match(output, /commit-template v1/);

  const lines = output.split('\n');
  const scissors = lines.indexOf(SCISSORS);
  assert.ok(scissors >= 0, 'scissors line survived');
  // Everything above the scissors is committed verbatim in this mode, so the
  // guidance must sit below it, where git truncates unconditionally.
  assert.ok(
    lines.indexOf('# commit-template v1 -- see .husky/prepare-commit-msg') >
      scissors,
    'guidance is below the scissors line'
  );

  // What git keeps is only the region above the scissors: still just a blank
  // subject line, byte for byte what it was before the hook ran.
  const kept = output.slice(0, output.indexOf(SCISSORS));
  assert.equal(kept, SCISSORS_COMMENTS.slice(0, SCISSORS_COMMENTS.indexOf(SCISSORS)));
});

for (const mode of ['verbatim', 'whitespace']) {
  test(`is a no-op under commit.cleanup=${mode}, which strips nothing`, () => {
    const dir = makeRepo([['commit.cleanup', mode]]);
    try {
      const { status, output } = runHook(GIT_COMMENTS, '', dir);
      assert.equal(status, 0);
      assert.equal(output, GIT_COMMENTS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('is a no-op when git says comment lines will be kept', () => {
  // `--cleanup=whitespace` on the command line is invisible to `git config`,
  // but git rewords its own hint from "will be ignored" to "will be kept".
  const buffer = [
    '',
    '# Please enter the commit message for your changes. Lines starting',
    "# with '#' will be kept; you may remove them yourself if you want to.",
    '# An empty message aborts the commit.',
    '',
  ].join('\n');
  const { status, output } = runHook(buffer);
  assert.equal(status, 0);
  assert.equal(output, buffer);
});

test('honors core.commentString (git >= 2.45) for the guidance prefix', () => {
  const dir = makeRepo([['core.commentString', '//']]);
  try {
    const buffer = ['', '// Please enter the commit message.', ''].join('\n');
    const { status, output } = runHook(buffer, '', dir);
    assert.equal(status, 0);
    assert.match(output, /commit-template v1/);
    // No stray `#` lines, which git would not strip under this config.
    for (const line of output.split('\n')) {
      if (line.trim() === '') continue;
      assert.ok(line.startsWith('//'), `line not comment-prefixed: ${line}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

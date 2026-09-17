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

/**
 * Runs the hook against a temp message file and returns the result.
 *
 * @param {string|null} contents Initial message-file contents, or null to omit
 *   the file argument entirely.
 * @param {string} [source] The commit source git would pass as `$2`.
 * @returns {{status: number|null, output: string}} Exit code and final file.
 */
function runHook(contents, source = '') {
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
      cwd: REPO_ROOT,
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

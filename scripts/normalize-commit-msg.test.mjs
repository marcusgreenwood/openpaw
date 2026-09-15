import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCommitMessage, describeNormalization } from './normalize-commit-msg.mjs';

const CLI = fileURLToPath(new URL('./normalize-commit-msg.mjs', import.meta.url));

/** Assert the message is rewritten exactly as expected, and that it is stable. */
function expectNormalized(input, expected) {
  const once = normalizeCommitMessage(input);
  assert.equal(once, expected);
  assert.equal(normalizeCommitMessage(once), once, 'normalization is not idempotent');
}

/** Assert the message passes through untouched. */
function expectUnchanged(input) {
  assert.equal(normalizeCommitMessage(input), input);
  assert.deepEqual(describeNormalization(input).changes, []);
}

test('c. lowercases a capitalized type token', () => {
  expectNormalized('Feat: add streaming support', 'feat: add streaming support');
  expectNormalized('FIX: resolve overflow', 'fix: resolve overflow');
  expectNormalized('Chore(deps): bump next', 'chore(deps): bump next');
});

test('d. maps known type aliases onto the enum', () => {
  expectNormalized('feature: add retry', 'feat: add retry');
  expectNormalized('bugfix: correct off-by-one', 'fix: correct off-by-one');
  expectNormalized('hotfix: correct off-by-one', 'fix: correct off-by-one');
  expectNormalized('doc: expand README', 'docs: expand README');
  expectNormalized('tests: cover parser', 'test: cover parser');
  expectNormalized('chores: prune deps', 'chore: prune deps');
});

test('d. leaves perf alone so it fails loudly (not in type-enum)', () => {
  expectUnchanged('perf: memoize token counter');
});

test('e. repairs separator spacing', () => {
  expectNormalized('feat:add streaming', 'feat: add streaming');
  expectNormalized('feat : add streaming', 'feat: add streaming');
  expectNormalized('feat:  add streaming', 'feat: add streaming');
  expectNormalized('feat(chat) :add retry', 'feat(chat): add retry');
  expectNormalized('feat!:add retry', 'feat!: add retry');
});

test('f. lowercases the subject first letter', () => {
  expectNormalized('feat: Add streaming support', 'feat: add streaming support');
});

test('f. preserves acronyms, identifiers and quoted tokens', () => {
  expectUnchanged('docs: API usage examples');
  expectUnchanged('docs: UI walkthrough');
  expectUnchanged('chore: Next.js 16 upgrade');
  expectUnchanged('refactor: lib/tools split out');
  expectUnchanged('fix: MAX_RETRIES respected');
  expectUnchanged('fix: `useChat` cleanup on unmount');
  expectUnchanged('fix: "retry" button state');
});

test('g. strips a single trailing period but not an ellipsis', () => {
  expectNormalized('fix: resolve token overflow.', 'fix: resolve token overflow');
  expectUnchanged('fix: resolve token overflow...');
});

test('h. rewrites a leading past-tense or gerund verb to imperative', () => {
  expectNormalized('feat: added streaming', 'feat: add streaming');
  expectNormalized('feat: Adding streaming', 'feat: add streaming');
  expectNormalized('fix: fixed the overflow', 'fix: fix the overflow');
  expectNormalized('chore: updated deps', 'chore: update deps');
  expectNormalized('chore: removed dead code', 'chore: remove dead code');
  expectNormalized('refactor: refactored the store', 'refactor: refactor the store');
  expectNormalized('refactor: renamed the hook', 'refactor: rename the hook');
  expectNormalized('chore: bumped @ai-sdk/anthropic', 'chore: bump @ai-sdk/anthropic');
});

test('h. does not stem verbs outside the explicit map', () => {
  expectUnchanged('feat: enabled retries');
  expectUnchanged('feat: shipped the thing');
});

test('i. inserts the missing blank line between subject and body', () => {
  expectNormalized(
    'feat(chat): add retry\nAutomatically retries failed messages.',
    'feat(chat): add retry\n\nAutomatically retries failed messages.',
  );
});

test('a. strips git comment lines and the scissors diff section', () => {
  expectNormalized(
    'feat: add retry\n# Please enter the commit message for your changes.\n# On branch main\n',
    'feat: add retry\n',
  );
  expectNormalized(
    'feat: add retry\n\n# ------------------------ >8 ------------------------\ndiff --git a/x b/x\n',
    'feat: add retry\n',
  );
});

test('b. trims trailing whitespace and collapses runs of 3+ blank lines', () => {
  expectNormalized('feat: add retry   ', 'feat: add retry');
  expectNormalized(
    'feat: add retry\n\n\n\nBody paragraph.',
    'feat: add retry\n\nBody paragraph.',
  );
});

test('every CONTRIBUTING.md example is a no-op', () => {
  const examples = [
    'feat: add streaming support for Claude responses',
    'fix: resolve token count overflow on long conversations',
    'chore: update @ai-sdk/anthropic to v3.1.0',
    'docs: add API usage examples to README',
    'refactor: extract message formatting into utility function',
    'test: add unit tests for streaming parser',
    'feat(chat): add message retry on network failure\n\n' +
      'Automatically retries failed messages up to 3 times with\n' +
      'exponential backoff. Users see a loading indicator during retry.',
  ];
  for (const example of examples) expectUnchanged(example);
});

test('preserves a trailer block byte-for-byte below the body', () => {
  const message =
    'feat(commit-msg): normalize before commitlint\n\n' +
    'Layers on top of commitlint rather than replacing it.\n\n' +
    'Nightshift-Task: commit-normalize\n' +
    'Nightshift-Ref: https://github.com/marcus/nightshift\n' +
    'Co-Authored-By: Someone <someone@example.com>\n';
  expectUnchanged(message);
});

test('normalizes the subject without disturbing the trailers below it', () => {
  expectNormalized(
    'Feat: Added normalization.\n\nSome body.\n\nCo-Authored-By: A <a@b.c>\n',
    'feat: add normalization\n\nSome body.\n\nCo-Authored-By: A <a@b.c>\n',
  );
});

test('leaves BREAKING CHANGE trailers alone', () => {
  expectUnchanged(
    'feat!: drop node 18\n\nBody text.\n\nBREAKING CHANGE: node 20 is now the minimum.\n',
  );
});

test('leaves git-generated merge commits untouched', () => {
  expectUnchanged('Merge pull request #6 from marcusgreenwood/lint-fix/auto-fix-linting-errors');
  expectUnchanged("Merge branch 'main' into feature\n");
});

test('leaves a revert subject untouched (it quotes another commit)', () => {
  expectUnchanged('revert: feat: Add streaming support.\n\nThis reverts commit abc1234.\n');
  expectUnchanged('Revert "feat: add streaming support"\n\nThis reverts commit abc1234.\n');
});

test('never truncates an over-long subject', () => {
  const subject = `feat: ${'x'.repeat(120)}`;
  assert.ok(subject.length > 100);
  expectUnchanged(subject);
});

test('never invents a type when none is present', () => {
  expectUnchanged('Update the readme.');
  expectUnchanged('just some prose about the change');
});

test('leaves an unrecognized type verbatim for commitlint to reject', () => {
  expectUnchanged('wip: Something.');
  expectUnchanged('Note: This is Important.');
});

test('refuses to act when stripping would empty the message', () => {
  expectUnchanged('# only a comment\n');
  expectUnchanged('');
});

test('idempotence across a messy real-world message', () => {
  const messy = 'Feature(chat) :Added retry on failure.   \nBody line one.\n\n\n\nBody line two.\n';
  const once = normalizeCommitMessage(messy);
  assert.equal(once, 'feat(chat): add retry on failure\n\nBody line one.\n\nBody line two.\n');
  assert.equal(normalizeCommitMessage(once), once);
});

test('describeNormalization reports which rules fired', () => {
  const { changes } = describeNormalization('Feat: Added streaming.');
  assert.ok(changes.includes('type casing'));
  assert.ok(changes.includes('imperative mood'));
  assert.ok(changes.includes('trailing period'));
});

test('CLI rewrites the file in place and reports what changed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'normalize-commit-'));
  const file = join(dir, 'COMMIT_EDITMSG');
  writeFileSync(file, 'Feat: Added the thing.\n');
  const stdout = execFileSync(process.execPath, [CLI, file], { encoding: 'utf8' });
  assert.equal(readFileSync(file, 'utf8'), 'feat: add the thing\n');
  assert.match(stdout, /commit message normalized:/);
});

test('CLI leaves a clean file untouched and prints nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'normalize-commit-'));
  const file = join(dir, 'COMMIT_EDITMSG');
  writeFileSync(file, 'feat: add the thing\n');
  const stdout = execFileSync(process.execPath, [CLI, file], { encoding: 'utf8' });
  assert.equal(readFileSync(file, 'utf8'), 'feat: add the thing\n');
  assert.equal(stdout, '');
});

test('--check exits 1 when normalization would change the message', () => {
  const dir = mkdtempSync(join(tmpdir(), 'normalize-commit-'));
  const file = join(dir, 'COMMIT_EDITMSG');
  writeFileSync(file, 'Feat: Added the thing.\n');
  assert.throws(
    () => execFileSync(process.execPath, [CLI, '--check', file], { stdio: 'pipe' }),
    (error) => error.status === 1,
  );
  // --check must not write.
  assert.equal(readFileSync(file, 'utf8'), 'Feat: Added the thing.\n');
});

test('--check exits 0 on an already-normalized message', () => {
  const dir = mkdtempSync(join(tmpdir(), 'normalize-commit-'));
  const file = join(dir, 'COMMIT_EDITMSG');
  writeFileSync(file, 'feat: add the thing\n');
  execFileSync(process.execPath, [CLI, '--check', file], { stdio: 'pipe' });
});

test('--stdin writes the normalized message to stdout', () => {
  const stdout = execFileSync(process.execPath, [CLI, '--stdin'], {
    input: 'Feat: Added the thing.\n',
    encoding: 'utf8',
  });
  assert.equal(stdout, 'feat: add the thing\n');
});

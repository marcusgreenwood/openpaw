const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const rule = require('./imperative-mood.cjs');
const { NON_IMPERATIVE } = rule;

const REPO_ROOT = path.join(__dirname, '..');
const COMMITLINT_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'commitlint');

/** Run the real commitlint CLI against the repo config. @returns {number} exit code */
function lint(message) {
  try {
    execFileSync(COMMITLINT_BIN, { cwd: REPO_ROOT, input: message, stdio: 'pipe' });
    return 0;
  } catch (err) {
    return typeof err.status === 'number' ? err.status : 1;
  }
}

test('rejects every curated non-imperative form', () => {
  for (const [form, imperative] of Object.entries(NON_IMPERATIVE)) {
    const [pass, message] = rule({ subject: `${form} the parser` });
    assert.equal(pass, false, `expected "${form}" to be rejected`);
    assert.match(message, new RegExp(`write "${imperative}" instead of "${form}"`));
  }
});

test('names the suggested replacement in the message', () => {
  const [pass, message] = rule({ subject: 'updated the changelog' });
  assert.equal(pass, false);
  assert.equal(
    message,
    'subject must use imperative mood: write "update" instead of "updated"',
  );
});

test('preserves the original casing of the offending word in the message', () => {
  const [, message] = rule({ subject: 'Added the changelog' });
  assert.match(message, /instead of "Added"/);
});

test('passes imperative subjects', () => {
  for (const subject of [
    'add streaming support',
    'fix token count overflow',
    'update @ai-sdk/anthropic to v3.1.0',
    'remove dead code',
    'revert the parser rewrite',
  ]) {
    assert.deepEqual(rule({ subject }), [true], `expected "${subject}" to pass`);
  }
});

test('passes subjects whose leading word is not in the list', () => {
  for (const subject of ['teach the linter about scopes', 'wire up the retry path']) {
    assert.deepEqual(rule({ subject }), [true]);
  }
});

test('passes on a null or empty subject, leaving subject-empty to report it', () => {
  assert.deepEqual(rule({ subject: null }), [true]);
  assert.deepEqual(rule({ subject: '' }), [true]);
});

test('matches whole words only, not prefixes', () => {
  // `address` starts with "add"; `fixture` starts with "fix". Neither is a
  // non-imperative form, and a suffix/prefix heuristic would flag them.
  for (const subject of [
    'address the race in the stream reader',
    'fixture loading for the parser tests',
    'addendum to the retry policy',
  ]) {
    assert.deepEqual(rule({ subject }), [true], `expected "${subject}" to pass`);
  }
});

test('passes noun forms that are not leading verb inflections', () => {
  for (const subject of ['changelog entry for v3.1.0', 'movement tracking for cursors']) {
    assert.deepEqual(rule({ subject }), [true], `expected "${subject}" to pass`);
  }
});

test('end-to-end: commitlint rejects a non-imperative subject', () => {
  assert.notEqual(lint('feat: added a thing'), 0);
});

test('end-to-end: commitlint accepts an imperative subject', () => {
  assert.equal(lint('feat: add a thing'), 0);
});

test('end-to-end: header budget is 100 characters, covering type and subject', () => {
  // A 95-char subject is under the old inert `subject-max-length: 100` but the
  // header `feat: ` + 95 is 101 characters, so it must fail.
  assert.notEqual(lint(`feat: ${'a'.repeat(95)}`), 0);
  assert.equal(lint(`feat: ${'a'.repeat(94)}`), 0);
});

test('end-to-end: git-generated revert messages are still ignored', () => {
  assert.equal(lint('Revert "feat: add thing"\n\nThis reverts commit abc123.\n'), 0);
});

test('end-to-end: every reachable commit subject still passes', () => {
  const subjects = execFileSync('git', ['log', '--format=%s'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);

  const regressions = subjects.filter((subject) => rule({ subject: subject.replace(/^[^:]+:\s*/, '') })[0] === false);
  assert.deepEqual(regressions, [], 'new rule must not reject already-merged history');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const rule = require('./imperative-mood.cjs');
const { VERBS, NON_IMPERATIVE, inflect } = rule;

const REPO_ROOT = path.join(__dirname, '..');
const COMMITLINT_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'commitlint');

/**
 * Every verb's inflections spelled out by hand. Written as literals rather than
 * derived from the rule so a spelling bug or a missing form fails here instead
 * of being asserted against itself.
 */
const EXPECTED_FORMS = {
  add: ['added', 'adds', 'adding'],
  fix: ['fixed', 'fixes', 'fixing'],
  update: ['updated', 'updates', 'updating'],
  remove: ['removed', 'removes', 'removing'],
  change: ['changed', 'changes', 'changing'],
  refactor: ['refactored', 'refactors', 'refactoring'],
  implement: ['implemented', 'implements', 'implementing'],
  create: ['created', 'creates', 'creating'],
  bump: ['bumped', 'bumps', 'bumping'],
  rename: ['renamed', 'renames', 'renaming'],
  move: ['moved', 'moves', 'moving'],
  improve: ['improved', 'improves', 'improving'],
  resolve: ['resolved', 'resolves', 'resolving'],
  revert: ['reverted', 'reverts', 'reverting'],
  drop: ['dropped', 'drops', 'dropping'],
  ship: ['shipped', 'ships', 'shipping'],
  wrap: ['wrapped', 'wraps', 'wrapping'],
};

/** Run the real commitlint CLI against the repo config. @returns {number} exit code */
function lint(message) {
  try {
    execFileSync(COMMITLINT_BIN, { cwd: REPO_ROOT, input: message, stdio: 'pipe' });
    return 0;
  } catch (err) {
    return typeof err.status === 'number' ? err.status : 1;
  }
}

test('covers the same verbs the hand-written expectations list', () => {
  assert.deepEqual([...VERBS].sort(), Object.keys(EXPECTED_FORMS).sort());
});

test('spells all three inflections of every verb', () => {
  for (const [verb, expected] of Object.entries(EXPECTED_FORMS)) {
    assert.deepEqual(inflect(verb), expected, `wrong inflections for "${verb}"`);
  }
});

test('leaves no verb missing a form in the lookup table', () => {
  const missing = [];
  for (const [verb, forms] of Object.entries(EXPECTED_FORMS)) {
    for (const form of forms) {
      if (NON_IMPERATIVE[form] !== verb) {
        missing.push(form);
      }
    }
  }
  assert.deepEqual(missing, []);
  assert.equal(Object.keys(NON_IMPERATIVE).length, VERBS.length * 3);
});

test('rejects every non-imperative form with its imperative replacement', () => {
  for (const [verb, forms] of Object.entries(EXPECTED_FORMS)) {
    for (const form of forms) {
      const [pass, message] = rule({ subject: `${form} the parser` });
      assert.equal(pass, false, `expected "${form}" to be rejected`);
      assert.match(message, new RegExp(`write "${verb}" instead of "${form}"`));
    }
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
    'speed up the retry path',
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
    'shipping-label parser for the orders view',
  ]) {
    assert.deepEqual(rule({ subject }), [true], `expected "${subject}" to pass`);
  }
});

test('passes noun forms that are not leading verb inflections', () => {
  for (const subject of ['changelog entry for v3.1.0', 'movement tracking for cursors']) {
    assert.deepEqual(rule({ subject }), [true], `expected "${subject}" to pass`);
  }
});

test('rejects plural-noun openings that collide with a verb form, by design', () => {
  // `updates to the README` reads as a plural noun, not a verb, but it is not
  // imperative mood either — the house style wants `update the README`. Pinned
  // as intended behaviour so the friction is a documented choice, not a
  // surprise; CONTRIBUTING.md spells out the rewrite.
  for (const subject of ['updates to the README', 'changes in the retry path']) {
    assert.equal(rule({ subject })[0], false, `expected "${subject}" to be rejected`);
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

/**
 * Subject text after the conventional-commit prefix. `.*` is greedy on purpose:
 * a subject may itself contain a colon (`fix(api): retry: use backoff`) and only
 * the type/scope prefix should be stripped.
 *
 * @param {string} header full commit header line
 * @returns {string | null} the subject, or null if the header is not conventional
 */
function subjectOf(header) {
  const match = /^\w+(?:\([^)]*\))?!?:\s*(.*)$/.exec(header);
  return match ? match[1] : null;
}

test('strips only the conventional-commit prefix when reading a header', () => {
  assert.equal(subjectOf('fix(api): retry: use exponential backoff'), 'retry: use exponential backoff');
  assert.equal(subjectOf('feat!: drop node 18'), 'drop node 18');
  assert.equal(subjectOf('Merge pull request #6 from x/y'), null);
});

test('every reachable commit subject still passes', (t) => {
  let subjects;
  try {
    // Shallow clones cannot answer this question honestly, so skip rather than
    // assert against a truncated history.
    const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    if (shallow !== 'false') {
      t.skip('shallow clone: commit history is not fully available');
      return;
    }
    subjects = execFileSync('git', ['log', '--format=%s'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    t.skip('git history unavailable');
    return;
  }

  const regressions = subjects
    .map(subjectOf)
    .filter((subject) => subject !== null && rule({ subject })[0] === false);
  assert.deepEqual(regressions, [], 'new rule must not reject already-merged history');
});

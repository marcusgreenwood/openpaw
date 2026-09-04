#!/usr/bin/env node
/**
 * Tests for the commit-message normalizer.
 * Run with `npm run test:commit-msg`. Uses node:test — no new dependencies.
 *
 * commitlint owns validation; these tests cover the normalizer's rewrites and
 * the bypasses that must leave a message untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { stripComments, bypassReason, conforms, TYPES, MAX_SUBJECT_LENGTH } from './commit-rules.mjs';
import { inferType, normalizeHeader, normalizeMessage } from './normalize-commit-msg.mjs';

test('rules are read from commitlint.config.js', () => {
  // Single source of truth: adding a type to commitlint must reach the normalizer.
  for (const type of ['feat', 'fix', 'docs', 'refactor', 'perf', 'test', 'ci', 'build', 'chore', 'style', 'revert']) {
    assert.ok(TYPES.includes(type), `commitlint.config.js is missing type "${type}"`);
  }
  assert.equal(typeof MAX_SUBJECT_LENGTH, 'number');
  assert.ok(MAX_SUBJECT_LENGTH > 0);
});

test('conforms() accepts well-formed messages', () => {
  const valid = [
    'feat: add configurable max tool steps and continue banner',
    'fix: resolve lint warnings in workflow files',
    'feat(crons): run prompt crons in a new session',
    'refactor(lib/tools)!: drop the legacy bash signature',
    'chore: bump next to 16.1.6',
    'feat: support ... trailing ellipsis',
    'fix: handle API timeouts',
    ['feat: add memory tools', '', 'Wires the Minns client into the tool registry.'].join('\n'),
  ];
  for (const message of valid) {
    assert.equal(conforms(message), true, `expected conforming: ${message}`);
  }
});

test('conforms() rejects what the normalizer should fix', () => {
  const invalid = [
    '',
    'Add configurable max tool steps and Continue banner',
    'feat add a thing',
    'feat:no space after colon',
    'nope: do a thing',
    'Feat: add a thing',
    'feat(): add a thing',
    'feat(Crons): add a thing',
    'feat: Add a thing',
    'feat: add a thing.',
    'feat: add a thing\nbody with no blank line',
  ];
  for (const message of invalid) {
    assert.equal(conforms(message), false, `expected non-conforming: ${JSON.stringify(message)}`);
  }
});

test('strips comments and the verbose scissors block', () => {
  const raw = [
    '# Please enter the commit message for your changes.',
    'feat: add a thing',
    '',
    'Body line.',
    '# another comment',
    '# ------------------------ >8 ------------------------',
    'diff --git a/x b/x',
    'Uppercase Diff Content That Would Otherwise Fail.',
    '',
  ].join('\n');
  assert.equal(stripComments(raw), 'feat: add a thing\n\nBody line.');
  assert.equal(conforms(stripComments(raw)), true);
});

test('handles CRLF line endings', () => {
  assert.equal(stripComments('feat: add a thing\r\n\r\nBody.\r\n'), 'feat: add a thing\n\nBody.');
});

test('bypasses git-generated and opted-out messages', () => {
  const bypassed = [
    "Merge branch 'main' into feature",
    'Merge pull request #3 from marcusgreenwood/cursor/development-environment-setup-de90',
    "Merge remote-tracking branch 'origin/main'",
    "Merge tag 'v1.0.0'",
    'Revert "feat: add a thing"',
    'fixup! feat: add a thing',
    'squash! feat: add a thing',
    'amend! feat: add a thing',
  ];
  for (const message of bypassed) {
    assert.ok(bypassReason(message, { env: {} }), `expected bypass: ${message}`);
  }
  assert.equal(bypassReason('Add a thing', { env: {} }), null);
  assert.ok(bypassReason('Add a thing', { env: { SKIP_COMMIT_LINT: '1' } }));
});

test('infers a type from free-form subjects', () => {
  const cases = [
    ['Add configurable max tool steps and Continue banner', 'feat'],
    ['Update AGENTS.md with memory feature documentation', 'docs'],
    ['Add AGENTS.md with Cursor Cloud specific instructions', 'docs'],
    ['Fix the broken cron runner', 'fix'],
    ['Resolve lint warnings in workflow files', 'fix'],
    ['Overhaul system prompt to reduce loops', 'refactor'],
    ['Rename the session store module', 'refactor'],
    ['Bump next to 16.1.6', 'chore'],
    ['Speed up the skill loader', 'perf'],
    ['Add tests for the usage tracker', 'test'],
    ['Reformat the sidebar with prettier', 'style'],
    ['Wire the release pipeline into github actions', 'ci'],
    ['Something entirely unclassifiable', 'chore'],
  ];
  for (const [subject, expected] of cases) {
    assert.equal(inferType(subject), expected, subject);
  }
});

test('inferType only ever returns a commitlint-allowed type', () => {
  const subjects = [
    'Add a thing', 'Fix a thing', 'Speed up a thing', 'Update the docs',
    'Bump deps', 'Reformat code', 'Rename a module', 'Add tests', 'Whatever',
  ];
  for (const subject of subjects) {
    assert.ok(TYPES.includes(inferType(subject)), subject);
  }
});

test('normalizes fixable subjects', () => {
  const cases = [
    [
      'Add configurable max tool steps and Continue banner',
      'feat: add configurable max tool steps and Continue banner',
    ],
    ['Feat: add a thing', 'feat: add a thing'],
    ['feat: Add a thing', 'feat: add a thing'],
    ['feat: add a thing.', 'feat: add a thing'],
    ['feat:add a thing', 'feat: add a thing'],
    ['feat(Crons): add a thing', 'feat(crons): add a thing'],
    ['feat(): add a thing', 'feat: add a thing'],
    ['FIX(API)!: Drop the legacy route.', 'fix(api)!: drop the legacy route'],
    [
      'Update AGENTS.md with memory feature documentation',
      'docs: update AGENTS.md with memory feature documentation',
    ],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeHeader(input).header, expected, input);
    assert.equal(conforms(normalizeHeader(input).header), true, expected);
  }
});

test('normalizeMessage rewrites the message region in place', () => {
  const raw = [
    'Add configurable max tool steps and Continue banner',
    'Body starts with no blank line.',
    '',
    '# Please enter the commit message for your changes.',
  ].join('\n');
  const { changed, output } = normalizeMessage(raw, { withBanner: true });
  assert.equal(changed, true);
  assert.equal(
    stripComments(output),
    'feat: add configurable max tool steps and Continue banner\n\nBody starts with no blank line.',
  );
  assert.ok(output.startsWith('# commit-message-normalizer:'));
  assert.ok(output.includes('# Please enter the commit message'));
});

// Regression: `git commit -m` cleans with `--cleanup=whitespace`, not `strip`,
// so a `#` banner would be committed verbatim and become the subject line.
test('normalizeMessage omits the comment banner by default', () => {
  const { changed, output } = normalizeMessage('Add a scratch file.');
  assert.equal(changed, true);
  assert.equal(output, 'feat: add a scratch file');
  assert.ok(!output.includes('#'));
  assert.equal(conforms(output), true);
});

test('normalizeMessage is a no-op for conforming, bypassed and empty messages', () => {
  for (const raw of [
    'feat: add a thing\n\nBody.\n',
    "Merge branch 'main' into feature\n",
    'Revert "feat: add a thing"\n\nThis reverts commit deadbeef.\n',
    'fixup! feat: add a thing\n',
    '',
    '# only comments\n',
  ]) {
    const result = normalizeMessage(raw);
    assert.equal(result.changed, false, JSON.stringify(raw));
    assert.equal(result.output, raw.replace(/\r\n/g, '\n'));
  }
});

test('normalizeMessage leaves the scissors block untouched', () => {
  const raw = [
    'Add a thing',
    '',
    '# ------------------------ >8 ------------------------',
    'diff --git a/x b/x',
    '+Uppercase Line.',
  ].join('\n');
  const { changed, output } = normalizeMessage(raw, { withBanner: true });
  assert.equal(changed, true);
  assert.ok(output.includes('diff --git a/x b/x'));
  assert.ok(output.includes('+Uppercase Line.'));
  assert.equal(stripComments(output), 'feat: add a thing');
});

test('an over-length subject is left for commitlint to reject', () => {
  const longSubject = `Add ${'a very long clause '.repeat(8)}`;
  const { header } = normalizeHeader(longSubject);
  assert.ok(header.startsWith('feat: '));
  // Length is not something the normalizer can guess at.
  assert.ok(header.length > MAX_SUBJECT_LENGTH);
});

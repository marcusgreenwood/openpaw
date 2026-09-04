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
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  stripComments,
  bypassReason,
  conforms,
  lowercaseSubjectStart,
  TYPES,
  MAX_SUBJECT_LENGTH,
} from './commit-rules.mjs';
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
    // commitlint's subject-case looks at the first character and nothing else,
    // so a leading acronym is just as invalid as a capitalized word.
    'fix: API timeout',
    'feat: OAuth login',
    'chore: WIP',
    'refactor: SessionStore to use Zustand',
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
    // `git merge --squash` writes this; commit-msg gets no source argument to
    // tell it apart, so the subject has to be recognised directly.
    'Squashed commit of the following:',
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
  const { changed, output } = normalizeMessage(raw);
  assert.equal(changed, true);
  assert.equal(
    stripComments(output),
    'feat: add configurable max tool steps and Continue banner\n\nBody starts with no blank line.',
  );
  // Comments git put there are preserved; the normalizer adds none of its own.
  assert.ok(output.includes('# Please enter the commit message'));
});

// Regression (the reason normalization moved into `commit-msg`): git runs
// `prepare-commit-msg` before opening the editor, so it only ever saw the empty
// template and the typed subject went unnormalized. `commit-msg` runs after the
// editor closes -- but *before* git applies `--cleanup`, so the file still
// carries git's comment template. That is the shape reproduced here.
test('normalizes the editor flow, template comments and all', () => {
  const raw = [
    'Add a shiny thing.',
    'Some body text explaining why.',
    '',
    '# Please enter the commit message for your changes. Lines starting',
    "# with '#' will be ignored, and an empty message aborts the commit.",
    '#',
    '# On branch chore/commit-message-normalizer',
    '# Changes to be committed:',
    '#\tmodified:   scripts/normalize-commit-msg.mjs',
    '#',
    '',
  ].join('\n');
  const { changed, output } = normalizeMessage(raw);
  assert.equal(changed, true);
  assert.equal(
    stripComments(output),
    'feat: add a shiny thing\n\nSome body text explaining why.',
  );
  // git's own template survives untouched for git to strip.
  assert.ok(output.includes('# On branch chore/commit-message-normalizer'));
  assert.equal(conforms(stripComments(output)), true);
});

// `git commit -m` cleans with `--cleanup=whitespace`, not `strip`, so anything
// the normalizer writes is committed verbatim: it must never emit a comment.
test('normalizeMessage never introduces comment lines', () => {
  for (const raw of ['Add a scratch file.', 'Fixed the thing.\nbody', 'Feat(API): Do it.']) {
    const { output } = normalizeMessage(raw);
    assert.ok(!output.split('\n').some((l) => l.startsWith('#')), raw);
  }
  const { changed, output } = normalizeMessage('Add a scratch file.');
  assert.equal(changed, true);
  assert.equal(output, 'feat: add a scratch file');
  assert.equal(conforms(output), true);
});

test('normalizeMessage is a no-op for conforming, bypassed and empty messages', () => {
  for (const raw of [
    'feat: add a thing\n\nBody.\n',
    "Merge branch 'main' into feature\n",
    'Revert "feat: add a thing"\n\nThis reverts commit deadbeef.\n',
    'fixup! feat: add a thing\n',
    'Squashed commit of the following:\n\ncommit deadbeef\n',
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
  const { changed, output } = normalizeMessage(raw);
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

test('lowercaseSubjectStart folds the leading run of capitals', () => {
  const cases = [
    // One leading capital: an ordinary word, so internal camelCase survives.
    ['Add a thing', 'add a thing'],
    ['SessionStore to use Zustand', 'sessionStore to use Zustand'],
    ['I broke it', 'i broke it'],
    // Two or more: an acronym, so the whole run goes down rather than
    // producing the valid-but-unreadable `aPI timeout`.
    ['API timeout', 'api timeout'],
    ['OAuth login', 'oauth login'],
    ['UI glitch in sidebar', 'ui glitch in sidebar'],
    ['WIP', 'wip'],
    ['SDK upgrade', 'sdk upgrade'],
    ['HTTP handling', 'http handling'],
    // Already acceptable to commitlint: left alone.
    ['iOS crash on launch', 'iOS crash on launch'],
    ['add a thing', 'add a thing'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(lowercaseSubjectStart(input), expected, input);
  }
});

// Regression: `git commit -m "API rate limit handling"` used to be rewritten to
// `chore: API rate limit handling` and then rejected by commitlint -- the
// message was modified and the commit still failed.
test('normalizeHeader repairs subjects that start with an acronym', () => {
  const cases = [
    ['API rate limit handling', 'chore: api rate limit handling'],
    ['fix: API timeout', 'fix: api timeout'],
    ['feat: OAuth login', 'feat: oauth login'],
    ['fix: UI glitch in sidebar', 'fix: ui glitch in sidebar'],
    ['refactor: SessionStore to use Zustand', 'refactor: sessionStore to use Zustand'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeHeader(input).header, expected, input);
    assert.equal(conforms(normalizeHeader(input).header), true, expected);
  }
});

// Regression: the hint patterns listed base verbs only, so `Reworked the parser`
// fell through to `chore`, mis-typing the commit for changelog/semver consumers.
test('inferType recognizes inflected verbs', () => {
  const cases = [
    ['Reworked the parser', 'refactor'],
    ['Revamped the skills manager', 'refactor'],
    ['Overhauled the system prompt', 'refactor'],
    ['Tidied the cron store', 'refactor'],
    ['Consolidated the tool registry', 'refactor'],
    ['Extracted a shared helper', 'refactor'],
    ['Cleaned up the sidebar', 'refactor'],
    ['Simplifying the loader', 'refactor'],
    ['Bumped next to 16.1.6', 'chore'],
    ['Upgraded the lockfile', 'chore'],
    ['Optimized the message list render', 'perf'],
  ];
  for (const [subject, expected] of cases) {
    assert.equal(inferType(subject), expected, subject);
  }
});

// Regression: the main-module guard compared `import.meta.url` (percent-encoded)
// against a raw path, so in a clone under `~/My Projects` the script exited 0
// and normalized nothing while the hook still reported success.
test('the script runs as a hook from a path containing a space', () => {
  const scriptDir = fileURLToPath(new URL('.', import.meta.url));
  const root = mkdtempSync(join(tmpdir(), 'commit norm-'));
  const dest = join(root, 'scripts');
  cpSync(scriptDir, dest, { recursive: true });
  // The rules module reads commitlint.config.js from its parent directory.
  cpSync(join(scriptDir, '..', 'commitlint.config.js'), join(root, 'commitlint.config.js'));

  const msgFile = join(root, 'COMMIT_EDITMSG');
  writeFileSync(msgFile, 'API rate limit handling.\n');
  execFileSync(process.execPath, [join(dest, 'normalize-commit-msg.mjs'), msgFile], {
    stdio: 'ignore',
  });

  assert.equal(readFileSync(msgFile, 'utf8'), 'chore: api rate limit handling\n');
});

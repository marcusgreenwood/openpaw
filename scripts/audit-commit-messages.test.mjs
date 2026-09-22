/**
 * Unit tests for the pure helpers in audit-commit-messages.mjs.
 *
 * Uses only Node built-ins (`node:test` + `node:assert/strict`) so the repo
 * gains a test suite without gaining a devDependency. Run with:
 *   npm run test:commit-audit
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALLOWED_TYPES,
  SUBJECT_MAX_LENGTH,
  inferType,
  isIgnoredSubject,
  lowercaseFirstWord,
  parseArgs,
  parseRuleNames,
  splitLog,
  stripTrailingPeriod,
  suggestSubject,
  toImperative,
  truncate,
} from './audit-commit-messages.mjs';

test('parseArgs defaults to HEAD with every flag off', () => {
  const options = parseArgs([]);
  assert.deepEqual(options.revs, ['HEAD']);
  assert.equal(options.label, 'HEAD');
  assert.equal(options.suggest, false);
  assert.equal(options.strict, false);
  assert.equal(options.json, false);
  assert.equal(options.error, null);
});

test('parseArgs accepts a positional range and flags together', () => {
  const options = parseArgs(['HEAD~5..HEAD', '--suggest', '--strict', '--json']);
  assert.deepEqual(options.revs, ['HEAD~5..HEAD']);
  assert.equal(options.label, 'HEAD~5..HEAD');
  assert.equal(options.suggest, true);
  assert.equal(options.strict, true);
  assert.equal(options.json, true);
});

test('parseArgs builds a range from --from/--to and defaults --to to HEAD', () => {
  assert.deepEqual(parseArgs(['--from', 'v1.0.0', '--to', 'v2.0.0']).revs, ['v1.0.0..v2.0.0']);
  assert.deepEqual(parseArgs(['--from', 'v1.0.0']).revs, ['v1.0.0..HEAD']);
});

test('parseArgs maps --all onto git log --all', () => {
  const options = parseArgs(['--all']);
  assert.deepEqual(options.revs, ['--all']);
  assert.equal(options.label, 'all refs');
});

test('parseArgs rejects conflicting and malformed input', () => {
  assert.match(parseArgs(['a..b', '--from', 'x']).error, /not both/);
  assert.match(parseArgs(['--from']).error, /requires a value/);
  assert.match(parseArgs(['--from', '--to']).error, /requires a value/);
  assert.match(parseArgs(['--nope']).error, /unknown option/);
  assert.match(parseArgs(['a..b', 'c..d']).error, /unexpected argument/);
});

test('splitLog preserves a multi-line body containing blank lines', () => {
  const body = 'feat(chat): add retry\n\nRetries failed messages.\n\nWith a blank line above.';
  const stdout = `abc123\x1f${body}\x1e\ndef456\x1ffix: tidy up\x1e\n`;

  const records = splitLog(stdout);
  assert.equal(records.length, 2);
  assert.equal(records[0].hash, 'abc123');
  assert.equal(records[0].subject, 'feat(chat): add retry');
  assert.equal(records[0].message, body);
  assert.ok(records[0].message.includes('\n\nWith a blank line above.'));
  assert.equal(records[1].hash, 'def456');
  assert.equal(records[1].subject, 'fix: tidy up');
});

test('splitLog tolerates empty output and trailing separators', () => {
  assert.deepEqual(splitLog(''), []);
  assert.deepEqual(splitLog('\x1e\n'), []);
  assert.equal(splitLog('abc\x1ffeat: x\x1e\n').length, 1);
});

test('isIgnoredSubject matches commitlint default ignores only', () => {
  for (const subject of [
    'Merge pull request #6 from marcusgreenwood/lint-fix',
    'Merge branch main into feature',
    'Revert "feat: add thing"',
    'fixup! feat: add thing',
    'squash! feat: add thing',
    'Automatic merge of branches',
  ]) {
    assert.equal(isIgnoredSubject(subject), true, subject);
  }

  for (const subject of [
    'feat: add thing',
    'revert: undo the thing',
    'Add agent memory feature powered by Minns Memory Layer',
    'merge sorted lists in the parser',
  ]) {
    assert.equal(isIgnoredSubject(subject), false, subject);
  }
});

test('lowercaseFirstWord lowercases prose but leaves identifiers alone', () => {
  assert.equal(lowercaseFirstWord('Add streaming support'), 'add streaming support');
  assert.equal(lowercaseFirstWord('API rate limiting'), 'API rate limiting');
  assert.equal(lowercaseFirstWord('LiveTerminal streaming notes'), 'LiveTerminal streaming notes');
  assert.equal(lowercaseFirstWord(''), '');
});

test('stripTrailingPeriod removes exactly one trailing full stop', () => {
  assert.equal(stripTrailingPeriod('add a thing.'), 'add a thing');
  assert.equal(stripTrailingPeriod('add a thing.  '), 'add a thing');
  assert.equal(stripTrailingPeriod('add a thing'), 'add a thing');
  assert.equal(stripTrailingPeriod('bump to v1.2.0'), 'bump to v1.2.0');
});

test('toImperative rewrites known past-tense verbs and passes others through', () => {
  assert.equal(toImperative('Added a cat avatar'), 'add a cat avatar');
  assert.equal(toImperative('updated the docs'), 'update the docs');
  assert.equal(toImperative('Revamped skills manager'), 'revamp skills manager');
  assert.equal(toImperative('add a cat avatar'), 'add a cat avatar');
  assert.equal(toImperative('wrangle the parser'), 'wrangle the parser');
});

test('truncate clips to the limit at a word boundary', () => {
  const long = `add ${'word '.repeat(40)}end`;
  const clipped = truncate(long, SUBJECT_MAX_LENGTH);
  assert.ok(clipped.length <= SUBJECT_MAX_LENGTH);
  assert.ok(!clipped.endsWith(' '));
  assert.equal(truncate('short', SUBJECT_MAX_LENGTH), 'short');
  // A single unbroken token has no word boundary to fall back on.
  assert.equal(truncate('x'.repeat(20), 10), 'x'.repeat(10));
});

test('inferType prefers changed paths over subject verbs', () => {
  assert.equal(inferType({ subject: 'add stuff', files: ['README.md', 'docs/guide.md'] }), 'docs');
  assert.equal(inferType({ subject: 'add stuff', files: ['.github/workflows/ci.yml'] }), 'ci');
  assert.equal(inferType({ subject: 'add stuff', files: ['.husky/commit-msg'] }), 'ci');
  assert.equal(inferType({ subject: 'add stuff', files: ['lib/parser.test.ts'] }), 'test');
  assert.equal(inferType({ subject: 'add stuff', files: ['package.json', 'package-lock.json'] }), 'chore');
});

test('inferType falls back to the subject verb when paths are mixed', () => {
  const mixed = ['app/page.tsx', 'README.md'];
  assert.equal(inferType({ subject: 'Add a cat avatar', files: mixed }), 'feat');
  assert.equal(inferType({ subject: 'Fix token overflow', files: mixed }), 'fix');
  assert.equal(inferType({ subject: 'Update the client', files: mixed }), 'chore');
  assert.equal(inferType({ subject: 'Remove dead code', files: mixed }), 'refactor');
  assert.equal(inferType({ subject: 'Wrangle the thing', files: [] }), 'chore');
});

test('suggestSubject produces a conforming subject for legacy commits', () => {
  assert.equal(
    suggestSubject({ subject: 'Initial commit from Create Next App', files: ['package.json'] }),
    'chore: initial commit from Create Next App',
  );
  assert.equal(
    suggestSubject({
      subject: 'Add agent memory feature powered by Minns Memory Layer',
      files: ['lib/memory/client.ts'],
    }),
    'feat: add agent memory feature powered by Minns Memory Layer',
  );
  assert.equal(
    suggestSubject({ subject: 'Update AGENTS.md with memory feature documentation', files: ['AGENTS.md'] }),
    'docs: update AGENTS.md with memory feature documentation',
  );
});

test('suggestSubject keeps an existing type/scope prefix and fixes the description', () => {
  assert.equal(
    suggestSubject({ subject: 'feat(chat): Added retry logic.', files: ['lib/chat.ts'] }),
    'feat(chat): add retry logic',
  );
  assert.equal(
    suggestSubject({ subject: 'fix!: Resolved the overflow', files: ['lib/chat.ts'] }),
    'fix!: resolve the overflow',
  );
});

test('suggestSubject never exceeds the commitlint subject budget', () => {
  const suggestion = suggestSubject({
    subject: `Added ${'a very long clause '.repeat(12)}at the end`,
    files: ['lib/chat.ts'],
  });
  assert.ok(suggestion.length <= SUBJECT_MAX_LENGTH, `got ${suggestion.length}`);
  assert.ok(suggestion.startsWith('feat: add '));
});

test('parseRuleNames extracts deduplicated commitlint rule ids', () => {
  const output = [
    '   ✖   subject may not be empty [subject-empty]',
    '   ✖   type may not be empty [type-empty]',
    '   ✖   type may not be empty [type-empty]',
  ].join('\n');
  assert.deepEqual(parseRuleNames(output).sort(), ['subject-empty', 'type-empty']);
  assert.deepEqual(parseRuleNames('no rules here'), []);
});

test('parseRuleNames ignores bracketed text in the echoed input', () => {
  const output = [
    '⧗   input: Revamp skills manager',
    '',
    '- Add /api/skills/[name] route with GET (read SKILL.md), PUT (edit), DELETE',
    '- Touch app/[slug]/page.tsx too',
    '✖   subject may not be empty [subject-empty]',
  ].join('\n');
  assert.deepEqual(parseRuleNames(output), ['subject-empty']);
});

test('ALLOWED_TYPES comes from the repo commitlint config', () => {
  assert.ok(Array.isArray(ALLOWED_TYPES));
  for (const type of ['feat', 'fix', 'chore', 'docs', 'ci', 'refactor', 'test']) {
    assert.ok(ALLOWED_TYPES.includes(type), `expected ${type} in type-enum`);
  }
  assert.equal(SUBJECT_MAX_LENGTH, 100);
});

test('suggestSubject does not mistake arbitrary prose prefixes for a type', () => {
  // `OpenPaw:` is not in type-enum, so it must be treated as description text
  // and given a real inferred type rather than passed through as the type.
  const suggestion = suggestSubject({
    subject: 'OpenPaw: AI agent chat with tools, skills, and multi-channel support',
    files: ['app/page.tsx'],
  });
  const type = suggestion.slice(0, suggestion.indexOf(':'));
  assert.ok(ALLOWED_TYPES.includes(type), `inferred type ${type} must be allowed`);
  assert.ok(suggestion.includes('OpenPaw: AI agent chat'));
});

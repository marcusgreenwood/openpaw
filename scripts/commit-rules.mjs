#!/usr/bin/env node
/**
 * Shared Conventional Commits rules for the commit-message normalizer.
 *
 * commitlint remains the authoritative gate (see `.husky/commit-msg` and
 * `commitlint.config.js`). This module exists so the normalizer can tell
 * whether a message already conforms without paying commitlint's startup cost
 * on every commit, and it reads its type list and length limit straight out of
 * `commitlint.config.js` so the two can never drift apart.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** `type(scope)!: subject` — scope and `!` are optional. */
export const HEADER_PATTERN = /^([a-zA-Z]+)(?:\(([^()\r\n]*)\))?(!)?:[ ](.+)$/;

const SCISSORS = /^#\s*-+\s*>8\s*-+/;

function loadCommitlintConfig() {
  try {
    return require(join(repoRoot, 'commitlint.config.js'));
  } catch {
    return {};
  }
}

const config = loadCommitlintConfig();

/** Allowed types, read from commitlint's `type-enum` rule. */
export const TYPES = config.rules?.['type-enum']?.[2] ?? [
  'feat',
  'fix',
  'chore',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'ci',
  'build',
  'revert',
];

/** Subject length limit, read from commitlint's `subject-max-length` rule. */
export const MAX_SUBJECT_LENGTH = config.rules?.['subject-max-length']?.[2] ?? 100;

/**
 * Remove git's comment lines and everything below the `--verbose` scissors
 * line, then trim surrounding blank lines.
 */
export function stripComments(raw) {
  const lines = String(raw).replace(/\r\n/g, '\n').split('\n');
  const kept = [];
  for (const line of lines) {
    if (SCISSORS.test(line)) break;
    if (line.startsWith('#')) continue;
    kept.push(line);
  }
  while (kept.length && kept[0].trim() === '') kept.shift();
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
  return kept.join('\n');
}

/**
 * Messages git generates itself, or that git will re-consume, must survive
 * untouched. Returns a reason string when the message is exempt, else null.
 *
 * These are matched on the subject rather than on `prepare-commit-msg`'s
 * `source` argument, because the hooks run from `commit-msg`, which git does
 * not pass a source. The subject is the more reliable signal anyway: it is what
 * git actually writes, and it still identifies a merge that arrived through
 * `git pull` or a conflict resolution commit.
 */
export function bypassReason(message, { env = process.env } = {}) {
  if (env.SKIP_COMMIT_LINT === '1' || env.SKIP_COMMIT_LINT === 'true') {
    return 'SKIP_COMMIT_LINT is set';
  }
  const subject = message.split('\n', 1)[0] ?? '';
  if (/^Merge (branch|branches|pull request|remote-tracking|tag|commit)\b/.test(subject)) {
    return 'merge commit';
  }
  if (/^Squashed commit of the following:/.test(subject)) return 'squashed merge commit';
  if (/^Revert "/.test(subject)) return 'revert commit';
  if (/^(fixup|squash|amend)!/.test(subject)) return 'fixup/squash commit';
  return null;
}

/**
 * commitlint's `subject-case` rule rejects a subject whose *first character* is
 * uppercase, and looks no further. Verified against this repo's own config:
 * `fix: API timeout`, `feat: OAuth login`, `chore: WIP` and
 * `refactor: SessionStore to use Zustand` all fail, while `fix: aPI timeout`,
 * `fix: iOS crash on launch` and `refactor: sessionStore to use Zustand` pass.
 */
export function startsUppercase(subject) {
  return /^[A-Z]/.test(subject);
}

/**
 * Lowercase just enough of the leading word to satisfy `subject-case`.
 *
 * The leading run of capitals is what gets folded. A run of one is an ordinary
 * capitalized word, so only that character changes and internal camelCase
 * survives: `Add a thing` -> `add a thing`, `SessionStore refactor` ->
 * `sessionStore refactor`. A run of two or more is an acronym, so the whole run
 * goes down: `API timeout` -> `api timeout`, `OAuth login` -> `oauth login`.
 * Folding only the first character there would yield the technically-valid but
 * unreadable `aPI timeout`.
 */
export function lowercaseSubjectStart(subject) {
  const run = /^[A-Z]+/.exec(subject);
  if (!run) return subject;
  return run[0].toLowerCase() + subject.slice(run[0].length);
}

/**
 * Does this message already satisfy the rules the normalizer knows how to fix?
 *
 * Deliberately narrower than commitlint: it only covers the rules the
 * normalizer can act on, so a `true` here means "leave this message alone",
 * not "commitlint will accept it".
 */
export function conforms(message) {
  const lines = message.split('\n');
  const header = lines[0] ?? '';
  if (header.trim() === '') return false;

  const match = HEADER_PATTERN.exec(header);
  if (!match) return false;

  const [, type, scope, , subject] = match;
  if (!TYPES.includes(type)) return false;
  if (scope !== undefined && (scope.trim() === '' || scope !== scope.toLowerCase())) return false;
  if (subject.trim() === '') return false;
  if (startsUppercase(subject)) return false;
  if (/\.$/.test(subject.trim()) && !/\.\.\.$/.test(subject.trim())) return false;
  if (lines.length > 1 && lines[1].trim() !== '') return false;

  return true;
}

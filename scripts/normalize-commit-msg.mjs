#!/usr/bin/env node
/**
 * Commit message normalizer.
 *
 * Auto-fixes the small, unambiguous formatting deviations that make an otherwise
 * fine commit message fail commitlint, and does nothing else. This runs in the
 * `commit-msg` hook immediately *before* `commitlint`, which remains the
 * authoritative gate: anything this file cannot repair with certainty is left
 * byte-for-byte alone so commitlint rejects it with its existing error message.
 *
 * Rules applied (only when the header is a recognized conventional-commit type):
 *   a. strip git scaffolding (`#` comments, scissors line, verbose diff)
 *   b. trim trailing whitespace per line, collapse runs of 3+ blank lines to one
 *   c. lowercase a capitalized type token         `Feat:`        -> `feat:`
 *   d. map a known type alias onto the enum       `bugfix:`      -> `fix:`
 *   e. repair separator spacing                   `feat :add x`  -> `feat: add x`
 *   f. lowercase the subject's first letter       `feat: Add x`  -> `feat: add x`
 *   g. strip a single trailing period             `feat: add x.` -> `feat: add x`
 *   h. map a leading past-tense verb              `feat: added x`-> `feat: add x`
 *   i. insert the missing blank line between subject and body
 *
 * Explicit non-goals, enforced in code below:
 *   - never truncate a subject, however long (commitlint reports the length)
 *   - never invent, guess, or add a type when the header has none
 *   - never reflow, reword, or re-case body prose
 *   - never touch the trailing git trailer block (`Co-Authored-By:`,
 *     `Signed-off-by:`, `Nightshift-Task:`, `BREAKING CHANGE:`, ...)
 *   - never rewrite git-generated `Merge`/`Revert` messages
 *   - never rewrite a `revert:` subject, which quotes another commit verbatim
 *
 * Deliberate omission: `perf` is NOT in this repo's type-enum and is NOT
 * aliased, so `perf:` still fails loudly rather than being silently rewritten.
 *
 * Usage:
 *   node scripts/normalize-commit-msg.mjs <path>     rewrite the file in place
 *   node scripts/normalize-commit-msg.mjs --check <path>   exit 1 if it would change
 *   node scripts/normalize-commit-msg.mjs --stdin    stdin -> normalized stdout
 */

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

/** Types accepted by commitlint.config.js. Keep in sync with that file. */
const ALLOWED_TYPES = new Set([
  'feat',
  'fix',
  'chore',
  'docs',
  'style',
  'refactor',
  'test',
  'ci',
  'build',
  'revert',
]);

/** Common near-misses that map onto exactly one allowed type. */
const TYPE_ALIASES = new Map([
  ['feature', 'feat'],
  ['features', 'feat'],
  ['bugfix', 'fix'],
  ['hotfix', 'fix'],
  ['doc', 'docs'],
  ['tests', 'test'],
  ['chores', 'chore'],
]);

/**
 * Bounded, explicit past-tense/gerund -> imperative map. Deliberately not a
 * stemmer: a wrong guess here silently changes what a commit claims to do.
 */
const IMPERATIVE_VERBS = new Map([
  ['added', 'add'],
  ['adding', 'add'],
  ['fixed', 'fix'],
  ['fixing', 'fix'],
  ['updated', 'update'],
  ['updating', 'update'],
  ['removed', 'remove'],
  ['removing', 'remove'],
  ['refactored', 'refactor'],
  ['refactoring', 'refactor'],
  ['renamed', 'rename'],
  ['renaming', 'rename'],
  ['bumped', 'bump'],
  ['bumping', 'bump'],
]);

/** `type(scope)!: subject`, tolerant of broken spacing around the colon. */
const HEADER_RE = /^([A-Za-z]+)(\([^)]*\))?(!?)[ \t]*:[ \t]*(.*)$/;

/** A line in the trailing trailer block, e.g. `Co-Authored-By: A <a@b.c>`. */
const TRAILER_RE = /^(?:BREAKING[ -]CHANGE|[A-Za-z][A-Za-z0-9-]*): .+$/;

/** git's `--verbose` / `--cleanup=scissors` cut line. */
const SCISSORS_RE = /^#?[ \t]*-+[ \t]*>8[ \t]*-+/;

/** Messages git wrote itself; never ours to reformat. */
const GIT_GENERATED_RE = /^(?:Merge|Revert)\s/;

/**
 * Strip the scaffolding git appends to the commit-msg file. Stops at the
 * scissors line or a verbose diff, and drops comment lines above it.
 *
 * @param {string[]} lines
 * @returns {string[]}
 */
function stripGitScaffolding(lines) {
  const kept = [];
  for (const line of lines) {
    if (SCISSORS_RE.test(line) || line.startsWith('diff --git ')) break;
    if (line.startsWith('#')) continue;
    kept.push(line);
  }
  return kept;
}

/**
 * Index of the first line of the trailing trailer block, or -1 if there is
 * none. The block must be preceded by a blank line and must not be the subject.
 *
 * @param {string[]} lines
 * @returns {number}
 */
function findTrailerBlockStart(lines) {
  let end = lines.length - 1;
  while (end >= 0 && lines[end].trim() === '') end -= 1;
  if (end < 1) return -1;
  if (!TRAILER_RE.test(lines[end])) return -1;

  let start = end;
  while (start - 1 >= 1 && TRAILER_RE.test(lines[start - 1])) start -= 1;

  // A real trailer block is separated from the body by a blank line.
  if (start < 1 || lines[start - 1].trim() !== '') return -1;
  return start;
}

/**
 * True when the subject's first word must keep its capitalization: an acronym
 * (`API docs`), a dotted/slashed/underscored identifier (`Next.js`, `lib/foo`,
 * `MAX_RETRIES`), or a quoted/backticked token.
 *
 * @param {string} text
 * @returns {boolean}
 */
function firstWordIsProtected(text) {
  const first = text.split(/\s+/, 1)[0] ?? '';
  if (!first) return true;
  if (/^[`"'([]/.test(first)) return true;
  if (/[./_]/.test(first)) return true;
  if (/^[A-Z]{2}/.test(first)) return true;
  return false;
}

/**
 * Apply the subject-text rules (verb, capitalization, trailing period).
 *
 * @param {string} text
 * @param {Set<string>} changes
 * @returns {string}
 */
function normalizeSubjectText(text, changes) {
  let out = text;

  const verbMatch = /^([A-Za-z]+)(?=$|[^A-Za-z])/.exec(out);
  if (verbMatch) {
    const imperative = IMPERATIVE_VERBS.get(verbMatch[1].toLowerCase());
    if (imperative && imperative !== verbMatch[1]) {
      out = imperative + out.slice(verbMatch[1].length);
      changes.add('imperative mood');
    }
  }

  if (/^[A-Z]/.test(out) && !firstWordIsProtected(out)) {
    out = out[0].toLowerCase() + out.slice(1);
    changes.add('subject capitalization');
  }

  // A single trailing period only; `...` is intentional and left alone.
  if (/[^.]\.$/.test(out)) {
    out = out.slice(0, -1);
    changes.add('trailing period');
  }

  return out;
}

/**
 * Normalize the subject line. Returns the line unchanged, and `recognized:
 * false`, whenever the header is not an unambiguous conventional-commit header
 * with a type this repo allows — that is what keeps merge commits, prose
 * subjects and typo'd types out of the normalizer's hands.
 *
 * @param {string} line
 * @param {Set<string>} changes
 * @returns {{ line: string, recognized: boolean }}
 */
function normalizeSubjectLine(line, changes) {
  if (GIT_GENERATED_RE.test(line)) return { line, recognized: false };

  const match = HEADER_RE.exec(line);
  if (!match) return { line, recognized: false };

  const [, rawType, scope = '', bang, rawText] = match;
  const lowered = rawType.toLowerCase();
  const type = ALLOWED_TYPES.has(lowered) ? lowered : TYPE_ALIASES.get(lowered);

  // Unknown type: this may not be a conventional header at all. Leave it whole.
  if (!type) return { line, recognized: false };

  if (rawType !== type) {
    changes.add(lowered === type ? 'type casing' : `type alias (${rawType} -> ${type})`);
  }

  // A `revert:` subject quotes the reverted commit's subject; never touch it.
  const text = type === 'revert' ? rawText : normalizeSubjectText(rawText, changes);

  const normalized = `${type}${scope}${bang}: ${text}`;
  if (normalized !== line && !changes.has('separator spacing')) {
    const spacingOnly = `${rawType}${scope}${bang}: ${rawText}` !== line;
    if (spacingOnly) changes.add('separator spacing');
  }

  return { line: normalized, recognized: true };
}

/**
 * Normalize a raw commit message.
 *
 * @param {string} raw Full commit message as written.
 * @returns {{ text: string, changes: string[] }} Normalized text plus the
 *   human-readable names of the rules that actually fired.
 */
export function describeNormalization(raw) {
  const changes = new Set();
  const endsWithNewline = raw.endsWith('\n');
  const unchanged = () => ({ text: raw, changes: [] });

  let lines = raw.split('\n');
  if (endsWithNewline) lines.pop();

  const stripped = stripGitScaffolding(lines);
  if (stripped.length !== lines.length) changes.add('git comment lines');
  lines = stripped;

  // Refuse to act if stripping left nothing to normalize.
  const firstContent = lines.findIndex((line) => line.trim() !== '');
  if (firstContent === -1) return unchanged();
  lines = lines.slice(firstContent);

  const trailerStart = findTrailerBlockStart(lines);
  // Trailers are preserved byte-for-byte, including their own spacing.
  const trailers = trailerStart === -1 ? [] : lines.slice(trailerStart);
  const head = trailerStart === -1 ? lines : lines.slice(0, trailerStart - 1);

  const body = head.map((line) => {
    const trimmed = line.replace(/[ \t]+$/, '');
    if (trimmed !== line) changes.add('trailing whitespace');
    return trimmed;
  });

  const subject = normalizeSubjectLine(body[0], changes);
  body[0] = subject.line;

  if (subject.recognized && body.length > 1 && body[1].trim() !== '') {
    body.splice(1, 0, '');
    changes.add('blank line after subject');
  }

  // Collapse runs of 3+ blank lines down to a single blank line. A run of
  // exactly 2 is left alone: it is unusual but unambiguous, and not an error.
  const collapsed = [];
  let blankRun = 0;
  for (const line of body) {
    if (line.trim() === '') {
      blankRun += 1;
      continue;
    }
    if (blankRun >= 3) {
      changes.add('excess blank lines');
      collapsed.push('');
    } else {
      for (let i = 0; i < blankRun; i += 1) collapsed.push('');
    }
    blankRun = 0;
    collapsed.push(line);
  }
  // Trailing blank lines are dropped rather than collapsed.
  if (blankRun > 0) changes.add('excess blank lines');

  const out = trailers.length > 0 ? [...collapsed, '', ...trailers] : collapsed;
  let text = out.join('\n');
  if (endsWithNewline) text += '\n';

  if (text === raw) return unchanged();
  return { text, changes: [...changes] };
}

/**
 * Normalize a raw commit message, returning the normalized text.
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeCommitMessage(raw) {
  return describeNormalization(raw).text;
}

/**
 * Read all of stdin.
 *
 * @returns {Promise<string>}
 */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * CLI entrypoint.
 *
 * @param {string[]} argv
 * @returns {Promise<number>} process exit code
 */
async function main(argv) {
  if (argv.includes('--stdin')) {
    process.stdout.write(normalizeCommitMessage(await readStdin()));
    return 0;
  }

  const check = argv[0] === '--check';
  const path = check ? argv[1] : argv[0];
  if (!path) {
    process.stderr.write(
      'usage: normalize-commit-msg.mjs [--check] <commit-msg-file> | --stdin\n',
    );
    return 2;
  }

  const raw = readFileSync(path, 'utf8');
  const { text, changes } = describeNormalization(raw);

  if (changes.length === 0) return 0;

  if (check) {
    process.stderr.write(`commit message needs normalization: ${changes.join(', ')}\n`);
    return 1;
  }

  writeFileSync(path, text, 'utf8');
  process.stdout.write(`commit message normalized: ${changes.join(', ')}\n`);
  return 0;
}

// Only run the CLI when executed directly, so tests can import the module.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`normalize-commit-msg: ${error.message}\n`);
      process.exitCode = 1;
    },
  );
}

#!/usr/bin/env node
/**
 * prepare-commit-msg hook: show the Conventional Commits format in the
 * editor *before* the author writes, rather than only rejecting them
 * afterwards in the commit-msg hook.
 *
 * This is guidance only. `commitlint` (.husky/commit-msg) remains the sole
 * thing that decides whether a commit message passes, and this script never
 * changes, reformats or validates what the author typed.
 *
 * Strictly fail-open: a non-zero exit from prepare-commit-msg aborts the
 * commit, so every unexpected condition here exits 0 and leaves the message
 * file untouched.
 *
 * Usage: node scripts/prepare-commit-msg.mjs <msgFile> [source] [sha]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Marker in .gitmessage used to detect an already-applied template. */
const TEMPLATE_MARKER = 'commit-template v1';

const TEMPLATE_PATH = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  '.gitmessage'
);

/**
 * Commit sources that mean the message did not come from an interactive
 * editor session: `-m`/`-F` (message), a user-configured commit.template
 * (template), a merge, a squash/fixup, and `--amend`/`-c` (commit).
 * Only a source-less commit is a blank buffer the author is about to fill.
 */
const NON_INTERACTIVE_SOURCES = new Set([
  'message',
  'template',
  'merge',
  'squash',
  'commit',
]);

/**
 * Cleanup modes in which git keeps comment lines verbatim, so there is nowhere
 * in the buffer to put guidance that git is guaranteed to remove. Under these
 * modes git leaves its own status block in the message too, so staying out is
 * the only correct behavior.
 */
const NON_STRIPPING_CLEANUP = new Set(['verbatim', 'whitespace']);

/**
 * Reads a single git config value.
 *
 * @param {string} key Config key to read.
 * @returns {string} The trimmed value, or an empty string if unset/unreadable.
 */
function gitConfig(key) {
  try {
    return execFileSync('git', ['config', '--get', key], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Resolves the string git uses to mark comment lines, so guidance is still
 * stripped for authors who changed it. `core.commentString` (git >= 2.45) is
 * the modern spelling and takes precedence over the older `core.commentChar`;
 * git rejects setting both, so checking in that order is unambiguous.
 *
 * @returns {string} The configured comment prefix, or `#`.
 */
function resolveCommentPrefix() {
  const value = gitConfig('core.commentString') || gitConfig('core.commentChar');
  // `auto` lets git pick a char per message; `#` is the safe assumption.
  if (!value || value === 'auto') return '#';
  return value;
}

/**
 * Finds git's scissors line, below which everything is discarded.
 *
 * Under `git commit -v` (or `commit.verbose=true`) git appends the scissors
 * line plus the full staged diff to the buffer *before* this hook runs. Those
 * diff lines are not comments, so without this bound they would look like
 * author-written content and suppress the template entirely.
 *
 * @param {string[]} lines Lines of the commit message file.
 * @param {string} commentPrefix Comment prefix configured for this repo.
 * @returns {number} Index of the scissors line, or `lines.length` if absent.
 */
function findScissors(lines, commentPrefix) {
  const index = lines.findIndex(
    (line) => line.startsWith(commentPrefix) && line.includes('>8')
  );
  return index === -1 ? lines.length : index;
}

/**
 * Best-effort detection of `--cleanup=whitespace|verbatim` passed on the
 * command line, which `git config` cannot see and which produces no structural
 * difference in the buffer. git does say so in its own hint text, though:
 * comment-stripping modes write "will be ignored", while these modes write
 * "will be kept; you may remove them yourself".
 *
 * This is deliberately a defense-in-depth check, not the primary guard: the
 * hint is localized, so a non-English git will not match. Failing to match only
 * falls back to the normal path, so this can never make the hook less safe than
 * omitting it — it just catches the common English-locale case.
 *
 * @param {string[]} lines Lines of the commit message file.
 * @returns {boolean} True when git said it will keep comment lines.
 */
function gitSaysCommentsAreKept(lines) {
  // Matched without the comment character, which varies with core.commentChar.
  return lines.some((line) => line.includes('will be kept'));
}

/**
 * Detects `--cleanup=scissors` semantics from the buffer alone.
 *
 * This cannot be read from config: `--cleanup=scissors` on the command line is
 * invisible to the hook (it appears in neither `git config` nor the
 * environment). The buffer is unambiguous though. In scissors-cleanup mode git
 * does not strip comments above the scissors line -- it only truncates there --
 * so it relocates its own status block *below* the scissors, leaving the region
 * above empty. Under `-v` with a comment-stripping cleanup, that same status
 * block stays above the scissors. So "a scissors line with no comments above
 * it" means comments above the scissors would be committed verbatim.
 *
 * @param {string[]} lines Lines of the commit message file.
 * @param {number} scissors Index of the scissors line, or `lines.length`.
 * @param {string} commentPrefix Comment prefix configured for this repo.
 * @returns {boolean} True when comments above the scissors would survive.
 */
function isScissorsCleanup(lines, scissors, commentPrefix) {
  if (scissors === lines.length) return false;
  return !lines
    .slice(0, scissors)
    .some((line) => line.startsWith(commentPrefix));
}

/**
 * Reads .gitmessage and re-prefixes its comment lines with `commentPrefix`.
 *
 * @param {string} commentPrefix Comment prefix configured for this repo.
 * @returns {string[]} Guidance lines, or an empty array if unreadable.
 */
function readGuidanceLines(commentPrefix) {
  let raw;
  try {
    raw = readFileSync(TEMPLATE_PATH, 'utf8');
  } catch {
    return [];
  }

  return raw
    .split('\n')
    .filter((line) => line.startsWith('#'))
    .map((line) => commentPrefix + line.slice(1));
}

/**
 * Entry point. Appends guidance to an empty interactive commit buffer.
 *
 * @returns {void}
 */
function main() {
  const [msgFile, source] = process.argv.slice(2);

  // No message file, or a source that is not interactive authoring.
  if (!msgFile) return;
  if (source && NON_INTERACTIVE_SOURCES.has(source)) return;

  let original;
  try {
    original = readFileSync(msgFile, 'utf8');
  } catch {
    return;
  }

  const commentPrefix = resolveCommentPrefix();

  // Already applied (e.g. a second hook run, or commit.template points here).
  if (original.includes(TEMPLATE_MARKER)) return;

  // Nothing would be stripped, so guidance could only land in the commit.
  if (NON_STRIPPING_CLEANUP.has(gitConfig('commit.cleanup'))) return;

  const lines = original.split('\n');

  // Same situation, but requested on the command line where config cannot see
  // it; git's own hint gives it away in an English locale.
  if (gitSaysCommentsAreKept(lines)) return;

  // Only the region above the scissors line can hold author content; under
  // `-v` everything below it is git's own diff and is discarded on save.
  const scissors = findScissors(lines, commentPrefix);

  // Anything the author (or another hook) already wrote is left alone.
  const hasContent = lines
    .slice(0, scissors)
    .some((line) => line.trim() !== '' && !line.startsWith(commentPrefix));
  if (hasContent) return;

  const guidance = readGuidanceLines(commentPrefix);
  if (guidance.length === 0) return;

  let next;
  if (isScissorsCleanup(lines, scissors, commentPrefix)) {
    // Comments above the scissors would be committed verbatim here, so the
    // guidance goes below it instead: still visible while authoring, and
    // unconditionally truncated rather than merely comment-stripped.
    const body = lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
    next = [...body, ...guidance, ''];
  } else {
    // Keep the first line blank for the subject, then guidance, then git's own
    // comment block — the same layout `git config commit.template` produces.
    const firstNonEmpty = lines.findIndex((line) => line.trim() !== '');
    const rest = firstNonEmpty === -1 ? [] : lines.slice(firstNonEmpty);
    next = ['', ...guidance, ...rest];
  }

  try {
    writeFileSync(msgFile, next.join('\n'));
  } catch {
    // Fail open: a commit must never fail because guidance could not be added.
  }
}

main();

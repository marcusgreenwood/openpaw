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
 * Resolves the character git uses to mark comment lines, so guidance is still
 * stripped for authors who set `core.commentChar`.
 *
 * @returns {string} The configured comment character, or `#`.
 */
function resolveCommentChar() {
  try {
    const value = execFileSync('git', ['config', '--get', 'core.commentChar'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    // `auto` lets git pick a char per message; `#` is the safe assumption.
    if (!value || value === 'auto') return '#';
    return value;
  } catch {
    return '#';
  }
}

/**
 * Reads .gitmessage and re-prefixes its comment lines with `commentChar`.
 *
 * @param {string} commentChar Comment character configured for this repo.
 * @returns {string[]} Guidance lines, or an empty array if unreadable.
 */
function readGuidanceLines(commentChar) {
  let raw;
  try {
    raw = readFileSync(TEMPLATE_PATH, 'utf8');
  } catch {
    return [];
  }

  return raw
    .split('\n')
    .filter((line) => line.startsWith('#'))
    .map((line) => commentChar + line.slice(1));
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

  const commentChar = resolveCommentChar();

  // Already applied (e.g. a second hook run, or commit.template points here).
  if (original.includes(TEMPLATE_MARKER)) return;

  const lines = original.split('\n');

  // Anything the author (or another hook) already wrote is left alone.
  const hasContent = lines.some(
    (line) => line.trim() !== '' && !line.startsWith(commentChar)
  );
  if (hasContent) return;

  const guidance = readGuidanceLines(commentChar);
  if (guidance.length === 0) return;

  // Keep the first line blank for the subject, then guidance, then git's own
  // comment block — the same layout `git config commit.template` produces.
  const firstNonEmpty = lines.findIndex((line) => line.trim() !== '');
  const rest = firstNonEmpty === -1 ? [] : lines.slice(firstNonEmpty);

  try {
    writeFileSync(msgFile, ['', ...guidance, ...rest].join('\n'));
  } catch {
    // Fail open: a commit must never fail because guidance could not be added.
  }
}

main();

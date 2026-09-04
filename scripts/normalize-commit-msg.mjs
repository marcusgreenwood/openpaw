#!/usr/bin/env node
/**
 * Conventional Commits normalizer. Zero dependencies, Node builtins only.
 *
 * Invoked from `.husky/prepare-commit-msg`, before commitlint sees the message.
 * Rewrites subjects that can be mechanically repaired (missing type, uppercase
 * type/scope/subject, trailing period, missing blank line) and leaves anything
 * else for commitlint to reject in the `commit-msg` hook.
 *
 * Usage: node scripts/normalize-commit-msg.mjs <path-to-commit-msg-file> [source]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { TYPES, HEADER_PATTERN, stripComments, bypassReason, conforms } from './commit-rules.mjs';

const SCISSORS = /^#\s*-+\s*>8\s*-+/;
const NOTE_MARKER = '# commit-message-normalizer:';

/** Sources whose messages git owns; rewriting them breaks the workflow. */
const SKIPPED_SOURCES = new Set(['merge', 'squash', 'commit']);

/**
 * Sources for which git opens an editor and therefore cleans the message with
 * `--cleanup=strip`. Only these may receive the explanatory `#` banner: with
 * `-m`/`-F` the default cleanup is `whitespace`, so comment lines would be
 * committed verbatim and the banner would become the subject line.
 */
const EDITOR_SOURCES = new Set(['', 'template']);

/**
 * Keyword heuristics, first match wins. Deliberately ordered: a subject that
 * mentions a doc file is `docs` even when it starts with "Add".
 */
const TYPE_HINTS = [
  [/\b(docs?|documentation|readme|changelog|javadoc|jsdoc|docstring)\b/i, 'docs'],
  [/\b[\w.-]+\.mdx?\b/i, 'docs'],
  [/\b(agents\.md|claude\.md|contributing)\b/i, 'docs'],
  [/^revert\b/i, 'revert'],
  [/\b(ci|pipeline|github actions?|workflow file|codeowners)\b/i, 'ci'],
  [/\b(tests?|testing|spec|specs|coverage|fixtures?)\b/i, 'test'],
  [/\b(bump|upgrade|downgrade|dependenc(?:y|ies)|deps|lockfile|package-lock|npm audit)\b/i, 'chore'],
  [/\b(build|bundler|webpack|rollup|vite|tsconfig|next\.config|compile)\b/i, 'build'],
  [/\b(fix(?:es|ed|ing)?|resolve[ds]?|repair|correct|patch|bug|regression|broken|crash)\b/i, 'fix'],
  [/\b(perf|performance|optimi[sz]e[sd]?|speed up|faster|memoi[sz]e)\b/i, 'perf'],
  [/\b(format|formatting|lint(?:ing)?|prettier|whitespace|typo|indent)\b/i, 'style'],
  [
    /\b(refactor|rename[ds]?|move[ds]?|extract|simplif(?:y|ies|ied)|reorgani[sz]e|restructure|overhaul|rework|revamp|improve[ds]?|clean ?up|tidy|consolidate)\b/i,
    'refactor',
  ],
  [/\b(add(?:s|ed|ing)?|introduce[ds]?|implement(?:s|ed)?|create[ds]?|support|enable[ds]?|new)\b/i, 'feat'],
];

/**
 * Best-effort type for a free-form subject. Falls back to `chore`, and skips
 * any hint whose type commitlint does not allow.
 */
export function inferType(subject) {
  for (const [pattern, type] of TYPE_HINTS) {
    if (TYPES.includes(type) && pattern.test(subject)) return type;
  }
  return TYPES.includes('chore') ? 'chore' : TYPES[0];
}

/**
 * Repair a single subject line.
 * Returns `{ header, notes }` where `notes` explains each rewrite.
 */
export function normalizeHeader(header) {
  const notes = [];
  let line = header.trimEnd();

  // "feat:add x" -> "feat: add x", but only for a real type.
  const missingSpace = /^([a-zA-Z]+)(?:\([^()\r\n]*\))?!?:(?=\S)/.exec(line);
  if (missingSpace && TYPES.includes(missingSpace[1].toLowerCase())) {
    line = line.replace(/^([a-zA-Z]+(?:\([^()\r\n]*\))?!?):/, '$1: ');
    notes.push('added the missing space after the colon');
  }

  let type;
  let scope = '';
  let bang = '';
  let subject;

  const match = HEADER_PATTERN.exec(line);
  if (match && TYPES.includes(match[1].toLowerCase())) {
    type = match[1];
    const rawScope = match[2];
    bang = match[3] ?? '';
    subject = match[4];
    if (type !== type.toLowerCase()) {
      notes.push(`lowercased the type "${type}"`);
      type = type.toLowerCase();
    }
    if (rawScope !== undefined && rawScope.trim() === '') {
      notes.push('dropped the empty scope parentheses');
    } else if (rawScope !== undefined) {
      scope = `(${rawScope.toLowerCase()})`;
      if (rawScope !== rawScope.toLowerCase()) notes.push(`lowercased the scope "${rawScope}"`);
    }
  } else {
    subject = line;
    type = inferType(line);
    notes.push(`inferred the type "${type}" from the subject`);
  }

  if (/^[A-Z][a-z]/.test(subject)) {
    subject = subject.charAt(0).toLowerCase() + subject.slice(1);
    notes.push('lowercased the first word of the subject');
  }
  const withoutStop = subject.replace(/\s*\.$/, '');
  if (withoutStop !== subject && !subject.trimEnd().endsWith('...')) {
    subject = withoutStop;
    notes.push('removed the trailing period');
  }

  return { header: `${type}${scope}${bang}: ${subject}`, notes };
}

/**
 * Rewrite the message region of a raw commit-message file, preserving git's
 * comments and any `--verbose` scissors block.
 *
 * `withBanner` prepends a commented explanation of the rewrite. Only safe when
 * git will strip comments afterwards (see EDITOR_SOURCES).
 * Returns `{ changed, output, notes }`.
 */
export function normalizeMessage(raw, { withBanner = false } = {}) {
  const text = String(raw).replace(/\r\n/g, '\n');
  const unchanged = { changed: false, output: text, notes: [] };

  const message = stripComments(text);
  if (message.trim() === '') return unchanged;
  if (bypassReason(message, { env: {} })) return unchanged;
  if (conforms(message)) return unchanged;

  const lines = text.split('\n');
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (SCISSORS.test(lines[i])) break;
    if (lines[i].startsWith('#') || lines[i].trim() === '') continue;
    headerIndex = i;
    break;
  }
  if (headerIndex === -1) return unchanged;

  const { header, notes } = normalizeHeader(lines[headerIndex]);
  const next = lines[headerIndex + 1];
  if (header !== lines[headerIndex]) lines[headerIndex] = header;
  if (next !== undefined && next.trim() !== '' && !next.startsWith('#') && !SCISSORS.test(next)) {
    lines.splice(headerIndex + 1, 0, '');
    notes.push('inserted the blank line between the subject and the body');
  }
  if (notes.length === 0) return unchanged;

  const banner = withBanner
    ? [
        `${NOTE_MARKER} rewrote the subject to follow Conventional Commits.`,
        ...notes.map((n) => `#   - ${n}`),
        '#   Edit freely; see CONTRIBUTING.md. Bypass with SKIP_COMMIT_LINT=1.',
      ]
    : [];
  return { changed: true, output: [...banner, ...lines].join('\n'), notes };
}

function main(argv) {
  const [file, source] = argv;
  if (!file) return 0;
  if (process.env.SKIP_COMMIT_LINT === '1' || process.env.SKIP_COMMIT_LINT === 'true') return 0;
  if (source && SKIPPED_SOURCES.has(source)) return 0;

  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return 0;
  }

  const { changed, output, notes } = normalizeMessage(raw, {
    withBanner: EDITOR_SOURCES.has(source ?? ''),
  });
  if (!changed) return 0;

  writeFileSync(file, output);
  process.stderr.write(
    ['', '  ℹ Normalized the commit subject:', ...notes.map((n) => `    - ${n}`), ''].join('\n') +
      '\n',
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}

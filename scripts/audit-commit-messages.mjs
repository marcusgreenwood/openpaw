#!/usr/bin/env node
/**
 * Read-only audit of commit message conformance.
 *
 * Walks a commit range, validates each message against the repo's existing
 * commitlint configuration (by piping the message to the commitlint CLI, so
 * `commitlint.config.js` stays the single source of truth for the rules), and
 * buckets the results into valid / invalid / ignored.
 *
 * With `--suggest`, a proposed conforming rewrite is printed for each violating
 * subject. Suggestions are advisory text only: this script never rewrites
 * history and never mutates a file.
 *
 * Usage:
 *   node scripts/audit-commit-messages.mjs [range] [options]
 *
 *   range              A positional `A..B` revision range. Defaults to HEAD.
 *   --from <ref>       Start of the range (exclusive).
 *   --to <ref>         End of the range. Defaults to HEAD.
 *   --all              Audit every commit reachable from every ref.
 *   --suggest          Print a proposed conforming subject for each violation.
 *   --strict           Exit 1 if any non-ignored commit fails validation.
 *   --json             Emit machine-readable JSON instead of a text report.
 *   --help             Show this message.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RECORD_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FALLBACK_TYPES = [
  'feat', 'fix', 'chore', 'docs', 'style', 'refactor', 'test', 'ci', 'build', 'revert',
];

/**
 * Read the repo's own commitlint config so the allowed types and the subject
 * budget are never re-encoded here. Falls back to the conventional defaults if
 * the config cannot be loaded.
 *
 * @returns {{types: string[], subjectMaxLength: number}}
 */
function loadCommitlintConfig() {
  try {
    const require = createRequire(import.meta.url);
    const config = require(path.join(repoRoot, 'commitlint.config.js'));
    const rules = config?.rules ?? {};
    const types = rules['type-enum']?.[2];
    const max = rules['subject-max-length']?.[2];
    return {
      types: Array.isArray(types) && types.length > 0 ? types : FALLBACK_TYPES,
      subjectMaxLength: typeof max === 'number' ? max : 100,
    };
  } catch {
    return { types: FALLBACK_TYPES, subjectMaxLength: 100 };
  }
}

const COMMITLINT_CONFIG = loadCommitlintConfig();

/** Subject-line budget enforced by `subject-max-length` in commitlint.config.js. */
export const SUBJECT_MAX_LENGTH = COMMITLINT_CONFIG.subjectMaxLength;

/** Types allowed by `type-enum` in commitlint.config.js. */
export const ALLOWED_TYPES = COMMITLINT_CONFIG.types;

/**
 * Subjects commitlint skips by default. Mirrored here so they land in their own
 * bucket instead of silently counting as "valid".
 */
const IGNORED_SUBJECT_PATTERNS = [
  /^Merge\s/,
  /^Merged\s/,
  /^Automatic merge\b/,
  /^Auto-merged\s/,
  /^Revert\s/,
  /^fixup!\s/,
  /^squash!\s/,
  /^amend!\s/,
];

/** Past-tense subject verbs worth rewriting into the imperative mood. */
const IMPERATIVE_VERBS = new Map([
  ['added', 'add'],
  ['adds', 'add'],
  ['bumped', 'bump'],
  ['changed', 'change'],
  ['created', 'create'],
  ['fixed', 'fix'],
  ['fixes', 'fix'],
  ['implemented', 'implement'],
  ['improved', 'improve'],
  ['introduced', 'introduce'],
  ['moved', 'move'],
  ['overhauled', 'overhaul'],
  ['refactored', 'refactor'],
  ['removed', 'remove'],
  ['renamed', 'rename'],
  ['resolved', 'resolve'],
  ['revamped', 'revamp'],
  ['updated', 'update'],
  ['upgraded', 'upgrade'],
]);

/** First-word verbs that imply a conventional type when paths are inconclusive. */
const VERB_TYPES = [
  [/^(fix|resolve|repair|correct|patch|prevent)/, 'fix'],
  [/^(add|create|implement|introduce|support|enable)/, 'feat'],
  [/^(update|bump|upgrade|pin|sync)/, 'chore'],
  [/^(remove|delete|drop|extract|rename|move|simplify|revamp|overhaul|improve)/, 'refactor'],
  [/^(document|describe|clarify|explain)/, 'docs'],
  [/^(test|cover)/, 'test'],
];

// ---------------------------------------------------------------------------
// Pure helpers (exported for scripts/audit-commit-messages.test.mjs)
// ---------------------------------------------------------------------------

/**
 * Parse CLI arguments into an options object.
 *
 * @param {string[]} argv Arguments after the node binary and script path.
 * @returns {{revs: string[], label: string, suggest: boolean, strict: boolean,
 *   json: boolean, help: boolean, error: string|null}}
 */
export function parseArgs(argv) {
  const options = {
    revs: ['HEAD'],
    label: 'HEAD',
    suggest: false,
    strict: false,
    json: false,
    help: false,
    error: null,
  };

  let from = null;
  let to = null;
  let positional = null;
  let all = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--suggest') {
      options.suggest = true;
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--all') {
      all = true;
    } else if (arg === '--from' || arg === '--to') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        options.error = `${arg} requires a value`;
        return options;
      }
      if (arg === '--from') {
        from = value;
      } else {
        to = value;
      }
      i += 1;
    } else if (arg.startsWith('-')) {
      options.error = `unknown option: ${arg}`;
      return options;
    } else if (positional === null) {
      positional = arg;
    } else {
      options.error = `unexpected argument: ${arg}`;
      return options;
    }
  }

  if (positional !== null && (from !== null || to !== null)) {
    options.error = 'use either a positional range or --from/--to, not both';
    return options;
  }

  if (positional !== null) {
    options.revs = [positional];
    options.label = positional;
  } else if (from !== null || to !== null) {
    const range = `${from ?? ''}..${to ?? 'HEAD'}`;
    options.revs = [range];
    options.label = range;
  } else if (all) {
    options.revs = ['--all'];
    options.label = 'all refs';
  }

  return options;
}

/**
 * Split `git log --format=%H%x1f%B%x1e` output into commit records.
 *
 * Records are separated by RS and the hash is separated from the raw body by
 * US, so multi-line bodies (including blank lines) survive intact.
 *
 * @param {string} stdout Raw git output.
 * @returns {{hash: string, subject: string, message: string}[]}
 */
export function splitLog(stdout) {
  return stdout
    .split(RECORD_SEPARATOR)
    // git terminates each record with a newline; drop only that one.
    .map((record) => record.replace(/^\r?\n/, ''))
    .filter((record) => record.trim() !== '')
    .map((record) => {
      const separator = record.indexOf(FIELD_SEPARATOR);
      if (separator === -1) return null;
      const hash = record.slice(0, separator).trim();
      const message = record.slice(separator + 1).replace(/\s+$/, '');
      return { hash, message, subject: message.split('\n')[0] };
    })
    .filter((record) => record !== null && record.hash !== '');
}

/**
 * Whether commitlint skips this subject by default (merges, reverts, fixups).
 *
 * @param {string} subject
 * @returns {boolean}
 */
export function isIgnoredSubject(subject) {
  return IGNORED_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject));
}

/**
 * Lowercase the leading word unless it looks like an acronym or identifier.
 *
 * @param {string} subject
 * @returns {string}
 */
export function lowercaseFirstWord(subject) {
  const [first, ...rest] = subject.split(' ');
  if (first === undefined || first === '') return subject;
  // Leave ALL-CAPS acronyms and CamelCase identifiers alone.
  if (first === first.toUpperCase() && first.length > 1) return subject;
  if (/[A-Z]/.test(first.slice(1))) return subject;
  return [first.charAt(0).toLowerCase() + first.slice(1), ...rest].join(' ');
}

/**
 * Strip a single trailing period (`subject-full-stop`).
 *
 * @param {string} subject
 * @returns {string}
 */
export function stripTrailingPeriod(subject) {
  return subject.replace(/\.\s*$/, '');
}

/**
 * Rewrite a leading past-tense verb into the imperative mood.
 *
 * @param {string} subject
 * @returns {string}
 */
export function toImperative(subject) {
  const [first, ...rest] = subject.split(' ');
  if (first === undefined) return subject;
  const replacement = IMPERATIVE_VERBS.get(first.toLowerCase());
  if (replacement === undefined) return subject;
  return [replacement, ...rest].join(' ');
}

/**
 * Truncate to at most `max` characters, trimming at a word boundary.
 *
 * @param {string} text
 * @param {number} [max]
 * @returns {string}
 */
export function truncate(text, max = SUBJECT_MAX_LENGTH) {
  if (text.length <= max) return text;
  const clipped = text.slice(0, max);
  const lastSpace = clipped.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd();
}

/**
 * Infer a conventional type from the changed paths first, then the subject verb.
 *
 * @param {{subject: string, files?: string[]}} commit
 * @returns {string} One of the types allowed by commitlint.config.js.
 */
export function inferType({ subject, files = [] }) {
  const paths = files.filter((file) => file !== '');

  if (paths.length > 0) {
    const isDoc = (file) => /\.(md|mdx|txt)$/i.test(file) || /^docs\//.test(file) || /^LICENSE$/.test(file);
    const isCi = (file) => /^\.github\//.test(file) || /^\.husky\//.test(file) || /^\.(gitlab-ci|travis)\.yml$/.test(file);
    const isTest = (file) => /(^|\/)__tests__\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
    const isTooling = (file) =>
      /^(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(file) ||
      /^(eslint|next|postcss|tailwind|commitlint|tsconfig)\b.*\.(js|mjs|cjs|ts|json)$/.test(file) ||
      /^\.(editorconfig|gitignore|npmrc|nvmrc)$/.test(file);

    if (paths.every(isDoc)) return 'docs';
    if (paths.every(isCi)) return 'ci';
    if (paths.every(isTest)) return 'test';
    if (paths.every((file) => isTooling(file) || isCi(file))) return 'chore';
  }

  const normalized = subject.trim().toLowerCase();
  for (const [pattern, type] of VERB_TYPES) {
    if (pattern.test(normalized)) return type;
  }
  return 'chore';
}

/**
 * Build a proposed conforming subject for a violating commit.
 *
 * Advisory output only — nothing is rewritten on disk or in git.
 *
 * @param {{subject: string, files?: string[]}} commit
 * @param {string[]} [allowedTypes] Types permitted by commitlint's type-enum.
 * @returns {string}
 */
export function suggestSubject({ subject, files = [] }, allowedTypes = ALLOWED_TYPES) {
  const raw = subject.trim();
  // Preserve an existing `type(scope):` prefix, but only when the type is one
  // commitlint actually allows — otherwise `OpenPaw: ...` would masquerade as a
  // type and the suggestion would still fail type-enum.
  const match = raw.match(/^([a-zA-Z]+)(\([^)]*\))?(!)?:\s*(.*)$/);
  const conventional = match !== null && allowedTypes.includes(match[1].toLowerCase()) ? match : null;
  const type = conventional ? conventional[1].toLowerCase() : inferType({ subject: raw, files });
  const scope = conventional ? (conventional[2] ?? '') + (conventional[3] ?? '') : '';
  const description = conventional ? conventional[4] : raw;

  let text = stripTrailingPeriod(description.trim());
  text = toImperative(text);
  text = lowercaseFirstWord(text);

  const prefix = `${type}${scope}: `;
  return prefix + truncate(text, SUBJECT_MAX_LENGTH - prefix.length);
}

/**
 * Extract commitlint rule names (`[rule-name]`) from CLI output.
 *
 * @param {string} output
 * @returns {string[]}
 */
export function parseRuleNames(output) {
  const names = new Set();
  for (const line of output.split('\n')) {
    // Only the marker lines carry rule ids; the echoed input can legitimately
    // contain bracketed text (e.g. an `/api/skills/[name]` route).
    const match = line.match(/^\s*[\u2716\u26A0\u2717x!?]\s+.*\[([a-z][a-z0-9-]*)\]\s*$/);
    if (match) names.add(match[1]);
  }
  return [...names];
}

// ---------------------------------------------------------------------------
// Git / commitlint plumbing
// ---------------------------------------------------------------------------

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Prefer the locally installed commitlint binary; fall back to `npx --no`.
 * Either way the repo's own commitlint.config.js supplies the rules.
 */
function resolveCommitlint() {
  const local = path.join(repoRoot, 'node_modules', '.bin', 'commitlint');
  if (existsSync(local)) return { command: local, prefix: [] };
  return { command: 'npx', prefix: ['--no', '--', 'commitlint'] };
}

function lintMessage(runner, message) {
  const result = spawnSync(runner.command, runner.prefix, {
    cwd: repoRoot,
    input: message,
    encoding: 'utf8',
  });
  if (result.error) {
    throw new Error(`failed to run commitlint: ${result.error.message}`);
  }
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return { ok: result.status === 0, output, rules: parseRuleNames(output) };
}

function changedFiles(hash) {
  try {
    return git(['show', '--name-only', '--format=', '--no-renames', hash])
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printTextReport(report, options) {
  const { valid, invalid, ignored, label } = report;
  const total = valid.length + invalid.length + ignored.length;

  console.log(`Commit message audit — ${label}`);
  console.log(`  ${total} commit(s): ${valid.length} valid, ${invalid.length} invalid, ${ignored.length} ignored`);

  if (invalid.length > 0) {
    console.log('\nNon-conforming commits (oldest last):');
    for (const commit of invalid) {
      console.log(`\n  ${commit.hash.slice(0, 8)}  ${commit.subject}`);
      for (const rule of commit.rules) {
        console.log(`      violates: ${rule}`);
      }
      if (options.suggest && commit.suggestion) {
        if (commit.suggestion === commit.subject) {
          console.log('      suggest:  subject already conforms; the violation is in the body or footer');
        } else {
          console.log(`      suggest:  ${commit.suggestion}`);
        }
      }
    }
  }

  if (ignored.length > 0) {
    console.log(`\nIgnored by commitlint (merges, reverts, fixups): ${ignored.length}`);
    for (const commit of ignored) {
      console.log(`  ${commit.hash.slice(0, 8)}  ${commit.subject}`);
    }
  }

  if (invalid.length > 0 && !options.strict) {
    console.log('\nReporting mode: exiting 0. Pass --strict to fail on violations.');
  }
}

function printHelp() {
  console.log(`Usage: node scripts/audit-commit-messages.mjs [range] [options]

Read-only audit of commit message conformance against commitlint.config.js.
Never rewrites history and never modifies a file.

Arguments:
  range          Positional revision range, e.g. HEAD~10..HEAD (default: HEAD)

Options:
  --from <ref>   Start of the range (exclusive)
  --to <ref>     End of the range (default: HEAD)
  --all          Audit every commit reachable from every ref
  --suggest      Print a proposed conforming subject for each violation
  --strict       Exit 1 when any non-ignored commit fails validation
  --json         Emit JSON instead of a text report
  -h, --help     Show this message`);
}

function main(argv) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return 0;
  }
  if (options.error) {
    console.error(`error: ${options.error}\n`);
    printHelp();
    return 2;
  }

  let raw;
  try {
    raw = git(['log', `--format=%H${FIELD_SEPARATOR}%B${RECORD_SEPARATOR}`, ...options.revs]);
  } catch (error) {
    console.error(`error: could not read git history for "${options.label}"`);
    console.error(String(error.stderr ?? error.message).trim());
    return 2;
  }

  const commits = splitLog(raw);
  const runner = resolveCommitlint();
  const valid = [];
  const invalid = [];
  const ignored = [];

  for (const commit of commits) {
    if (isIgnoredSubject(commit.subject)) {
      ignored.push({ hash: commit.hash, subject: commit.subject });
      continue;
    }

    const result = lintMessage(runner, commit.message);
    if (result.ok) {
      valid.push({ hash: commit.hash, subject: commit.subject });
      continue;
    }

    const entry = { hash: commit.hash, subject: commit.subject, rules: result.rules, output: result.output };
    if (options.suggest) {
      entry.suggestion = suggestSubject({ subject: commit.subject, files: changedFiles(commit.hash) });
    }
    invalid.push(entry);
  }

  const report = { label: options.label, valid, invalid, ignored };

  if (options.json) {
    console.log(JSON.stringify({
      range: options.label,
      total: commits.length,
      counts: { valid: valid.length, invalid: invalid.length, ignored: ignored.length },
      valid,
      invalid,
      ignored,
    }, null, 2));
  } else {
    printTextReport(report, options);
  }

  return options.strict && invalid.length > 0 ? 1 : 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}

/**
 * Conventional Commits parsing, normalization and validation for this repo.
 *
 * Single source of truth shared by:
 *   - scripts/commit-msg.mjs      (git commit-msg hook: auto-fix + reject)
 *   - scripts/lint-commits.mjs    (range linter for CI / PRs)
 *   - scripts/test-commit-message.mjs (node:test unit tests)
 *
 * Everything exported here is pure: no filesystem, no process, no git.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Allowed commit types, with the one-line meaning documented in CONTRIBUTING.md. */
export const TYPES = Object.freeze({
  feat: "a new user-facing feature",
  fix: "a bug fix",
  docs: "documentation only",
  style: "formatting only, no behaviour change",
  refactor: "restructuring without behaviour change",
  perf: "a performance improvement",
  test: "tests only",
  build: "build system, dependencies, tooling",
  ci: "CI configuration and scripts",
  chore: "maintenance that fits nothing else",
  revert: "reverts a previous commit",
});

/** Common misspellings / plurals mapped onto a canonical type. */
export const TYPE_ALIASES = Object.freeze({
  feature: "feat",
  features: "feat",
  feats: "feat",
  bugfix: "fix",
  bugfixes: "fix",
  hotfix: "fix",
  fixes: "fix",
  fixed: "fix",
  doc: "docs",
  documentation: "docs",
  styles: "style",
  styling: "style",
  refactoring: "refactor",
  refactors: "refactor",
  performance: "perf",
  tests: "test",
  testing: "test",
  builds: "build",
  chores: "chore",
  reverts: "revert",
});

export const MAX_SUBJECT_LENGTH = 72;
export const MAX_BODY_LINE_LENGTH = 100;

/** The grammar we enforce, shown verbatim in hook error output. */
export const SUBJECT_GRAMMAR = "<type>(<optional scope>)<!>: <subject>";

/** Real examples taken from this repo's history. */
export const EXAMPLES = Object.freeze([
  "feat: add Voice Mode (Speech-to-Text) input component",
  "fix: resolve lint warnings in workflow files",
]);

/**
 * Trailer keys we recognise without a hyphen. Any key containing a hyphen
 * (`Co-Authored-By`, `Nightshift-Task`, `Signed-off-by`) is also treated as a
 * trailer, which keeps prose paragraphs like "Note: ..." out of the trailer
 * block.
 */
const KNOWN_TRAILER_KEYS = new Set([
  "cc",
  "closes",
  "fixes",
  "refs",
  "see",
  "bug",
  "breaking change",
]);

const SCISSORS = "------------------------ >8 ------------------------";

/** `<type>(<scope>)!: <description>` — `\s*` so a missing space is parseable. */
const HEADER_RE = /^([A-Za-z][A-Za-z0-9]*)(\(([^()]*)\))?(!)?:(\s*)(.*)$/;
const TRAILER_RE = /^([A-Za-z][A-Za-z0-9-]*|BREAKING CHANGE):[ \t](.*\S.*)$/;
const TRAILER_CONTINUATION_RE = /^[ \t]+\S/;

// ---------------------------------------------------------------------------
// Splitting
// ---------------------------------------------------------------------------

function isTrailerKeyLine(line) {
  const match = TRAILER_RE.exec(line);
  if (!match) return false;
  const key = match[1];
  return key.includes("-") || KNOWN_TRAILER_KEYS.has(key.toLowerCase());
}

function isTrailerLine(line) {
  return isTrailerKeyLine(line) || TRAILER_CONTINUATION_RE.test(line);
}

/**
 * Split a raw commit message file into its parts.
 *
 * Comment lines (`#...`) and everything from git's scissors line onward are
 * pulled out verbatim and re-emitted untouched — they are git's, not ours.
 *
 * @param {string} raw
 * @returns {{subject: string, body: string[], trailers: string[], comments: string[]}}
 */
export function splitCommitMessage(raw) {
  const lines = String(raw ?? "")
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));

  // Pull out comments / the verbose diff.
  const content = [];
  const comments = [];
  let inScissors = false;
  for (const line of lines) {
    if (inScissors) {
      comments.push(line);
      continue;
    }
    if (line.startsWith("#")) {
      if (line.includes(SCISSORS)) inScissors = true;
      comments.push(line);
      continue;
    }
    content.push(line);
  }

  // Drop leading and trailing blank content lines.
  while (content.length && content[0].trim() === "") content.shift();
  while (content.length && content[content.length - 1].trim() === "") content.pop();

  if (content.length === 0) {
    return { subject: "", body: [], trailers: [], comments };
  }

  const subject = content[0];
  let rest = content.slice(1);

  // The trailer block is the final paragraph whose first line is a trailer.
  let trailers = [];
  const lastBlank = rest.lastIndexOf("");
  const candidateStart = lastBlank === -1 ? 0 : lastBlank + 1;
  const candidate = rest.slice(candidateStart);
  if (candidate.length > 0 && isTrailerKeyLine(candidate[0])) {
    trailers = candidate;
    rest = rest.slice(0, candidateStart);
  }

  while (rest.length && rest[rest.length - 1].trim() === "") rest.pop();
  while (rest.length && rest[0].trim() === "") rest.shift();

  return { subject, body: rest, trailers, comments };
}

// ---------------------------------------------------------------------------
// Exemptions
// ---------------------------------------------------------------------------

const EXEMPT_PREFIXES = ["fixup! ", "squash! ", "amend! "];

/**
 * Messages git generates itself (merges, reverts, autosquash markers) are
 * passed through untouched — rewriting them breaks tooling that parses them.
 *
 * @param {string} raw
 * @returns {boolean}
 */
export function isExemptMessage(raw) {
  const { subject } = splitCommitMessage(raw);
  if (subject === "") return true; // empty message: git aborts the commit itself
  if (/^Merge\b/.test(subject)) return true;
  if (/^Revert "/.test(subject)) return true;
  if (/^Reapply "/.test(subject)) return true;
  return EXEMPT_PREFIXES.some((prefix) => subject.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * A subject's first word is left alone when it looks like an identifier,
 * acronym or filename (`README`, `ChatInterface`, `AGENTS.md`); only a plainly
 * capitalized English word (`Add`) is lowercased.
 */
function shouldLowercaseFirstWord(description) {
  const firstWord = description.split(/\s+/, 1)[0] ?? "";
  const stripped = firstWord.replace(/[^A-Za-z]+$/, "");
  return /^[A-Z][a-z]+$/.test(stripped);
}

function normalizeSubject(subject, changes) {
  let next = subject.trim();
  if (next !== subject) changes.push("trimmed subject whitespace");

  const match = HEADER_RE.exec(next);
  if (!match) return next; // no type present — validation reports it, we never guess one

  const [, rawType, , rawScope, bang, gap, rawDescription] = match;

  let type = rawType;
  if (type !== type.toLowerCase()) {
    type = type.toLowerCase();
    changes.push(`lowercased type "${rawType}" -> "${type}"`);
  }
  if (TYPE_ALIASES[type]) {
    const canonical = TYPE_ALIASES[type];
    changes.push(`mapped type alias "${type}" -> "${canonical}"`);
    type = canonical;
  }

  if (gap !== " " && rawDescription !== "") {
    changes.push('inserted a single space after ":"');
  }

  let description = rawDescription.trim();
  if (description.endsWith(".") && !description.endsWith("..")) {
    description = description.slice(0, -1).trimEnd();
    changes.push("removed trailing period from subject");
  }
  if (description && shouldLowercaseFirstWord(description)) {
    description = description[0].toLowerCase() + description.slice(1);
    changes.push("lowercased first word of subject");
  }

  const scope = rawScope === undefined ? "" : `(${rawScope.trim()})`;
  return `${type}${scope}${bang ?? ""}: ${description}`;
}

function normalizeBody(body, changes) {
  const trimmed = body.map((line) => line.replace(/[ \t]+$/, ""));
  if (trimmed.some((line, i) => line !== body[i])) {
    changes.push("trimmed trailing whitespace");
  }

  const collapsed = [];
  for (const line of trimmed) {
    if (line === "" && collapsed[collapsed.length - 1] === "") continue;
    collapsed.push(line);
  }
  if (collapsed.length !== trimmed.length) changes.push("collapsed blank lines");

  while (collapsed.length && collapsed[0] === "") collapsed.shift();
  while (collapsed.length && collapsed[collapsed.length - 1] === "") collapsed.pop();
  return collapsed;
}

/**
 * Apply every safe, content-preserving fix. Never invents a type, never edits
 * the trailer block or comment lines.
 *
 * @param {string} raw
 * @returns {{text: string, changes: string[]}}
 */
export function normalizeCommitMessage(raw) {
  const changes = [];
  if (isExemptMessage(raw)) return { text: String(raw ?? ""), changes };

  const parts = splitCommitMessage(raw);
  const subject = normalizeSubject(parts.subject, changes);
  const body = normalizeBody(parts.body, changes);

  const out = [subject];
  if (body.length) out.push("", ...body);
  if (parts.trailers.length) out.push("", ...parts.trailers);
  if (parts.comments.length) out.push(...parts.comments);

  if (missingBlankSeparator(raw)) {
    changes.push("inserted blank line between subject and body");
  }

  return { text: `${out.join("\n")}\n`, changes };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * True when the raw message runs the body straight on from the subject with no
 * blank separator (comment lines ignored).
 */
function missingBlankSeparator(raw) {
  const content = String(raw ?? "")
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line))
    .filter((line) => !line.startsWith("#"));
  let i = 0;
  while (i < content.length && content[i].trim() === "") i += 1;
  const second = content[i + 1];
  return second !== undefined && second.trim() !== "";
}

/**
 * @param {string} raw
 * @returns {{ok: boolean, errors: string[], warnings: string[], subject: string}}
 */
export function validateCommitMessage(raw) {
  const errors = [];
  const warnings = [];
  const parts = splitCommitMessage(raw);
  const { subject } = parts;

  if (isExemptMessage(raw)) {
    return { ok: true, errors, warnings, subject };
  }

  const match = HEADER_RE.exec(subject);
  if (!match) {
    if (subject.includes(":")) {
      errors.push(
        `subject does not start with a valid type token — expected ${SUBJECT_GRAMMAR}`,
      );
    } else {
      errors.push(
        `subject is missing a "<type>: " prefix — expected ${SUBJECT_GRAMMAR}`,
      );
    }
  } else {
    const [, rawType, , rawScope, , gap, description] = match;

    if (!Object.hasOwn(TYPES, rawType)) {
      const hint = TYPE_ALIASES[rawType.toLowerCase()];
      errors.push(
        `unknown type "${rawType}"${hint ? ` (did you mean "${hint}"?)` : ""} — allowed: ${Object.keys(TYPES).join(", ")}`,
      );
    }
    if (gap !== " ") {
      errors.push('the colon must be followed by exactly one space ("feat: add x")');
    }
    if (description.trim() === "") {
      errors.push("subject description is empty");
    }
    if (rawScope !== undefined && rawScope.trim() === "") {
      errors.push("scope parentheses are empty — omit them or name a scope");
    }
    if (description.endsWith(".")) {
      errors.push("subject must not end with a period");
    }
    if (description && shouldLowercaseFirstWord(description)) {
      errors.push(
        `subject description must start lowercase ("${description.split(/\s+/, 1)[0]}" is not an identifier or acronym)`,
      );
    }
  }

  if (subject.length > MAX_SUBJECT_LENGTH) {
    errors.push(
      `subject is ${subject.length} characters — keep it to ${MAX_SUBJECT_LENGTH} or fewer`,
    );
  }

  if (missingBlankSeparator(raw)) {
    errors.push("subject and body must be separated by a blank line");
  }

  // Trailer block must be well formed and last.
  if (parts.trailers.length && !parts.trailers.every(isTrailerLine)) {
    const bad = parts.trailers.find((line) => !isTrailerLine(line));
    errors.push(
      `malformed trailer block — every line must be "Key: value" (got "${bad}")`,
    );
  }

  for (const line of parts.body) {
    if (line.length > MAX_BODY_LINE_LENGTH) {
      warnings.push(
        `body line exceeds ${MAX_BODY_LINE_LENGTH} characters (${line.length}): "${line.slice(0, 40)}…"`,
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings, subject };
}

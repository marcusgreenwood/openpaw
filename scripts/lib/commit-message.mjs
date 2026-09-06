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

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

/**
 * Leading imperative verb -> type, used only for a subject carrying no type
 * prefix at all.
 *
 * Most of this repo's pre-standard history is written that way ("Add agent
 * memory feature", "Update AGENTS.md with ...", "Revamp skills manager ..."),
 * and a hook that rejected all of it would be one authors route around rather
 * than use. The table is deliberately small and literal: each verb maps to the
 * type it always means in this history. A first word that is not in it is
 * rejected rather than guessed at — a wrong type is worse than an error,
 * because nothing downstream ever re-examines it.
 */
export const TYPE_INFERENCE_VERBS = Object.freeze({
  feat: ["add", "adds", "introduce", "implement", "create", "support", "enable"],
  fix: ["fix", "fixes", "resolve", "correct", "repair", "patch"],
  docs: ["document", "describe", "clarify"],
  test: ["test", "cover"],
  perf: ["optimize", "optimise"],
  refactor: [
    "refactor",
    "revamp",
    "overhaul",
    "improve",
    "simplify",
    "clean",
    "cleanup",
    "reorganize",
    "restructure",
    "rework",
    "extract",
  ],
  chore: ["update", "bump", "upgrade", "rename", "move", "remove", "delete", "drop", "sync", "pin"],
});

const VERB_TO_TYPE = new Map(
  Object.entries(TYPE_INFERENCE_VERBS).flatMap(([type, verbs]) =>
    verbs.map((verb) => [verb, type]),
  ),
);

/**
 * Types a docs-only subject may be promoted to `docs` from.
 *
 * `feat` is deliberately not among them. "Add scheduled tasks (crons), prompt
 * crons, Run now, and update README" names exactly one path — README — and is
 * plainly a feature; promoting it would be the inference getting it wrong in
 * the one direction that matters.
 */
const DOCS_OVERRIDABLE = new Set(["chore", "refactor"]);
const DOCS_FILE_RE = /\.(md|mdx|rst|txt)$/i;
const BARE_DOC_NAMES = new Set(["readme", "license", "changelog", "contributing"]);
const FILENAME_RE = /^[\w.-]+\.[A-Za-z0-9]{1,5}$/;

/** The words in a subject that name a file or directory, stripped of punctuation. */
function pathLikeTokens(subject) {
  return subject
    .split(/\s+/)
    .map((token) => token.replace(/^[("'`[<]+/, "").replace(/[)"'`\]>,.:;!?]+$/, ""))
    .filter(
      (token) =>
        token !== "" &&
        (token.includes("/") || FILENAME_RE.test(token) || BARE_DOC_NAMES.has(token.toLowerCase())),
    );
}

function isDocsPath(token) {
  return (
    token.startsWith("docs/") ||
    DOCS_FILE_RE.test(token) ||
    BARE_DOC_NAMES.has(token.toLowerCase())
  );
}

/**
 * Infer a type for a subject written without one, or null when no rule fits.
 *
 * @param {string} subject
 * @returns {string|null}
 */
export function inferSubjectType(subject) {
  const firstWord = (String(subject ?? "").trim().split(/\s+/, 1)[0] ?? "")
    .replace(/[^A-Za-z]+$/, "")
    .toLowerCase();
  const type = VERB_TO_TYPE.get(firstWord);
  if (!type) return null;

  // "Update AGENTS.md with the memory feature" is documentation, not a chore.
  // Only when *every* path named is a docs path: a subject naming both
  // README.md and lib/chat/handler.ts is a code change that touched the docs.
  if (DOCS_OVERRIDABLE.has(type)) {
    const paths = pathLikeTokens(subject);
    if (paths.length > 0 && paths.every(isDocsPath)) return "docs";
  }
  return type;
}

/** Is this token a type we know, canonical or alias? */
function isTypeToken(token) {
  const lower = String(token).toLowerCase();
  return Object.hasOwn(TYPES, lower) || Object.hasOwn(TYPE_ALIASES, lower);
}

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
 * trailer key.
 *
 * A key alone is not enough to claim the trailer block: hyphenated words open
 * ordinary prose too ("Non-obvious: ...", "Follow-up: ..."). See isTrailerBlock,
 * which requires the *whole* final paragraph to parse before claiming it.
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
 * Decide whether the message's final paragraph is a git trailer block.
 *
 * Requiring *every* line to parse (not just the first) is what separates
 * `Nightshift-Task: x` + `Nightshift-Ref: y` from a closing prose paragraph
 * that happens to open with a hyphenated word:
 *
 *     Non-obvious: the hook rewrites the file in place, so
 *     the editor must reload it.
 *
 * Line 1 looks like a trailer; line 2 does not. Treating that paragraph as body
 * prose is both the correct reading and the only one that cannot wedge an
 * author — a paragraph we decline to claim is simply body text, never an error.
 */
function isTrailerBlock(paragraph) {
  return (
    paragraph.length > 0 &&
    isTrailerKeyLine(paragraph[0]) &&
    paragraph.every(isTrailerLine)
  );
}

/**
 * Is this line one of git's own comment lines rather than message content?
 *
 * Everything starting with `#` is — except on line 1. Git's editor template is
 * only ever *appended* to the message, and always opens with a blank line, so a
 * `#` in the very first column of the very first line is never git's. Under the
 * default cleanup for `-m`/`-F` (`whitespace`) such a line is a real subject,
 * so we lint it rather than treating the message as empty and skipping it.
 */
function isCommentLine(line, index) {
  return index > 0 && line.startsWith("#");
}

/** Split into lines, tolerating CRLF. The final newline is not a line. */
function splitLines(raw) {
  const lines = String(raw ?? "")
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Split a raw commit message file into its parts.
 *
 * `subject`, `body` and `trailers` are the *content* view used for validation:
 * comment lines and everything from git's scissors line onward are set aside in
 * `comments`, because git does not commit them. `content` is every content line
 * before that filtering, which is what the blank-line rules are judged against.
 *
 * This view is for reading the message, never for rewriting it —
 * `normalizeCommitMessage` edits the original lines in place so that nothing
 * can be reordered. See the note there.
 *
 * @param {string} raw
 * @returns {{subject: string, body: string[], trailers: string[], comments: string[], content: string[]}}
 */
export function splitCommitMessage(raw) {
  const lines = splitLines(raw);

  const content = [];
  const comments = [];
  let inScissors = false;
  for (const [index, line] of lines.entries()) {
    if (inScissors) {
      comments.push(line);
      continue;
    }
    if (isCommentLine(line, index)) {
      if (line.includes(SCISSORS)) inScissors = true;
      comments.push(line);
      continue;
    }
    content.push(line);
  }

  // Drop leading and trailing blank content lines.
  const trimmed = content.slice();
  while (trimmed.length && trimmed[0].trim() === "") trimmed.shift();
  while (trimmed.length && trimmed[trimmed.length - 1].trim() === "") trimmed.pop();

  if (trimmed.length === 0) {
    return { subject: "", body: [], trailers: [], comments, content };
  }

  const subject = trimmed[0];
  let rest = trimmed.slice(1);

  // The trailer block is the final paragraph, when all of it parses as trailers.
  let trailers = [];
  const lastBlank = rest.lastIndexOf("");
  const candidateStart = lastBlank === -1 ? 0 : lastBlank + 1;
  const candidate = rest.slice(candidateStart);
  if (isTrailerBlock(candidate)) {
    trailers = candidate;
    rest = rest.slice(0, candidateStart);
  }

  while (rest.length && rest[rest.length - 1].trim() === "") rest.pop();
  while (rest.length && rest[0].trim() === "") rest.shift();

  return { subject, body: rest, trailers, comments, content };
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

  let match = HEADER_RE.exec(next);
  // A prefix that maps to no type we know is not a type token at all
  // ("OpenPaw: AI agent chat ..."), so it goes to inference with the rest of
  // the subject rather than being "corrected" into something it never was.
  if (match && !isTypeToken(match[1])) match = null;

  if (!match) {
    const inferred = inferSubjectType(next);
    // No rule fits: leave the subject exactly as written and let validation
    // report the missing type.
    if (inferred === null) return next;
    next = `${inferred}: ${next}`;
    changes.push(`inferred type "${inferred}" from the subject's leading verb`);
    match = HEADER_RE.exec(next);
  }

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

  // Strip the whole trailing run, so an ellipsis goes too. The validator rejects
  // any subject ending in "." with no carve-out; if the normalizer preserved
  // "..." here the two would disagree and the author would be stuck with a
  // message we blessed and then refused. One rule, applied in both places.
  let description = rawDescription.trim();
  const trailingPeriods = /\.+$/.exec(description);
  if (trailingPeriods) {
    description = description.slice(0, -trailingPeriods[0].length).trimEnd();
    changes.push(
      trailingPeriods[0].length === 1
        ? "removed trailing period from subject"
        : `removed trailing "${trailingPeriods[0]}" from subject`,
    );
  }
  if (description && shouldLowercaseFirstWord(description)) {
    description = description[0].toLowerCase() + description.slice(1);
    changes.push("lowercased first word of subject");
  }

  const scope = rawScope === undefined ? "" : `(${rawScope.trim()})`;
  const head = `${type}${scope}${bang ?? ""}:`;
  // No trailing space when there is nothing to say — validation rejects the
  // empty description anyway, but it should not be reported as a stray space.
  return description === "" ? head : `${head} ${description}`;
}

/**
 * Drop leading and trailing blank lines, then collapse interior runs of blanks
 * to one. Reports the collapse but not the edge trim: git performs both itself
 * under either default cleanup mode, and every message file ends with a newline,
 * so reporting the edges would fire on almost every commit for no reason.
 *
 * The last leading blank is kept when a comment line follows it, because
 * `isCommentLine` exempts index 0 so that a subject may itself start with `#`
 * under `--cleanup=whitespace`. git's editor template is exactly that shape —
 * a blank line, then its `# Please enter the commit message` block — so an
 * author who types their subject *below* the block would otherwise have git's
 * own boilerplate promoted to index 0 and re-read as the subject, rejecting a
 * perfectly good message and leaving the rewritten file to do it again.
 */
function normalizeBlankLines(lines, changes) {
  const out = lines.slice();
  while (out.length && out[0] === "" && !(out[1] ?? "").startsWith("#")) out.shift();
  while (out.length && out[out.length - 1] === "") out.pop();

  const collapsed = [];
  for (const line of out) {
    if (line === "" && collapsed[collapsed.length - 1] === "") continue;
    collapsed.push(line);
  }
  if (collapsed.length !== out.length) changes.push("collapsed blank lines");
  return collapsed;
}

/**
 * Apply every safe, content-preserving fix. Never invents a type, never edits
 * the trailer block or comment lines.
 *
 * The message is rewritten by editing its lines *in place* — never by taking
 * the parsed subject/body/trailer view apart and reassembling it. Reassembly
 * has to put the comment lines back somewhere, and putting them anywhere but
 * where the author left them is a silent rewrite of the commit: git only
 * discards `#` lines under `--cleanup=strip` (editor mode), whereas the default
 * for `-m`/`-F` is `--cleanup=whitespace`, which keeps them as body content.
 * Editing in place cannot reorder anything, so it is correct under both.
 *
 * The blank-line and trailing-whitespace rules below are exactly what git's own
 * cleanup does in either mode, so they never change the committed message.
 *
 * @param {string} raw
 * @returns {{text: string, changes: string[]}}
 */
export function normalizeCommitMessage(raw) {
  const changes = [];
  const original = String(raw ?? "");
  if (isExemptMessage(original)) return { text: original, changes };

  const lines = splitLines(original);

  // Everything from the scissors line onward is the verbose diff git appended.
  // Not ours to touch, not even for whitespace.
  const scissorsAt = lines.findIndex(
    (line, index) => isCommentLine(line, index) && line.includes(SCISSORS),
  );
  const head = scissorsAt === -1 ? lines : lines.slice(0, scissorsAt);
  const tail = scissorsAt === -1 ? [] : lines.slice(scissorsAt);

  const trimmed = head.map((line) => line.replace(/[ \t]+$/, ""));
  if (trimmed.some((line, i) => line !== head[i])) {
    changes.push("trimmed trailing whitespace");
  }

  // isExemptMessage covers the no-content case, so a subject line exists here.
  const subjectAt = trimmed.findIndex(
    (line, index) => !isCommentLine(line, index) && line.trim() !== "",
  );
  trimmed[subjectAt] = normalizeSubject(trimmed[subjectAt], changes);

  const parts = splitCommitMessage(original);
  if (missingBlankSeparator(parts)) {
    trimmed.splice(subjectAt + 1, 0, "");
    changes.push("inserted blank line between subject and body");
  }

  const out = [...normalizeBlankLines(trimmed, changes), ...tail];
  const text = `${out.join("\n")}\n`;

  // A rewrite the author is never told about is how a body quietly loses a line.
  // Nothing above should reach here silently; this is the backstop that says so.
  if (changes.length === 0 && text !== original && text !== `${original}\n`) {
    changes.push("tidied blank lines");
  }

  return { text, changes };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * True when the message runs the body straight on from the subject with no
 * blank separator. Takes a `splitCommitMessage` result so it judges the same
 * content lines — comments excluded — that everything else here does.
 */
function missingBlankSeparator(parts) {
  const content = parts.content;
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
    if (gap !== " " && description.trim() !== "") {
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

  if (missingBlankSeparator(parts)) {
    errors.push("subject and body must be separated by a blank line");
  }

  // No trailer-block error exists by design: splitCommitMessage only claims the
  // final paragraph when every line of it parses, so a paragraph that does not
  // is body prose rather than a broken trailer block. That removes a rejection
  // an author had no way to satisfy other than rewording.

  for (const line of parts.body) {
    if (line.length > MAX_BODY_LINE_LENGTH) {
      warnings.push(
        `body line exceeds ${MAX_BODY_LINE_LENGTH} characters (${line.length}): "${line.slice(0, 40)}…"`,
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings, subject };
}

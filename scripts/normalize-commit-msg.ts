/**
 * Commit message normalizer — programmatic API.
 *
 * Applies the same normalization logic as the .githooks/commit-msg shell hook.
 * Validates/normalizes a raw commit message to Conventional Commits format:
 *   <type>(<scope>): <subject>
 *
 * Valid types: feat, fix, docs, chore, refactor, test, ci, build
 */

export type ConventionalType =
  | "feat"
  | "fix"
  | "docs"
  | "chore"
  | "refactor"
  | "test"
  | "ci"
  | "build";

export class NormalizeError extends Error {
  constructor(
    message: string,
    public readonly originalMessage: string
  ) {
    super(message);
    this.name = "NormalizeError";
    // Restore prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const CONVENTIONAL_PATTERN =
  /^(feat|fix|docs|chore|refactor|test|ci|build)(\([^)]+\))?!?: .+/;

/**
 * Keyword rules applied in priority order.
 * feat is checked before fix so 'add fix for login bug' → feat, consistent
 * with the shell hook.
 */
const TYPE_RULES: Array<{ type: ConventionalType; pattern: RegExp }> = [
  {
    type: "feat",
    pattern: /\b(add|implement|new|create|introduce|support)\b/i,
  },
  {
    type: "fix",
    pattern: /\b(fix|bug|correct|resolve|patch|repair)\b/i,
  },
  {
    type: "docs",
    pattern: /\b(doc|docs|document|readme|comment|jsdoc|tsdoc)\b/i,
  },
  {
    type: "refactor",
    pattern: /\b(refactor|restructure|reorganize|rename|move|extract)\b/i,
  },
  {
    type: "test",
    pattern: /\b(test|spec|coverage|mock|stub|snapshot)\b/i,
  },
  {
    type: "ci",
    pattern: /\b(ci|pipeline|workflow|github.?action|travis|circleci)\b/i,
  },
  {
    type: "build",
    pattern: /\b(build|webpack|rollup|vite|esbuild|babel|compile|bundle)\b/i,
  },
  {
    type: "chore",
    pattern:
      /\b(update|upgrade|bump|improve|change|remove|delete|clean|format|lint|style)\b/i,
  },
];

/**
 * Infer a conventional commit type from free-form message text.
 * Returns null if no type can be inferred.
 */
export function inferType(subject: string): ConventionalType | null {
  for (const { type, pattern } of TYPE_RULES) {
    if (pattern.test(subject)) {
      return type;
    }
  }
  return null;
}

/**
 * Normalize a raw commit message to Conventional Commits format.
 *
 * - If the message already matches, it is returned unchanged.
 * - If a type can be inferred from keywords, the message is prefixed.
 * - Otherwise a NormalizeError is thrown.
 *
 * @param rawMessage Full commit message (may include body/trailers).
 * @returns Normalized commit message string.
 * @throws {NormalizeError} When the message cannot be normalized.
 */
export function normalizeMessage(rawMessage: string): string {
  const lines = rawMessage.split("\n");
  const firstLine = lines[0].trim();

  // Already valid → return as-is
  if (CONVENTIONAL_PATTERN.test(firstLine)) {
    return rawMessage;
  }

  const inferred = inferType(firstLine);
  if (!inferred) {
    throw new NormalizeError(
      `Commit message does not follow Conventional Commits format and could not be normalized.\n` +
        `  Message: ${firstLine}\n` +
        `  Expected: <type>(<scope>): <subject>\n` +
        `  Valid types: feat, fix, docs, chore, refactor, test, ci, build`,
      rawMessage
    );
  }

  const normalizedFirst = `${inferred}: ${firstLine}`;
  const rest = lines.slice(1);
  return rest.length > 0
    ? [normalizedFirst, ...rest].join("\n")
    : normalizedFirst;
}

// ESM-compatible main-module check
const isMain = import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  const input = process.argv[2] ?? "";
  if (!input) {
    console.error("Usage: tsx scripts/normalize-commit-msg.ts '<message>'");
    process.exit(1);
  }
  try {
    const result = normalizeMessage(input);
    console.log(result);
  } catch (err) {
    if (err instanceof NormalizeError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

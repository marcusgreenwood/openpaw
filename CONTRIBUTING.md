# Contributing

## Commit Message Format

This project enforces [Conventional Commits](https://www.conventionalcommits.org/) via commitlint. All commits must follow this format:

```
<type>(<optional scope>): <subject>
```

### Allowed Types

| Type       | Use for                                      |
|------------|----------------------------------------------|
| `feat`     | A new feature                                |
| `fix`      | A bug fix                                    |
| `chore`    | Build process, tooling, or dependency updates|
| `docs`     | Documentation changes only                  |
| `style`    | Formatting, whitespace (no logic change)     |
| `refactor` | Code restructuring without behavior change   |
| `perf`     | A performance improvement                    |
| `test`     | Adding or updating tests                     |
| `ci`       | CI/CD configuration changes                  |
| `build`    | Build system changes                         |
| `revert`   | Revert a previous commit                     |

### Rules

- Subject line must not exceed **100 characters**
- Use **imperative mood** ("add feature" not "added feature")
- Do not end the subject with a period

### Examples

```
feat: add streaming support for Claude responses
fix: resolve token count overflow on long conversations
chore: update @ai-sdk/anthropic to v3.1.0
docs: add API usage examples to README
refactor: extract message formatting into utility function
test: add unit tests for streaming parser
```

### Multi-line Commits

For more context, add a blank line after the subject and write a body:

```
feat(chat): add message retry on network failure

Automatically retries failed messages up to 3 times with
exponential backoff. Users see a loading indicator during retry.
```

### Trailers

Trailers go at the end of the body, one per line, after a blank line:

```
Nightshift-Task: <task-id>
Nightshift-Ref: https://github.com/marcus/nightshift
Co-Authored-By: Name <email@example.com>
BREAKING CHANGE: <what broke and how to migrate>
```

Mark a breaking change with `!` before the colon (`feat(api)!: ...`) as well as the `BREAKING CHANGE:` trailer.

## Automatic Normalization

Before commitlint validates your message, a `prepare-commit-msg` hook fixes what it safely can:

| Problem | Fix |
|---------|-----|
| No type (`Add dark mode`) | Infers one from keywords → `feat: add dark mode` |
| Uppercase type or scope (`Feat(API): ...`) | Lowercases → `feat(api): ...` |
| Capitalized subject (`feat: Add dark mode`) | Lowercases the first word |
| Trailing period (`feat: add dark mode.`) | Strips it |
| Empty scope (`feat(): ...`) | Drops the parentheses |
| Missing space (`feat:add`) | Inserts it |
| Body on the line right after the subject | Inserts the blank line |

It explains each rewrite on stderr, and (when an editor opens) in a comment at the top of the message. Anything it cannot fix — an over-length subject, an unrecognizable subject — is left for commitlint to reject.

The normalizer is `scripts/normalize-commit-msg.mjs`. It is zero-dependency Node and reads its type list and length limit straight from `commitlint.config.js`, so the two can never disagree. Its tests run with `npm run test:commit-msg`.

### Validation

The `commit-msg` hook runs `commitlint` automatically on every commit.
If your commit message is invalid, the commit is rejected with an error explaining what needs to be fixed.

Hooks are installed by `npm install` (via the `prepare` script). To install them explicitly:

```bash
npx husky
```

CI re-checks every commit on a pull request (`.github/workflows/commit-lint.yml`), so skipping the hook locally does not skip enforcement.

### Exemptions and opting out

Exempt automatically, with no configuration: merge commits, revert commits, and `fixup!` / `squash!` / `amend!` commits.

To skip deliberately — note that the two hooks are skipped by different switches, because git does not treat `prepare-commit-msg` as a verification hook:

```bash
# Skip the normalizer only; commitlint still validates.
SKIP_COMMIT_LINT=1 git commit -m "feat: add a thing"

# Skip commitlint only; the normalizer still rewrites the subject.
git commit --no-verify -m "Add a thing."

# Skip both.
SKIP_COMMIT_LINT=1 git commit --no-verify -m "whatever you like"
```

If Node is not on `PATH`, the normalizer exits without blocking the commit.

### History

Existing history is **not** rewritten — the repo has merged PRs and a shared remote. Only new commits are checked.

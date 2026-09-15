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

### Automatic Normalization

Before commitlint validates, the commit-msg hook runs a zero-dependency
normalizer (`scripts/normalize-commit-msg.mjs`) that auto-fixes deviations it
can repair unambiguously:

- type casing and common aliases (`Feat:` -> `feat:`, `bugfix:` -> `fix:`)
- spacing around the separator (`feat :add x` -> `feat: add x`)
- a capitalized subject (`feat: Add x` -> `feat: add x`)
- a single trailing period (`feat: add x.` -> `feat: add x`)
- common past-tense verbs (`feat: added x` -> `feat: add x`)
- the missing blank line between subject and body

It deliberately will **not**:

- truncate a subject over 100 characters
- invent or guess a type when your message has none
- reword, reflow, or re-case body prose
- touch git trailers (`Co-Authored-By:`, `Signed-off-by:`, `BREAKING CHANGE:`)
  or git-generated `Merge`/`Revert` messages

Anything it cannot safely fix is left exactly as you wrote it, so commitlint
still rejects it with the usual error. Acronyms (`API`), identifiers
(`Next.js`, `lib/foo`, `MAX_RETRIES`) and quoted tokens keep their casing.

To preview without committing, pipe a message through it:

```
echo "Feat: Added the thing." | npm run normalize:commit -- --stdin
```

`--check <file>` exits non-zero if a message would be rewritten, for CI or
dry-run use. The normalizer's behavior is pinned by `npm run test:commit-msg`.

### Validation

The commit-msg hook runs `commitlint` automatically on every commit.
If your commit message is invalid, the commit will be rejected with an error message explaining what needs to be fixed.

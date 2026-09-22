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

### Validation

The commit-msg hook runs `commitlint` automatically on every commit.
If your commit message is invalid, the commit will be rejected with an error message explaining what needs to be fixed.

### Auditing existing history

The commit-msg hook only sees *new* commits. To check what is already in the
history, use the read-only auditor:

```bash
npm run commit:audit                      # audit HEAD, report only
npm run commit:audit -- --suggest         # also print a proposed conforming subject
npm run commit:audit -- --strict          # exit 1 if any non-ignored commit fails
npm run commit:audit -- --json            # machine-readable output for CI
npm run commit:audit -- HEAD~20..HEAD     # restrict to a range
npm run commit:audit -- --from v1.0.0     # or use --from/--to
```

The auditor pipes each message to the commitlint CLI and reads the allowed types
and subject length from `commitlint.config.js`, so the rules live in exactly one
place. It **never rewrites history and never modifies a file** — `--suggest`
output is advisory text you can copy, nothing more.

Every suggestion is itself piped back through commitlint before it is printed.
The rewrite heuristics are best-effort, so on the rare subject they cannot
repair (an empty or punctuation-only one, say) the output carries a `warning:`
line instead of being presented as a fix.

Results land in three buckets:

- **valid** — passes commitlint.
- **invalid** — fails, with the violated rule names listed.
- **ignored** — merge commits, reverts and `fixup!`/`squash!` commits, which
  commitlint skips by default.

Run the auditor's test suite with:

```bash
npm run test:commit-audit
```

It unit-tests each helper and then round-trips a corpus of real non-conforming
subjects from this repo's history through `--suggest` and back into the
commitlint binary, asserting every suggestion actually passes.

#### Why the legacy commits are left alone

Commitlint was added part-way through this project's life. A dozen commits
reachable from `HEAD` predate it and do not conform — for example
`Initial commit from Create Next App` and
`Add agent memory feature powered by Minns Memory Layer`. These are intentionally
**not** being fixed: rewriting merged history would invalidate every existing
clone, branch and pull request for no functional gain. Run
`npm run commit:audit -- --suggest` for the current list.

Because of that baseline, `npm run commit:audit` exits 0 by default — it is a
reporting tool, not a gate. Use `--strict` on a range that starts after
commitlint landed if you want CI to fail on new violations.

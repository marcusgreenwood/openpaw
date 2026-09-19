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

## Pull Request Titles

Pull requests are merged through GitHub, so **the pull request title — not any
individual commit on your branch — becomes the subject line that lands on
`main`** under a squash or merge commit. The `commit-msg` hook and the
`commitlint` script only ever inspect branch commits, which is why subjects like
`Merge pull request #6 from marcusgreenwood/lint-fix/auto-fix-linting-errors`
and `Revamp skills manager: installed skills list with edit/delete` are already
in the history.

Pull request titles are therefore held to exactly the same Conventional Commits
rules as individual commits, from the same `commitlint.config.js`:

```
<type>(<optional scope>): <subject>
```

| Instead of                            | Title it                                        |
|---------------------------------------|-------------------------------------------------|
| `Feat/commit normalize`               | `feat(commit-msg): normalize commit messages`    |
| `Revamp skills manager`               | `refactor(skills): rework the skills manager UI` |
| `Fix bug`                             | `fix(chat): stop token count overflowing`        |

The `PR Title Lint` workflow re-checks the title on every edit to the pull
request, so a rename is enough to turn the check green — no new commit or push
is required.

To check a title locally before opening the pull request:

```sh
PR_TITLE='feat(ci): lint pull request titles' npm run lint:pr-title
```

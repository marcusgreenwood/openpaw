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

### Commit Template

Running `git commit` without `-m` opens an editor pre-filled with a commented
reminder of the grammar, the allowed types, and the subject rules from the
table above. The template lives in `.gitmessage` and is inserted by the husky
`prepare-commit-msg` hook, which is installed automatically by `npm install`.

Without husky, opt in manually:

```
git config commit.template .gitmessage
```

Every template line starts with `#`, so git strips it and none of it reaches
the commit. The template is guidance only and changes nothing about what is
accepted -- `commitlint` in the `commit-msg` hook still decides pass or fail.
It is skipped for `-m`/`-F`, `--amend`, merges, and squashes, and it never
alters a message you have already written.

### Validation

The commit-msg hook runs `commitlint` automatically on every commit.
If your commit message is invalid, the commit will be rejected with an error message explaining what needs to be fixed.

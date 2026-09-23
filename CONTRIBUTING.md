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

- The header — the whole `type(scope): subject` line, not the subject alone —
  must not exceed **100 characters**. A `feat: ` prefix therefore leaves 94
  characters for the subject, and a `feat(chat): ` prefix leaves 88.
- Use **imperative mood** ("add feature" not "added feature"). This is enforced:

  ```
  # rejected
  feat: added retry handling to the chat client

  # accepted
  feat: add retry handling to the chat client
  ```

  The check only inspects the first word of the subject, and only flags the
  non-imperative inflections of a curated list of verbs — `added`/`adds`/`adding`
  for `add`, and the same three forms for `fix`, `update`, `remove`, `change`,
  `refactor`, `implement`, `create`, `bump`, `rename`, `move`, `improve`,
  `resolve`, `revert`, `drop`, `ship` and `wrap`. The error names the imperative
  replacement. It does not guess from word endings, so subjects like
  `fix: speed up the parser` or `feat: address the stream reader race` pass
  untouched.

  One consequence worth knowing: a subject opening with a plural noun that
  happens to be one of those forms is rejected too — `docs: updates to the
  README` fails and wants `docs: update the README`. That is the house style
  either way, so the rule is left as is.

  To teach it another verb, add the imperative form to `VERBS` in
  `commitlint/imperative-mood.cjs`; all three inflections are derived from it, so
  a verb can never end up half-covered. Verbs needing a doubled consonant or an
  irregular past tense go in the `IRREGULAR` table beside it. Add the verb to
  `EXPECTED_FORMS` in the test file as well — the suite asserts the two lists
  agree, so a verb added in only one place fails.
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

The project's custom commitlint rules live in `commitlint/` and have their own
test suite. Run it with:

```
npm run test:commitlint-rules
```

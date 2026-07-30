# Contributing

## Commit message standard

This repo uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). The
format was already the de-facto convention in the history (`feat:`, `fix:`, `docs:`); it is
now written down and enforced mechanically by a `commit-msg` git hook.

### Grammar

```
<type>(<optional scope>)<!>: <subject>

<optional body>

<optional footer / git trailers>
```

Example:

```
feat(crons): add Run now button to the crons panel

Prompt crons previously had to wait for the next tick. Run now opens a new
session and streams the run immediately.

Nightshift-Task: commit-normalize
Nightshift-Ref: https://github.com/marcus/nightshift
```

### Types

| Type | Meaning |
|------|---------|
| `feat` | a new user-facing feature |
| `fix` | a bug fix |
| `docs` | documentation only |
| `style` | formatting only, no behaviour change |
| `refactor` | restructuring without behaviour change |
| `perf` | a performance improvement |
| `test` | tests only |
| `build` | build system, dependencies, tooling |
| `ci` | CI configuration and scripts |
| `chore` | maintenance that fits nothing else |
| `revert` | reverts a previous commit |

Common aliases (`feature`, `bugfix`, `documentation`, `tests`, …) are auto-mapped to the
canonical type rather than rejected.

### Scope

Optional, lowercase, and taken from the area of the codebase being touched — `chat`, `crons`,
`skills`, `tools`, `deps`, `terminal`, `memory`. Omit it if the change is repo-wide.

### Subject rules

- **72 characters max** for the whole subject line (type prefix included).
- Imperative mood: "add", "fix", "remove" — not "added" or "adds".
- Starts lowercase, unless the first word is an identifier, acronym or filename
  (`AGENTS.md`, `ChatInterface`, `README` are all left alone).
- No trailing period — and no trailing ellipsis either. The hook strips the whole trailing
  run of `.`, so `feat: add thing...` becomes `feat: add thing`.
- Exactly one space after the colon.

### Body and footer

- Separate the subject from the body with a **blank line**.
- Wrap body lines at 100 characters (a longer line is a warning, not an error).
- Git trailers go in the final paragraph, one `Key: value` per line — `Co-Authored-By`,
  `Signed-off-by`, `Nightshift-Task`, `Nightshift-Ref`, `Closes`, `Refs`. The trailer block is
  never rewritten by the hook.
- A paragraph counts as the trailer block only when **every** line of it is a `Key: value`
  trailer or an indented continuation. That is deliberate: a closing prose paragraph opening
  with a hyphenated word (`Non-obvious: ...`, `Follow-up: ...`) stays body text instead of
  being misread as a broken trailer block. There is therefore no "malformed trailer block"
  rejection — a paragraph we decline to claim is just prose.

### Breaking changes

Mark them with `!` before the colon, and describe the break in the body or a
`BREAKING CHANGE:` trailer:

```
feat(api)!: drop the legacy session format

BREAKING CHANGE: sessions stored before v0.1 are no longer readable.
```

## Enforcement

### The `commit-msg` hook

`.husky/commit-msg` runs `scripts/commit-msg.mjs` on every commit. It first **auto-fixes** the
safe deviations, rewriting the message in place and printing what it changed:

- trims trailing whitespace, collapses runs of blank lines, drops leading/trailing blanks
- lowercases a mis-cased type (`Feat:` → `feat:`)
- maps a type alias to its canonical form (`feature:` → `feat:`)
- inserts the missing space after the colon (`feat:add x` → `feat: add x`)
- strips a trailing period, or run of periods, from the subject
- lowercases the first word of the subject when it is not an identifier or acronym
- inserts the missing blank line between subject and body

Then it **validates** and rejects with exit 1 what it cannot fix safely: a missing or unknown
type, an empty or over-length subject, or an empty scope. It never invents a type — a message
with no type prefix fails rather than being guessed at.

Every rejection is one an author can act on. The rule the two halves share is that anything
the normalizer leaves untouched must also pass validation, so the hook can never bless a
message and then refuse it; `scripts/test-commit-message.mjs` asserts that end to end over a
table of raw messages rather than testing the two halves only in isolation.

Merge, revert, `fixup!`, `squash!` and `amend!` messages are passed through untouched, since
git and its autosquash tooling parse those formats themselves.

### Range linting

```bash
npm run lint:commits                       # origin/main..HEAD
npm run lint:commits -- HEAD~5..HEAD       # any range
npm run lint:commits -- --report-only      # report without failing
```

Useful in CI to check every commit on a PR branch. **Existing history is not rewritten** —
commits from before this standard was introduced will show as `FAIL` when linted, which is
documentation, not a task.

### Tests

```bash
npm run test:commit-msg
```

Unit tests for the normalizer/validator core in `scripts/lib/commit-message.mjs`, using the
built-in `node:test` runner (no extra dependency).

## Bypassing the hook

```bash
SKIP_COMMIT_LINT=1 git commit -m "whatever you need"
```

`HUSKY=0` also disables it. Use sparingly.

## Installing the hooks

`npm install` runs the `prepare` script, which points `core.hooksPath` at the checked-in hooks
and makes them executable. To re-run it by hand:

```bash
npm run prepare
```

It is a deliberate no-op outside a git work tree and when `CI` or `HUSKY=0` is set, so CI
installs and Vercel builds are unaffected. Set `DEBUG_GIT_HOOKS=1` to see why it skipped.

If you already point `core.hooksPath` somewhere of your own, the script leaves it alone and
prints the one command to opt in — `npm install` will not quietly disable your hooks.

Zero new dependencies are involved: the hook, the linter and the tests are all plain Node ESM
scripts run by the Node already required to build the app.

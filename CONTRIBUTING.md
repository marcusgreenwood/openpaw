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

### Inferred types

Most of this repo's history predates the standard and was written without a type at all
("Add agent memory feature", "Update AGENTS.md with …", "Revamp skills manager …"). Rather than
reject that style outright, the hook infers a type from the subject's **leading imperative
verb**:

| Leading verb | Type |
|--------------|------|
| add, adds, introduce, implement, create, support, enable | `feat` |
| fix, fixes, resolve, correct, repair, patch | `fix` |
| document, describe, clarify | `docs` |
| test, cover | `test` |
| optimize, optimise | `perf` |
| refactor, revamp, overhaul, improve, simplify, clean, cleanup, reorganize, restructure, rework, extract | `refactor` |
| update, bump, upgrade, rename, move, remove, delete, drop, sync, pin | `chore` |

Two rules keep this honest:

- A `chore` or `refactor` subject that names **only** documentation paths (`*.md`, `docs/…`,
  `README`) becomes `docs` instead — "Update AGENTS.md with the memory feature" is
  documentation, not maintenance. `feat` is deliberately never promoted this way: "Add
  scheduled tasks … and update README" names one doc and is plainly a feature.
- A first word outside the table is **not guessed at**. The commit is rejected with the list of
  valid types, because a wrong type is worse than an error message — nothing downstream ever
  re-examines it.

Inference only ever *adds* a prefix; it never rewrites the rest of the subject beyond the
casing and punctuation rules below, and it is always reported. If it picks the wrong type, say
so with `git commit --amend`.

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

### Why not commitlint

This repo briefly used [commitlint](https://commitlint.js.org/) for the same job. The rules here
are the same ones; what changed is what happens when a message breaks them.

Commitlint can only say no. Roughly a third of this repo's history has no type prefix at all,
and a validator that rejects `Add agent memory feature` without being able to write
`feat: add agent memory feature` puts the work of satisfying it on every author, every commit —
which is how a hook ends up bypassed rather than used. The normalizer fixes what is mechanically
fixable and reserves rejection for the decisions only a human can make, which is a materially
different experience at the moment of committing.

It also costs nothing: two dependencies (`@commitlint/cli`, `@commitlint/config-conventional`)
and a config file were removed in favour of ~600 lines of plain Node ESM run by the Node already
needed to build the app, with tests. One source of truth for the rules, rather than a config file
and a normalizer that can drift apart.

The one rule that changed value is the subject limit: **72 characters, not 100.** 72 is the
conventional git limit — it is what keeps `git log --oneline` and GitHub's commit list from
truncating. Everything else (the type list, imperative mood, no trailing period) is unchanged.

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
- infers a type for a subject that has none, when the leading verb is in the table above

Then it **validates** and rejects with exit 1 what it cannot fix safely: a type it could
neither read nor infer, an empty or over-length subject, or an empty scope. Note that inference
runs first but is not a way around the length limit: `Add scheduled tasks (crons), prompt crons,
Run now, and update README` becomes a 75-character subject and is rejected for its length, which
is the honest answer — the subject needs shortening, not a prefix.

Every rejection is one an author can act on. The rule the two halves share is that anything
the normalizer leaves untouched must also pass validation, so the hook can never bless a
message and then refuse it; `scripts/test-commit-message.mjs` asserts that end to end over a
table of raw messages rather than testing the two halves only in isolation.

Merge, revert, `fixup!`, `squash!` and `amend!` messages are passed through untouched, since
git and its autosquash tooling parse those formats themselves.

The hook also stands down entirely while git is midway through an operation that writes messages
of its own — a conflicted merge, a rebase, a cherry-pick or a revert, detected from `MERGE_HEAD`,
`CHERRY_PICK_HEAD`, `REVERT_HEAD` and the `rebase-merge`/`rebase-apply` directories. A rebase
replaying a subject written in 2024 must not fail against a standard introduced after it.

Lines beginning with `#`, and everything after git's `>8` scissors line, are left exactly where
they are — never reordered, never reindented. This matters because `#` lines are not always
comments: git only strips them under `--cleanup=strip` (what you get when composing in an
editor), whereas the default for `git commit -m` and `-F` is `--cleanup=whitespace`, which keeps
them as ordinary body content. A `#` in column 1 of the *first* line is therefore treated as a
subject and linted, not as a comment — git's editor template always opens with a blank line, so
a leading `#` is never git's.

The whitespace fixes above are the same ones git's own cleanup applies in either mode, so they
never alter the message that actually gets committed. Any rewrite at all is reported; the hook
will not change your message and say nothing.

### Running it by hand

`scripts/commit-msg.mjs` is the hook, but it is also a small CLI:

```bash
npm run commit:msg -- --check .git/COMMIT_EDITMSG   # validate a file, never write it
printf 'Add thing.\n' | npm run commit:msg -- --stdin  # normalize stdin to stdout
npm run commit:check                                # audit origin/main..HEAD
npm run commit:msg -- --range HEAD~25..HEAD         # audit any range
```

`--stdin` is the quickest way to see what the hook would do to a message:

```console
$ printf 'Feature: Add thing.\n' | node scripts/commit-msg.mjs --stdin
feat: add thing
commit-msg: normalized: lowercased type "Feature" -> "feature"
commit-msg: normalized: mapped type alias "feature" -> "feat"
commit-msg: normalized: removed trailing period from subject
commit-msg: normalized: lowercased first word of subject
```

### Range linting

```bash
npm run lint:commits                       # origin/main..HEAD
npm run lint:commits -- HEAD~5..HEAD       # any range
npm run lint:commits -- --report-only      # report without failing
```

A commit that fails but that the normalizer *could* have fixed is reported as `auto-fixable` with
the subject the hook would have written, which separates "this predates the hook" from "this needs
a human to name a type".

**Enforcement is local-only today.** This repo has no CI (there is no `.github/workflows`), so
nothing checks commit messages on a pull request. The standard is enforced by the `commit-msg`
hook on the machine that makes the commit, which means it applies only to clones that have run
`npm run hooks:install` and can always be bypassed with `SKIP_COMMIT_MSG_HOOK=1`. `lint:commits`
exists so that a future CI job — or a reviewer, by hand — can check a branch in one command; wiring
it to a workflow is left for whoever adds CI to this repo.

**Existing history is not rewritten.** Commits from before this standard was introduced show as
`FAIL`, and that report is documentation of where the line falls, not a task list — rewriting a
shared `main` would break every clone and open PR for a cosmetic gain. Nothing in these scripts
can do it: every mode that touches history is read-only.

### Tests

```bash
npm run test:commit-msg
```

Unit tests for the normalizer/validator core in `scripts/lib/commit-message.mjs`, using the
built-in `node:test` runner (no extra dependency).

## Bypassing the hook

```bash
SKIP_COMMIT_MSG_HOOK=1 git commit -m "whatever you need"
```

`SKIP_COMMIT_LINT=1` and `HUSKY=0` do the same. Use sparingly.

## Installing the hooks

`npm install` runs the `prepare` script, which points `core.hooksPath` at the checked-in hooks
and makes them executable. To install or repair them by hand:

```bash
npm run hooks:install
```

Only `.husky/commit-msg` is tracked. `.husky/_/` — husky's generated shims — is gitignored, and
husky itself is **not** a dependency of this repo: the hook works either way, because both
layouts resolve to the same `.husky/commit-msg`.

It is a deliberate no-op outside a git work tree and when `CI` or `HUSKY=0` is set, so CI
installs and Vercel builds are unaffected. Set `DEBUG_GIT_HOOKS=1` to see why it skipped.

If you already point `core.hooksPath` somewhere of your own, the script leaves it alone and
prints the one command to opt in — `npm install` will not quietly disable your hooks.

Zero new dependencies are involved: the hook, the linter and the tests are all plain Node ESM
scripts run by the Node already required to build the app.

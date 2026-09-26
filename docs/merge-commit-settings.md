# Merge settings and the subject line on `main`

Commit-message tooling (hooks, commitlint, CI) checks the commits on a branch.
It does not decide the subject that lands on `main` when a pull request is merged
through GitHub. The repository's merge settings decide that. This page records
those settings, shows what each merge method writes, and gives the one command
that makes PR titles the subject on `main`.

## Current settings (measured 2026-09-26)

Read with `gh api repos/marcusgreenwood/openpaw` and
`gh repo view --json viewerDefaultMergeMethod`:

| Setting | Value |
|---|---|
| `allow_merge_commit` | `true` |
| `allow_squash_merge` | `true` |
| `allow_rebase_merge` | `true` |
| `merge_commit_title` | `MERGE_MESSAGE` |
| `merge_commit_message` | `PR_TITLE` |
| `squash_merge_commit_title` | `COMMIT_OR_PR_TITLE` |
| `squash_merge_commit_message` | `COMMIT_MESSAGES` |
| `viewerDefaultMergeMethod` | `MERGE` |

## What lands on `main`

Setting meanings are from GitHub's REST reference for
[Update a repository](https://docs.github.com/en/rest/repos/repos#update-a-repository).

| Merge method | Title setting | Subject on `main` |
|---|---|---|
| Merge commit | `MERGE_MESSAGE` (current) | `Merge pull request #N from <owner>/<branch>`; the PR title goes into the body |
| Merge commit | `PR_TITLE` | The PR title |
| Squash | `COMMIT_OR_PR_TITLE` (current) | The commit's subject if the PR has one commit, the PR title if it has more |
| Squash | `PR_TITLE` | The PR title |
| Rebase | n/a | Each branch commit's own subject, unchanged |

These are defaults. Whoever clicks merge can still edit the title in the dialog.

`main`'s own history shows the current row:

| Commit | Subject | Body |
|---|---|---|
| `0ee1e87` | `Merge pull request #6 from marcusgreenwood/lint-fix/auto-fix-linting-errors` | `Lint fix/auto fix linting errors` (the PR title) |
| `85a5b22` | `Merge pull request #5 from marcusgreenwood/feat/commit-normalize` | `Feat/commit normalize` (the PR title) |
| `858b94c` | `Merge pull request #4 from marcusgreenwood/docs/backfill-jsdoc` | `docs: add JSDoc comments to lib/tools, lib/skills, lib/memory, and types` (the PR title) |

commitlint does not fail these subjects. Its default ignore list
(`@commitlint/is-ignored`, `defaultIgnores: true`) skips anything that starts
with `Merge pull request`. For example,
`echo "Merge pull request #6 from ..." | npx commitlint` exits 0. So every check
passes, and the subject on `main` still is not Conventional.

## Recommended settings

Use the PR title as the subject for whichever methods stay enabled:

- **Merge commits:** `merge_commit_title=PR_TITLE` with
  `merge_commit_message=PR_BODY`. GitHub requires `merge_commit_title` whenever
  `merge_commit_message` is set.
- **Squash merges:** `squash_merge_commit_title=PR_TITLE`. Leaving
  `squash_merge_commit_message=COMMIT_MESSAGES` keeps the branch commits'
  bodies and trailers in the squash commit.
- **Optional:** set `allow_merge_commit=false` (and `allow_rebase_merge=false`)
  so squash is the only method. Every PR then adds exactly one commit to `main`,
  and its subject is the PR title.

## Command for the maintainer

This changes shared repository settings. Nothing in this repo runs it. Run it
yourself if you want the new behaviour:

```sh
gh api -X PATCH repos/marcusgreenwood/openpaw \
  -f merge_commit_title=PR_TITLE \
  -f merge_commit_message=PR_BODY \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=COMMIT_MESSAGES
```

To also make squash the only method, add `-F allow_merge_commit=false -F allow_rebase_merge=false`.

Check the result:

```sh
gh api repos/marcusgreenwood/openpaw \
  --jq '{merge_commit_title, merge_commit_message, squash_merge_commit_title, squash_merge_commit_message, allow_merge_commit, allow_squash_merge, allow_rebase_merge}'
```

To undo, run the same PATCH with the values from the "Current settings" table.

## How this fits with the other commit-message work

- **It works with either tooling choice.** Whether the repo keeps commitlint or
  adopts the zero-dependency normalizer, both check branch commits only. Neither
  sees the subject GitHub writes at merge time. This setting controls that
  subject, so it applies either way.
- **It makes PR title linting effective.** The open PR that lints pull request
  titles against the commitlint config only protects `main` if the PR title
  becomes the subject. With the current settings the PR title goes into the body
  of a merge commit, and a one-commit squash uses the commit subject instead. With
  the settings above, the checked title is the subject that lands.

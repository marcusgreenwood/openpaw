# Commit-message tooling: merge plan for the open PRs

Eight open PRs each standardize one part of commit messages. None of them can
merge cleanly until the maintainer makes one decision, and most of them conflict
with each other. This document records which PR owns which part, what conflicts
were measured, the decision, and a merge order for each outcome.

It adds no tooling and changes no repository settings.

Measured on 2026-10-10 against `origin/main` at `0ee1e87`. Every conflict below
comes from `git merge-tree --write-tree --name-only origin/<a> origin/<b>`.
Re-run the script in [Reproducing the measurements](#reproducing-the-measurements)
before you act on this plan, because each merge changes the results.

## The PRs and what each one owns

| PR | Branch | Part it owns |
| --- | --- | --- |
| [#10](https://github.com/marcusgreenwood/openpaw/pull/10) | `nightshift/commit-message-normalizer` | Replaces commitlint with a zero-dependency normalizer and linter (`scripts/commit-msg.mjs`, `scripts/lint-commits.mjs`). Deletes `commitlint.config.js` and both `@commitlint/*` devDependencies. |
| [#13](https://github.com/marcusgreenwood/openpaw/pull/13) | `nightshift/commit-msg-ci` | CI: `.github/workflows/commit-lint.yml` runs `npm run lint:commits` over the PR's commit range. |
| [#16](https://github.com/marcusgreenwood/openpaw/pull/16) | `nightshift/commit-normalize-hook` | Auto-fixes safe deviations in `.husky/commit-msg` *before* commitlint runs, which stays the gate. |
| [#18](https://github.com/marcusgreenwood/openpaw/pull/18) | `nightshift/commit-template` | Guidance while you write: `.gitmessage` plus `.husky/prepare-commit-msg`. Not a rewriter. |
| [#20](https://github.com/marcusgreenwood/openpaw/pull/20) | `nightshift/commit-normalize-pr-title` | CI: `.github/workflows/pr-title-lint.yml` lints the PR title with `npm run lint:pr-title`. |
| [#23](https://github.com/marcusgreenwood/openpaw/pull/23) | `nightshift/commit-audit` | Read-only audit of existing history (`npm run commit:audit`). |
| [#24](https://github.com/marcusgreenwood/openpaw/pull/24) | `nightshift/commit-policy-enforcement` | Policy: the imperative-mood rule, the real header-length budget, and fixes to `CONTRIBUTING.md`. |
| [#26](https://github.com/marcusgreenwood/openpaw/pull/26) | `nightshift/commit-normalize-merge-settings` | Docs only: explains how the repo's merge settings decide the subject that lands on `main`. |

Related but outside this group:
[#11](https://github.com/marcusgreenwood/openpaw/pull/11)
(`fix/husky-prepare-install`) adds `husky` to devDependencies so `npm ci`
works with `prepare: husky`.

## Measured conflicts

All nine branches apply cleanly to `origin/main` on their own. Pairwise:

| | #10 | #11 | #13 | #16 | #18 | #20 | #23 | #24 | #26 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **#10** | — | clean | C P | H C P | C P | C P | C P | C L P | clean |
| **#11** | | — | clean | clean | clean | clean | clean | clean | clean |
| **#13** | | | — | P | clean | C P | C P | C P | clean |
| **#16** | | | | — | C | P | P | P | clean |
| **#18** | | | | | — | clean | clean | clean | clean |
| **#20** | | | | | | — | C P | C P | clean |
| **#23** | | | | | | | — | C P | clean |
| **#24** | | | | | | | | — | clean |

Conflicted files: **C** = `CONTRIBUTING.md`, **P** = `package.json`,
**H** = `.husky/commit-msg`, **L** = `commitlint.config.js`.

What the matrix shows:

- **#11 and #26 are clean against everything.** They can merge at any time.
- **#18 conflicts only with #10 and #16.**
- **Most `package.json` conflicts happen because PRs append to the same spot.**
  On `main`, `"commitlint"` is the last entry in `scripts`. #13, #16, #20, #23
  and #24 each add a comma to that line and append their own keys after it.
  #10 removes that line. These conflicts are mechanical: on rebase, keep both
  sides.
- **Most `CONTRIBUTING.md` conflicts happen because each PR adds its own section
  at the same place.** These are also mechanical, except where #10 rewrites the
  file (288 changed lines).

### Real key collisions (not just neighboring lines)

| Key / file | Claimed by | Note |
| --- | --- | --- |
| `scripts.test:commit-msg` | #10, #16 | Same key, different test files. They can't both land as-is. |
| `scripts.lint:commits` | #10, #13 | #10: `node scripts/lint-commits.mjs`. #13: `commitlint --from origin/${COMMITLINT_BASE:-main} --to HEAD --verbose`. Same name, so #13's workflow runs whichever one wins. |
| `scripts.commitlint` | #10 removes it; the others keep it | |
| `scripts.prepare` | #10 (`node scripts/install-git-hooks.mjs`), `main` (`husky`) | #11 only matters while `prepare` is `husky`. |
| `devDependencies.@commitlint/*` | #10 removes them | #16, #20, #23 and #24 call the commitlint CLI or load its config. |
| `.husky/commit-msg` | #10, #16 | Both rewrite the hook body. |
| `commitlint.config.js` | #10 deletes it, #24 edits it | Read at runtime by #20 (`--config`) and #23 (`require`). |
| Workflow filenames | #13 `commit-lint.yml`, #20 `pr-title-lint.yml` | No collision. |

The other keys are unique to one PR: `commit:msg`, `commit:check` and
`hooks:install` (#10); `normalize:commit` (#16); `test:commit-template` (#18);
`lint:pr-title` (#20); `commit:audit` and `test:commit-audit` (#23);
`test:commitlint-rules` and `engines` (#24).

## The one decision: #10's normalizer or commitlint

`main` enforces commits with commitlint (merged in #5). #10 replaces commitlint
with its own normalizer and linter. Everything else depends on this choice.

### If commitlint stays

- **Close #10.**
- Keep the rest. #13, #16, #18, #20, #23 and #24 were all written against
  commitlint, and none of them needs rework.
- Merge #11 so `npm ci` works with `prepare: husky`.

### If #10 wins

- **Close #16.** It is a pre-commitlint fixer and has nothing to wrap once
  commitlint is gone. It also collides with #10 on `test:commit-msg` and
  `.husky/commit-msg`.
- **#24: keep part of it.** Drop the config half (`commitlint/imperative-mood.cjs`,
  the `commitlint.config.js` edit and the `eslint.config.mjs` override). Keep its
  `CONTRIBUTING.md` corrections. Port its curated list of non-imperative verbs
  into #10's `scripts/lib/commit-message.mjs`.
- **#13:** keep the workflow but drop its `lint:commits` script line. #10
  already defines `lint:commits` (`node scripts/lint-commits.mjs`, default range
  `origin/main..HEAD`), so the workflow ends up calling #10's linter.
- **#20:** point `lint:pr-title` at #10's checker instead of `commitlint
  --config commitlint.config.js`. For example, write the title to a temp file
  and run `node scripts/commit-msg.mjs --check <file>`.
- **#23: rework it or close it.** It `require`s `commitlint.config.js` and pipes
  each message to the commitlint CLI, so it breaks once #10 deletes both. #10's
  `commit:check` (`commit-msg.mjs --range`) already covers a read-only history
  audit.
- **Close #11.** #10 changes `prepare` to `node scripts/install-git-hooks.mjs`
  and does not use husky, so adding the dependency no longer fixes anything.
- #18 and #26 are unaffected.

## Recommended merge order

General rule: merge the PRs that conflict with nothing first. Merge the PRs that
change `CONTRIBUTING.md` and `package.json` last, one at a time. Rebase each one
on the new `main` before merging it, and keep both sides of each appended
section or key.

### If commitlint stays

1. **#26.** Clean with everything. Then run the maintainer action below, so every
   later merge lands with a conventional subject.
2. **#11.** Clean with everything. Fixes `npm ci`.
3. **#24.** Policy first, so the CI checks that follow enforce the corrected rules.
4. **#18.** It conflicts with nothing that is still open except #16.
5. **#13**, then **#20**. The CI gates. Rebase #20 after #13 lands.
6. **#23.** The read-only audit. Rebase it after #20.
7. **#16** last. It conflicts with five of the PRs before it (`package.json`,
   plus `CONTRIBUTING.md` with #18), so it is cheapest to rebase once, at the end.

### If #10 wins

1. **#26**, then the maintainer action below.
2. **#10.** Merge it before anything that touches `package.json` or
   `CONTRIBUTING.md`, because it rewrites both.
3. **#18.** Rebase it onto #10. The conflicts are in `CONTRIBUTING.md` and `package.json` only.
4. **#13** without its `lint:commits` line, then **#20** pointed at #10's checker.
5. **#24**, cut down to its `CONTRIBUTING.md` fixes and the verb list ported into #10.
6. Close **#16** and **#11**. Close **#23** too, unless someone reworks it onto #10.

## Maintainer action: merge settings (from #26)

This step is documented here and was **not** run. It changes shared repository
settings, so the maintainer has to apply it.

With the current settings (`merge_commit_title=MERGE_MESSAGE`), a merge commit
gets the subject `Merge pull request #N from ...`, whatever the PR title is.
That is why #20's PR-title check only has an effect after this change:

```sh
gh api -X PATCH repos/marcusgreenwood/openpaw \
  -f merge_commit_title=PR_TITLE \
  -f merge_commit_message=PR_BODY \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=COMMIT_MESSAGES
```

See `docs/merge-commit-settings.md` in #26 for the current values and how to undo
the change.

## Reproducing the measurements

Run with bash (zsh does not word-split `$branches`):

```bash
git fetch origin
branches="nightshift/commit-message-normalizer fix/husky-prepare-install
nightshift/commit-msg-ci nightshift/commit-normalize-hook nightshift/commit-template
nightshift/commit-normalize-pr-title nightshift/commit-audit
nightshift/commit-policy-enforcement nightshift/commit-normalize-merge-settings"
for a in $branches; do
  for b in $branches; do
    [[ "$a" < "$b" ]] || continue
    if out=$(git merge-tree --write-tree --name-only "origin/$a" "origin/$b"); then
      echo "$a x $b: clean"
    else
      echo "$a x $b: $(echo "$out" | sed -n '2,/^$/p' | tr '\n' ' ')"
    fi
  done
done
```

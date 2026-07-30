#!/usr/bin/env node
/**
 * Unit tests for the commit-message core. Uses only node:test + node:assert,
 * so no new dependency is needed. Run with: npm run test:commit-msg
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  EXAMPLES,
  MAX_SUBJECT_LENGTH,
  isExemptMessage,
  normalizeCommitMessage,
  splitCommitMessage,
  validateCommitMessage,
} from "./lib/commit-message.mjs";

const normalize = (raw) => normalizeCommitMessage(raw).text;
const subjectOf = (raw) => normalize(raw).split("\n")[0];

// ---------------------------------------------------------------------------
// Valid messages
// ---------------------------------------------------------------------------

test("accepts a plain subject", () => {
  assert.equal(validateCommitMessage("feat: add voice mode input component").ok, true);
});

test("accepts a scoped subject", () => {
  assert.equal(validateCommitMessage("fix(crons): stop double-firing prompt crons").ok, true);
});

test("accepts a breaking-change marker, with and without scope", () => {
  assert.equal(validateCommitMessage("feat!: drop legacy session format").ok, true);
  assert.equal(validateCommitMessage("feat(api)!: drop legacy session format").ok, true);
});

test("accepts a subject, body and trailer block", () => {
  const raw = [
    "build: add commit message normalizer",
    "",
    "Adds a commit-msg hook plus a range linter.",
    "",
    "Nightshift-Task: commit-normalize",
    "Nightshift-Ref: https://github.com/marcus/nightshift",
    "",
  ].join("\n");
  const result = validateCommitMessage(raw);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test("accepts identifiers and acronyms as the first subject word", () => {
  assert.equal(validateCommitMessage("docs: AGENTS.md gains a commit section").ok, true);
  assert.equal(validateCommitMessage("refactor: ChatInterface splits out InputBar").ok, true);
  assert.equal(validateCommitMessage("fix: README link to CONTRIBUTING.md").ok, true);
});

// ---------------------------------------------------------------------------
// Splitting
// ---------------------------------------------------------------------------

test("splitCommitMessage separates subject, body, trailers and comments", () => {
  const raw = [
    "feat: add thing",
    "",
    "Body line one.",
    "Body line two.",
    "",
    "Co-Authored-By: Someone <someone@example.com>",
    "# Please enter the commit message for your changes.",
    "# On branch main",
    "",
  ].join("\n");
  const parts = splitCommitMessage(raw);
  assert.equal(parts.subject, "feat: add thing");
  assert.deepEqual(parts.body, ["Body line one.", "Body line two."]);
  assert.deepEqual(parts.trailers, ["Co-Authored-By: Someone <someone@example.com>"]);
  assert.equal(parts.comments.length, 2);
});

test("a prose paragraph starting with a bare word is not mistaken for trailers", () => {
  const parts = splitCommitMessage("fix: thing\n\nNote: revisit\nlater on\n");
  assert.deepEqual(parts.trailers, []);
  assert.deepEqual(parts.body, ["Note: revisit", "later on"]);
});

test("a closing paragraph opening with a hyphenated word is prose, not trailers", () => {
  // The hyphen rule alone would claim these; requiring the whole paragraph to
  // parse is what keeps ordinary prose out of the trailer block.
  for (const opener of ["Non-obvious", "Follow-up", "Side-effect", "Long-term"]) {
    const raw = `feat: add thing\n\nsome body\n\n${opener}: the hook rewrites the file in\nplace, so the editor must reload it.\n`;
    const parts = splitCommitMessage(raw);
    assert.deepEqual(parts.trailers, [], `${opener} was claimed as a trailer block`);
    assert.equal(parts.body.at(-1), "place, so the editor must reload it.");
    assert.deepEqual(validateCommitMessage(raw).errors, [], `${opener} failed validation`);
  }
});

test("an indented continuation line stays part of the trailer block", () => {
  const raw = "feat: add thing\n\nBREAKING CHANGE: sessions stored before v0.1\n  are no longer readable.\n";
  const parts = splitCommitMessage(raw);
  assert.deepEqual(parts.trailers, [
    "BREAKING CHANGE: sessions stored before v0.1",
    "  are no longer readable.",
  ]);
});

// ---------------------------------------------------------------------------
// Normalization rules
// ---------------------------------------------------------------------------

test("lowercases a mis-cased type", () => {
  assert.equal(subjectOf("Feat: add thing"), "feat: add thing");
  assert.equal(subjectOf("FIX: repair thing"), "fix: repair thing");
});

test("maps type aliases onto canonical types", () => {
  assert.equal(subjectOf("feature: add thing"), "feat: add thing");
  assert.equal(subjectOf("bugfix: repair thing"), "fix: repair thing");
  assert.equal(subjectOf("documentation: describe thing"), "docs: describe thing");
});

test("leaves a legitimate scope untouched", () => {
  assert.equal(subjectOf("chore(deps): bump next to 16.1.6"), "chore(deps): bump next to 16.1.6");
});

test("inserts the missing space after the colon", () => {
  assert.equal(subjectOf("feat:add thing"), "feat: add thing");
  assert.equal(subjectOf("feat:   add thing"), "feat: add thing");
});

test("strips a trailing period from the subject", () => {
  assert.equal(subjectOf("feat: add thing."), "feat: add thing");
});

test("strips a trailing ellipsis too, so normalize and validate agree", () => {
  assert.equal(subjectOf("feat: add thing..."), "feat: add thing");
  assert.equal(subjectOf("fix: handle the thing.."), "fix: handle the thing");
});

test("lowercases a capitalized first word but not an identifier", () => {
  assert.equal(subjectOf("feat: Add thing"), "feat: add thing");
  assert.equal(subjectOf("docs: AGENTS.md gains a section"), "docs: AGENTS.md gains a section");
  assert.equal(subjectOf("refactor: ChatInterface split"), "refactor: ChatInterface split");
});

test("normalizes the combined worst case", () => {
  const { text, changes } = normalizeCommitMessage("Feat:Add thing.\n");
  assert.equal(text, "feat: add thing\n");
  assert.ok(changes.length >= 3, `expected several changes, got ${JSON.stringify(changes)}`);
});

test("inserts the blank line between subject and body", () => {
  const { text, changes } = normalizeCommitMessage("feat: add thing\nthe body\n");
  assert.equal(text, "feat: add thing\n\nthe body\n");
  assert.ok(changes.includes("inserted blank line between subject and body"));
});

test("trims trailing whitespace and collapses blank runs", () => {
  const { text } = normalizeCommitMessage(
    "feat: add thing\n\n\n\nbody one   \n\n\n\nbody two\t\n\n\n",
  );
  assert.equal(text, "feat: add thing\n\nbody one\n\nbody two\n");
});

test("never invents a type when none is present", () => {
  const { text } = normalizeCommitMessage("random subject with no type\n");
  assert.equal(text, "random subject with no type\n");
  assert.equal(validateCommitMessage(text).ok, false);
});

test("normalization is idempotent", () => {
  const inputs = [
    "Feat:Add thing.\n",
    "feat: add thing\nthe body\n",
    "feat: add thing\n\n\nbody   \n\n\nNightshift-Task: commit-normalize\n",
    "random subject with no type\n",
    "Merge branch 'main' into feature\n",
    "feat: add thing\n",
  ];
  for (const input of inputs) {
    const once = normalize(input);
    assert.equal(normalize(once), once, `not idempotent for ${JSON.stringify(input)}`);
  }
});

// ---------------------------------------------------------------------------
// Trailer preservation
// ---------------------------------------------------------------------------

test("preserves the Nightshift trailer block byte-for-byte", () => {
  const trailers = [
    "Nightshift-Task: commit-normalize",
    "Nightshift-Ref: https://github.com/marcus/nightshift",
    "Co-Authored-By: Someone <someone@example.com>",
  ];
  const raw = `Feat:Add Normalizer.\n\n\nSome body.\n\n${trailers.join("\n")}\n`;
  const { text } = normalizeCommitMessage(raw);
  assert.ok(text.includes(`\n${trailers.join("\n")}\n`), text);
  assert.equal(text.split("\n")[0], "feat: add Normalizer");
  assert.equal(validateCommitMessage(text).ok, true);
});

test("preserves comment lines verbatim and keeps them out of the body", () => {
  const raw = "feat: add thing\n# On branch main\n# Changes to be committed:\n";
  const { text } = normalizeCommitMessage(raw);
  assert.ok(text.includes("# On branch main"));
  assert.ok(text.includes("# Changes to be committed:"));
  assert.equal(text.split("\n")[0], "feat: add thing");
  assert.equal(validateCommitMessage(text).ok, true);
});

// ---------------------------------------------------------------------------
// Rejections
// ---------------------------------------------------------------------------

test("rejects an unknown type", () => {
  const { ok, errors } = validateCommitMessage("wip: half-finished thing");
  assert.equal(ok, false);
  assert.match(errors.join("\n"), /unknown type "wip"/);
});

test("suggests the canonical type for a known alias", () => {
  const { errors } = validateCommitMessage("feature: add thing");
  assert.match(errors.join("\n"), /did you mean "feat"/);
});

test("rejects a missing type", () => {
  const { ok, errors } = validateCommitMessage("Add a 3D cat avatar");
  assert.equal(ok, false);
  assert.match(errors.join("\n"), /missing a "<type>: " prefix/);
});

test("rejects an over-length subject", () => {
  const subject = `feat: ${"x".repeat(MAX_SUBJECT_LENGTH)}`;
  const { ok, errors } = validateCommitMessage(subject);
  assert.equal(ok, false);
  assert.match(errors.join("\n"), /keep it to 72 or fewer/);
});

test("rejects a trailing period and an uppercase first word", () => {
  const { errors } = validateCommitMessage("feat: Add thing.");
  assert.match(errors.join("\n"), /must not end with a period/);
  assert.match(errors.join("\n"), /must start lowercase/);
});

test("rejects an empty description and an empty scope", () => {
  assert.match(validateCommitMessage("feat:").errors.join("\n"), /description is empty/);
  assert.match(validateCommitMessage("feat(): add thing").errors.join("\n"), /parentheses are empty/);
});

test("rejects a missing space after the colon", () => {
  assert.match(
    validateCommitMessage("feat:add thing").errors.join("\n"),
    /followed by exactly one space/,
  );
});

test("rejects a missing blank line after the subject", () => {
  assert.match(
    validateCommitMessage("feat: add thing\nthe body").errors.join("\n"),
    /separated by a blank line/,
  );
});

test("a final paragraph that does not fully parse is body, not a broken trailer block", () => {
  const raw = "feat: add thing\n\nCo-Authored-By: Someone <s@example.com>\nnot a trailer at all\n";
  const parts = splitCommitMessage(raw);
  assert.deepEqual(parts.trailers, []);
  assert.deepEqual(parts.body, ["Co-Authored-By: Someone <s@example.com>", "not a trailer at all"]);
  assert.equal(validateCommitMessage(raw).ok, true);
});

test("warns but does not fail on long body lines", () => {
  const raw = `feat: add thing\n\n${"x".repeat(140)}\n`;
  const { ok, warnings } = validateCommitMessage(raw);
  assert.equal(ok, true);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /exceeds 100 characters/);
});

// ---------------------------------------------------------------------------
// The composed pipeline — exactly what scripts/commit-msg.mjs runs.
//
// The halves above are tested in isolation, which cannot catch the two of them
// disagreeing: a message the normalizer leaves alone and the validator then
// refuses is an unfixable rejection with no way out but rewording. These cases
// run normalize -> validate together and assert the verdict the author sees.
// ---------------------------------------------------------------------------

/** @returns {{ok: boolean, errors: string[], text: string}} the hook's verdict. */
function hookVerdict(raw) {
  const { text } = normalizeCommitMessage(raw);
  return { ...validateCommitMessage(text), text };
}

const ACCEPTED_BY_HOOK = [
  "feat: add voice mode input component\n",
  "Feat:Add Thing.\n",
  "feature: Add thing\n",
  "fix: handle the thing...\n", // regression: normalizer used to keep "..." and the validator refused it
  "fix: handle the thing..\n",
  "chore(deps): bump next to 16.1.6\n",
  "feat(api)!: drop the legacy session format\n",
  "docs: AGENTS.md gains a commit section\n",
  "feat: add thing\nthe body ran on from the subject\n",
  "feat: add thing\n\n\n\nbody   \n\n\n",
  "feat: add thing\n\nbody\n\nNightshift-Task: commit-normalize\nNightshift-Ref: https://github.com/marcus/nightshift\n",
  // A closing prose paragraph opening with a hyphenated word.
  "feat: add thing\n\nNon-obvious: the hook rewrites the file in place, so\nthe editor must reload it.\n",
  "feat: add thing\n\nFollow-up: wire the range linter into CI.\n",
  "feat: add thing\n# On branch main\n",
  "Merge branch 'main' into feature\n",
  "fixup! feat: add thing\n",
];

const REJECTED_BY_HOOK = [
  "random subject with no type\n",
  "Add a 3D cat avatar\n",
  "wip: half-finished thing\n",
  "feat:\n",
  "feat(): add thing\n",
  "feat: ...\n", // nothing but periods — stripping leaves an empty description
  `feat: ${"x".repeat(MAX_SUBJECT_LENGTH)}\n`,
];

for (const raw of ACCEPTED_BY_HOOK) {
  test(`hook accepts ${JSON.stringify(raw)}`, () => {
    const { ok, errors } = hookVerdict(raw);
    assert.equal(ok, true, `unfixable rejection: ${errors.join("; ")}`);
  });
}

for (const raw of REJECTED_BY_HOOK) {
  test(`hook rejects ${JSON.stringify(raw)}`, () => {
    const { ok, errors } = hookVerdict(raw);
    assert.equal(ok, false, "expected a rejection");
    assert.ok(errors.length > 0, "a rejection must explain itself");
  });
}

test("every accepted message is a fixed point: re-running the hook changes nothing", () => {
  for (const raw of ACCEPTED_BY_HOOK) {
    const once = hookVerdict(raw).text;
    const twice = hookVerdict(once).text;
    assert.equal(twice, once, `not a fixed point: ${JSON.stringify(raw)}`);
  }
});

test("the examples printed in the hook's error output themselves pass the hook", () => {
  for (const example of EXAMPLES) {
    assert.equal(hookVerdict(`${example}\n`).ok, true, `bad example: ${example}`);
  }
});

// ---------------------------------------------------------------------------
// Exemptions
// ---------------------------------------------------------------------------

test("exempts git-generated messages", () => {
  const exempt = [
    "Merge branch 'main' into nightshift/commit-message-normalizer\n",
    "Merge pull request #3 from marcusgreenwood/cursor/dev-setup\n",
    'Revert "feat: add thing"\n\nThis reverts commit abc1234.\n',
    'Reapply "feat: add thing"\n',
    "fixup! feat: add thing\n",
    "squash! feat: add thing\n",
    "amend! feat: add thing\n",
    "",
  ];
  for (const raw of exempt) {
    assert.equal(isExemptMessage(raw), true, `expected exempt: ${JSON.stringify(raw)}`);
    assert.equal(validateCommitMessage(raw).ok, true, `expected valid: ${JSON.stringify(raw)}`);
  }
});

test("exempt messages are passed through untouched", () => {
  const raw = "Merge branch 'main' into feature\n\nSome merge notes.\n";
  assert.equal(normalize(raw), raw);
  assert.deepEqual(normalizeCommitMessage(raw).changes, []);
});

test("a real revert type is still linted", () => {
  assert.equal(isExemptMessage("revert: undo the thing"), false);
  assert.equal(validateCommitMessage("revert: undo the thing").ok, true);
});

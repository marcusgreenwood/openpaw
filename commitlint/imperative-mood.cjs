/**
 * commitlint rule: subject-imperative-mood
 *
 * CONTRIBUTING.md documents imperative mood as a rule, but nothing enforced it —
 * `feat: added a thing` passed with exit 0. This closes that gap.
 *
 * Deliberately NOT a suffix heuristic. Matching on -ed/-s/-ing would reject
 * legitimate imperative subjects (`fix: speed up parser`, `feat: add windows
 * support`) and noun phrases. Instead this matches a curated list of known
 * non-imperative forms of verbs that actually show up in commit subjects, keyed
 * to their imperative form so the error can name the replacement.
 */

/** Known non-imperative leading words -> the imperative form to use instead. */
const NON_IMPERATIVE = {
  added: 'add',
  adds: 'add',
  adding: 'add',
  fixed: 'fix',
  fixes: 'fix',
  fixing: 'fix',
  updated: 'update',
  updates: 'update',
  updating: 'update',
  removed: 'remove',
  removes: 'remove',
  removing: 'remove',
  changed: 'change',
  changes: 'change',
  changing: 'change',
  refactored: 'refactor',
  refactoring: 'refactor',
  implemented: 'implement',
  implements: 'implement',
  created: 'create',
  creates: 'create',
  bumped: 'bump',
  bumps: 'bump',
  renamed: 'rename',
  renames: 'rename',
  moved: 'move',
  moves: 'move',
  improved: 'improve',
  improves: 'improve',
  resolved: 'resolve',
  resolves: 'resolve',
  reverted: 'revert',
  reverts: 'revert',
};

/**
 * @param {{subject: string | null}} parsed parsed commit from commitlint
 * @returns {[boolean, string?]} commitlint rule outcome
 */
function subjectImperativeMood(parsed) {
  const { subject } = parsed;

  // Empty/missing subject is subject-empty's job to report, not ours.
  if (!subject) {
    return [true];
  }

  // Only the leading word decides mood. Whole-word match, so `address` and
  // `fixture` are untouched even though they begin with listed verbs.
  const leading = subject.trim().split(/\s+/)[0];
  const suggestion = NON_IMPERATIVE[leading.toLowerCase()];

  if (!suggestion) {
    return [true];
  }

  return [
    false,
    `subject must use imperative mood: write "${suggestion}" instead of "${leading}"`,
  ];
}

module.exports = subjectImperativeMood;
module.exports.NON_IMPERATIVE = NON_IMPERATIVE;

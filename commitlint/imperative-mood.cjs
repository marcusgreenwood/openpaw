/**
 * commitlint rule: subject-imperative-mood
 *
 * CONTRIBUTING.md documents imperative mood as a rule, but nothing enforced it —
 * `feat: added a thing` passed with exit 0. This closes that gap.
 *
 * Deliberately NOT a suffix heuristic. Matching on -ed/-s/-ing would reject
 * legitimate imperative subjects (`fix: speed up parser`, `feat: add windows
 * support`) and noun phrases. Instead this works from a curated list of
 * imperative verbs that actually show up in commit subjects, and rejects their
 * non-imperative inflections — keyed back to the imperative form so the error
 * can name the replacement.
 */

/**
 * Imperative verbs this rule knows about. Every verb listed here contributes
 * all three of its non-imperative inflections (past, third person, gerund), so
 * coverage cannot silently miss one form of a verb it already knows.
 */
const VERBS = [
  'add',
  'fix',
  'update',
  'remove',
  'change',
  'refactor',
  'implement',
  'create',
  'bump',
  'rename',
  'move',
  'improve',
  'resolve',
  'revert',
  'drop',
  'ship',
  'wrap',
];

/**
 * Verbs whose inflections the mechanical rules in `inflect` would misspell —
 * anything needing a doubled final consonant or an irregular past tense. A verb
 * added to VERBS that needs `droppped`-style doubling belongs here too.
 */
const IRREGULAR = {
  drop: ['dropped', 'drops', 'dropping'],
  ship: ['shipped', 'ships', 'shipping'],
  wrap: ['wrapped', 'wraps', 'wrapping'],
};

/**
 * Spell the three non-imperative inflections of an imperative verb.
 *
 * @param {string} verb imperative form, e.g. `change`
 * @returns {[string, string, string]} `[past, thirdPerson, gerund]`
 */
function inflect(verb) {
  if (IRREGULAR[verb]) {
    return /** @type {[string, string, string]} */ (IRREGULAR[verb]);
  }

  const stem = verb.endsWith('e') ? verb.slice(0, -1) : verb;
  return [
    verb.endsWith('e') ? `${verb}d` : `${verb}ed`,
    /(?:s|x|z|ch|sh)$/.test(verb) ? `${verb}es` : `${verb}s`,
    `${stem}ing`,
  ];
}

/** Known non-imperative leading words -> the imperative form to use instead. */
const NON_IMPERATIVE = Object.fromEntries(
  VERBS.flatMap((verb) => inflect(verb).map((form) => [form, verb])),
);

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
module.exports.VERBS = VERBS;
module.exports.NON_IMPERATIVE = NON_IMPERATIVE;
module.exports.inflect = inflect;

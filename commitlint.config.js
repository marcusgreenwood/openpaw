// @ts-check
/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'subject-imperative-mood': require('./commitlint/imperative-mood.cjs'),
      },
    },
  ],
  rules: {
    // The 100-character budget covers the whole `type(scope): subject` header,
    // not the subject alone. A previous `subject-max-length: 100` here was
    // inert — any subject long enough to trip it had already failed
    // header-max-length (e.g. a 95-char subject after `feat: ` is a 101-char
    // header). Stated explicitly rather than inherited so the real limit is
    // visible where the docs point.
    'header-max-length': [2, 'always', 100],
    // CONTRIBUTING.md has always documented imperative mood; this enforces it.
    'subject-imperative-mood': [2, 'always'],
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'chore',
        'docs',
        'style',
        'refactor',
        'test',
        'ci',
        'build',
        'revert',
      ],
    ],
  },
};

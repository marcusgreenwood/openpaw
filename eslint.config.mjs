import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Gitignored, agent-generated scratch output. Flat config does not read
    // .gitignore, so these must be listed explicitly -- otherwise a generated
    // file no contributor wrote can fail `npm run lint`. The patterns are
    // anchored at the config root, so real source such as app/api/workspace/
    // is still linted.
    "workspace/**",
    ".claw/**",
    ".openpaw/**",
  ]),
  {
    // Style rules the codebase already satisfies, enabled so regressions are
    // caught at lint time rather than accumulating silently.
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "smart"],
    },
  },
]);

export default eslintConfig;

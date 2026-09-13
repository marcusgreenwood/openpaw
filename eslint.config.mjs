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
    // Gitignored, agent-generated output. Flat config does not read .gitignore,
    // so these have to be listed explicitly. These patterns are anchored at the
    // config root, so real source such as app/api/workspace/ is still linted.
    "workspace/**",
    ".claw/**",
    ".openpaw/**",
    "**/*.tsbuildinfo",
  ]),
]);

export default eslintConfig;

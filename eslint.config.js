// @ts-check -- Check this configuration with TypeScript.

import { createConfig } from "@cravingmaker/eslint-config";
import plugin from "@vitest/eslint-plugin";

export default createConfig(
  {
    ignores: [
      "tests/fixtures/**", // Test inputs, checked by the tests that read them.
    ],
  },
  {
    // Fail on disable directives and inline configs that no longer change a result.
    linterOptions: {
      reportUnusedDisableDirectives: "error",
      reportUnusedInlineConfigs: "error",
    },
    name: "repository/linter-options",
  },
  {
    // Relative imports name the `.ts` file: tsdown bundles the sources, and Node.js type
    // stripping runs the scripts directly, which the compiled `.js` name of NodeNext breaks.
    files: ["**/*.ts"],
    name: "repository/source-extensions",
    rules: {
      "import-x/extensions": [
        "error",
        "ignorePackages",
        {
          js: "always",
          jsx: "always",
          mjs: "always",
          mts: "always",
          ts: "always",
          tsx: "always",
        },
      ],
    },
  },
  {
    // Repository scripts and tests build their paths from the repository layout and from
    // temporary directories that they create, never from untrusted input.
    files: ["scripts/**/*.ts", "tests/**/*.ts"],
    name: "repository/filesystem-paths",
    rules: {
      "security/detect-non-literal-fs-filename": "off",
    },
  },
  {
    // Reports at lint time what `allowOnly: false` and `expect.requireAssertions` report when
    // the tests run, and promises that a test would not wait for.
    files: ["tests/**/*.test.ts"],
    name: "repository/vitest",
    plugins: { vitest: plugin },
    rules: {
      "vitest/no-disabled-tests": "error",
      "vitest/no-focused-tests": ["error", { fixable: false }],
      "vitest/require-awaited-expect-poll": "error",
      "vitest/valid-expect": "error",
      "vitest/valid-expect-in-promise": "error",
    },
  },
);

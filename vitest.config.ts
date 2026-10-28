import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Focused tests fail locally as well as in CI, so a pre-push run cannot skip the suite.
    allowOnly: false,
    // Fixtures are test inputs, never tests.
    exclude: [...configDefaults.exclude, "tests/fixtures/**"],
    // A test that asserts nothing would pass vacuously.
    expect: { requireAssertions: true },
    include: ["tests/**/*.test.ts"],
    // With `unstubEnvs` and `unstubGlobals`, each test starts with the real implementations,
    // environment variables, and globals. Vitest already clears the calls that mocks recorded.
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    // Files read through the filesystem or child processes are outside Vitest's import graph.
    // tests/vitest-config.test.ts checks these mappings.
    watchTriggerPatterns: [
      {
        // The packed-consumer tests pack the build, so a new build reruns them.
        pattern: /(?:^|\/)dist\/index\.(?:d\.mts|mjs)$/u,
        testsToRun: (_filename) => {
          return [
            "tests/package/consumer.test.ts",
            "tests/package/contents.test.ts",
          ];
        },
      },
      {
        pattern: /(?:^|\/)README\.md$/u,
        testsToRun: (_filename) => {
          return [
            "tests/package/consumer.test.ts",
            "tests/repository/versions.test.ts",
          ];
        },
      },
      {
        pattern: /(?:^|\/)(?:\.nvmrc|CONTRIBUTING\.md)$/u,
        testsToRun: (_filename) => {
          return [
            "tests/repository/versions.test.ts",
            "tests/scripts/check-pins.test.ts",
          ];
        },
      },
      {
        pattern: /(?:^|\/)tsconfig\.json$/u,
        testsToRun: (_filename) => {
          return ["tests/repository/versions.test.ts"];
        },
      },
      {
        pattern: /(?:^|\/)package-lock\.json$/u,
        testsToRun: (_filename) => {
          return ["tests/repository/package.test.ts"];
        },
      },
      {
        pattern: /(?:^|\/)\.github\/workflows\/[^/]+\.yml$/u,
        testsToRun: (_filename) => {
          return [
            "tests/repository/versions.test.ts",
            "tests/repository/workflows.test.ts",
            "tests/scripts/check-pins.test.ts",
          ];
        },
      },
      {
        pattern:
          /(?:^|\/)(?:AGENTS|CLAUDE|CLAUDE\.local|CODE_OF_CONDUCT|SECURITY|SUPPORT)\.md$/u,
        testsToRun: (_filename) => {
          return ["tests/repository/files.test.ts"];
        },
      },
      {
        // The account defaults of cravingmaker/.github, which the repository must not shadow.
        pattern:
          /(?:^|\/)\.github\/(?:FUNDING\.yml|ISSUE_TEMPLATE\/[^/]+|PULL_REQUEST_TEMPLATE\.md|pull_request_template\.md)$/u,
        testsToRun: (_filename) => {
          return ["tests/repository/files.test.ts"];
        },
      },
      {
        // The workflow check runs in a child process, which loads these files itself.
        pattern:
          /(?:^|\/)scripts\/(?:actionlint\.ts|actionlint-reference\.json|check-workflows\.ts)$/u,
        testsToRun: (_filename) => {
          return ["tests/scripts/workflow-tool.test.ts"];
        },
      },
    ],
  },
});

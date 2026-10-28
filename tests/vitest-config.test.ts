import { access } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import config from "../vitest.config.ts";

// Each input that Vitest's import graph does not see, and the tests that read it.
const inputs = [
  {
    file: "dist/index.mjs",
    tests: ["tests/package/consumer.test.ts", "tests/package/contents.test.ts"],
  },
  {
    file: "dist/index.d.mts",
    tests: ["tests/package/consumer.test.ts", "tests/package/contents.test.ts"],
  },
  {
    file: "README.md",
    tests: [
      "tests/package/consumer.test.ts",
      "tests/repository/versions.test.ts",
    ],
  },
  {
    file: ".nvmrc",
    tests: [
      "tests/repository/versions.test.ts",
      "tests/scripts/check-pins.test.ts",
    ],
  },
  {
    file: "CONTRIBUTING.md",
    tests: [
      "tests/repository/versions.test.ts",
      "tests/scripts/check-pins.test.ts",
    ],
  },
  { file: "tsconfig.json", tests: ["tests/repository/versions.test.ts"] },
  { file: "package-lock.json", tests: ["tests/repository/package.test.ts"] },
  {
    file: ".github/workflows/zizmor.yml",
    tests: [
      "tests/repository/versions.test.ts",
      "tests/repository/workflows.test.ts",
      "tests/scripts/check-pins.test.ts",
    ],
  },
  { file: "AGENTS.md", tests: ["tests/repository/files.test.ts"] },
  { file: "CLAUDE.md", tests: ["tests/repository/files.test.ts"] },
  { file: "CLAUDE.local.md", tests: ["tests/repository/files.test.ts"] },
  { file: "SECURITY.md", tests: ["tests/repository/files.test.ts"] },
  { file: ".github/FUNDING.yml", tests: ["tests/repository/files.test.ts"] },
  {
    file: ".github/ISSUE_TEMPLATE/bug.yml",
    tests: ["tests/repository/files.test.ts"],
  },
  {
    file: "scripts/actionlint.ts",
    tests: ["tests/scripts/workflow-tool.test.ts"],
  },
  {
    file: "scripts/actionlint-reference.json",
    tests: ["tests/scripts/workflow-tool.test.ts"],
  },
  {
    file: "scripts/check-workflows.ts",
    tests: ["tests/scripts/workflow-tool.test.ts"],
  },
  // Files in the import graph rerun their tests without a pattern.
  { file: "src/index.ts", tests: [] },
  { file: "package.json", tests: [] },
];

const patterns = config.test?.watchTriggerPatterns ?? [];

// The tests that the patterns rerun when `file` changes.
const testsFor = (file: string): ReadonlySet<string> => {
  return new Set(
    patterns.flatMap((pattern) => {
      const match = pattern.pattern.exec(file);
      return match === null ? [] : (pattern.testsToRun(file, match) ?? []);
    }),
  );
};

describe("the watch trigger patterns of Vitest", () => {
  it.each(inputs)("rerun the tests that read $file", ({ file, tests }) => {
    expect(testsFor(file)).toEqual(new Set(tests));
  });

  it("rerun only tests that exist", async () => {
    const targets = new Set(
      inputs.flatMap(({ file }) => {
        return [...testsFor(file)];
      }),
    );

    await Promise.all(
      [...targets].map(async (target) => {
        await expect(
          access(new URL(`../${target}`, import.meta.url)),
        ).resolves.toBeUndefined();
      }),
    );
  });
});
